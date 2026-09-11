# Prontidão para alfa — auditoria e plano de atenção

Data da avaliação: **9 de setembro de 2026**; retomada encerrada localmente em
**10 de setembro de 2026**. Estado: **hardening local concluído; alfa ainda não
aprovada**. As seções 1–9 preservam a auditoria e o checkpoint histórico. **Use a
seção 10 como estado atual**, incluindo as evidências e os aceites que ainda
dependem de ambientes nativos, estado remoto ou autorização do mantenedor.

## Parecer

**Não recomendo lançar a alfa a partir do estado auditado.** Há falhas reproduzidas
de integridade de dados, persistência de segredos, isolamento entre destinos HTTP
e encerramento de processos. Os testes existentes passam localmente, mas não
cobrem todos esses casos; o CI Linux do mesmo commit está vermelho.

Este documento atende à etapa de **analisar e planejar**. Não certifica segurança,
não autoriza publicação e não declara que os problemas foram corrigidos. Nenhuma
auditoria consegue garantir ausência de falhas. A aprovação futura deve se apoiar
em evidências do **commit e dos pacotes realmente distribuídos**.

O relatório contém detalhes de falhas ainda abertas. Revisar sua divulgação antes
de publicá-lo externamente; não inclui credenciais ou dados reais de usuários.

## 1. Base e método

| Item | Base observada |
| --- | --- |
| Código local e `main` remota | `2b3a0137ea36050b602db9d73c057374cf386857` |
| Versão do projeto | `0.2.0-pre-alpha.0`; pacote de desenvolvimento privado |
| Inventário | 414 arquivos rastreados em `src`; 482 arquivos TypeScript/TSX no repositório |
| Ambiente executado | macOS x64, Bun 1.3.14; launcher npm testado com Node 25.2.1 |
| Release publicada | `v0.2.0-pre-alpha.0`, marcada como prerelease, seis arquivos por plataforma e `SHA256SUMS` |
| Commit da tag remota | `d376d4fed91c527c59890979bed7d40611110c66`, anterior à licença Apache e ao ajuste do launcher |
| npm observado | `pre-alpha` e `latest` apontam para `0.2.0-pre-alpha.0`; metadado `UNLICENSED` |
| Repositório | Privado; API de `branches/main` informa `protected: false` |

Foi feita revisão transversal de arquitetura, entradas CLI, fronteiras de
confiança, persistência, execução e cancelamento, operações destrutivas,
distribuição e cobertura automatizada. Os caminhos críticos foram inspecionados
no código e confrontados com as convenções de `AGENTS.md`, README, arquitetura e
planos das ferramentas. Isso **não é revisão formal linha a linha de todos os
arquivos**, pentest de infraestrutura nem medição de cobertura por linha.

As reproduções usaram SQLite e Git descartáveis, valores fictícios, transporte
HTTP simulado ou servidor em loopback e diretórios temporários. Não foram feitas
escritas no GitHub, consultas a bancos reais, alterações no npm, mudanças de
permissão nem encerramentos de processos do usuário. Os processos de prova foram
criados e encerrados pelo próprio teste.

Classificação da evidência:

- **R — reproduzido:** execução isolada confirma o comportamento descrito.
- **C — confirmado no código/estado:** caminho ou configuração observado; o impacto
  depende das condições indicadas.
- **V — validação pendente:** hipótese ou plataforma que ainda precisa de prova.

Prioridades são de liberação, não escores CVSS:

- **P0:** risco de alterar dados/alvos incorretos ou quebrar uma proteção essencial.
- **P1:** bloqueador da alfa no escopo anunciado: segredo, confiança, persistência,
  processo, confiabilidade ou distribuição.
- **P2:** robustez e pendências que exigem correção ou aceitação explícita e limitada.

## 2. Evidências executadas

| Verificação | Resultado | O que não prova |
| --- | --- | --- |
| `bun run check` | Exit 0; typecheck, formato, lint, arquitetura, manutenção e testes executados | Segurança completa ou paridade com outros sistemas |
| Testes unitários/integrações locais | **422 passaram, 6 pulados, 0 falharam**; 49 arquivos | Os seis casos da matriz Docker não rodaram |
| Testes TUI | **85 passaram, 0 falharam**; 10 arquivos | Todos os terminais, sistemas e sequências humanas |
| CI do mesmo SHA | macOS passou; Ubuntu falhou em **dois testes HTTP** | Um outro commit verde não aprova esta `main` |
| `bun audit --json` | Exit 1; dois advisories moderados em `qs` 6.15.3 | Exploração remota demonstrada no Tuiminal |
| Instalação npm em prefixo temporário, com `--ignore-scripts` | Instalou launcher e pacote `darwin-x64` | As outras cinco combinações de OS/arquitetura |
| Launcher instalado, `PATH=/usr/bin:/bin`, Node por caminho absoluto | `--version` e `--help` passaram sem Bun no PATH | Compatibilidade com Node 18 ou o TUI completo do binário |
| CLI compilado: `http run fixture.http --report json` | Exit 0, HTTP 200 e assertion aprovada contra loopback, sem Bun no PATH | Proxy, TLS e APIs externas reais |
| Helper SQLite compilado via IPC | `SELECT 42 AS answer` retornou 42; helper encerrado | Todos os tipos, cancelamentos e drivers |
| Busca por assinaturas de tokens/chaves nos arquivos rastreados atuais | Sem correspondências para os padrões examinados | Ausência de segredos no histórico Git, binários ou formatos não reconhecidos |
| Docker | Daemon indisponível | MySQL, MariaDB e PostgreSQL reais continuam não validados nesta auditoria |

O gate local também emitiu avisos de lint e de React `act(...)`. Não foram
suprimidos. Os avisos de sincronização merecem atenção porque o CI Linux falhou
por a TUI HTTP não estabilizar, mas **a relação causal ainda não foi demonstrada**.

CI inspecionado: [Quality checks do commit auditado](https://github.com/DeividXupon/tuiminal/actions/runs/34403002340).
Falhas: `toggles cookie jar use and exposes it in the prepared preview` e
`confirms insecure TLS for the current target before transport`, em
`tests/tui/http.test.tsx`, durante `settle`.

## 3. Cobertura por superfície

| Superfície | Inspeção e controles encontrados | Pontos a fechar |
| --- | --- | --- |
| Banco | Perfis, chaveiro, classificação SQL, query/grid, staging, transação, histórico, helper e cancelamento; PK e parâmetros usados nas escritas | A01–A03, A09–A11; matriz de drivers |
| Git local | Comandos, árvore/diffs, alvo local, checkout, saída e erros | A10, A12; concorrência local e grandes repositórios |
| Git PR/Issues/Inbox | Transporte `gh` por argumentos/stdin, host e identidade, reautenticação, reconciliação, paginação e fixtures | A12, A16; teste remoto controlado ainda pendente |
| Runner | Descoberta/configuração, autostart, ambiente, grupos/processos, sinais e buffer de logs | A07, A08, A10; árvores de processos em Windows |
| HTTP | Preparação, redirects, cookies, privados, arquivos, histórico, import, reports, captura e download | A04–A06, A09, A10, A13, A16 |
| Free Terminal | Shell, PTY, resize, registro de sessões e fechamento; limites de panes/sessões | A08, A13; validação nativa Windows/Linux |
| App/core/shared | Inicialização, modo isolado, foco/Escape, disposers, i18n, temas, listeners e tutorial | A16; recuperação de drafts e matriz de terminais |
| Instalação/release/dependências | Launcher, helper, manifests, tag, npm, licença, workflow e dependências transitivas | A13–A15 |
| Documentação/arquitetura futura | README, AGENTS, arquitetura e planos confrontados com implementação | Não tratar planos de plugins/HTTP como prova de funcionalidades entregues |

Há boas bases que devem ser preservadas: escrita de Banco opt-in, staging e
confirmação, parâmetros de SQL separados dos valores, senhas de conexão fora do
JSON, transporte `gh` sem interpolação de shell, controle de identidade das ações
remotas, TLS HTTP verificado por padrão, limite de captura de respostas, imports
não suportados mantidos sem execução e testes de foco/listeners. Elas reduzem
risco, mas os achados abaixo mostram onde a proteção não é suficiente.

## 4. Backlog priorizado

| ID | Prioridade | Tema | Evidência |
| --- | --- | --- | --- |
| A01 | P0 | Resultado SQL derivado permite escrever na linha errada | R: SQLite e serviços/modelo |
| A02 | P0 | Classificação “somente leitura” permite comandos com efeitos | R: classificação/SQLite; C: cliente nativo; V: PostgreSQL real |
| A03 | P1 | SQL com segredo fica no histórico em texto puro | R |
| A04 | P1 | Variável HTTP privada fica no histórico persistido | R |
| A05 | P1 | Redirect repassa credencial personalizada para outra origem | R: transporte simulado |
| A06 | P1 | Cookie aceita domínio público amplo demais | R |
| A07 | P1 | Configuração de repositório pode executar autostart sem confiança local | R: parser; C: efeito de montagem |
| A08 | P1 | Free Terminal perde controle de processo que não termina | R |
| A09 | P1 | Escrita fora da raiz por symlink e persistência não atômica | R: HTTP; C: Banco/settings |
| A10 | P1 | Limites visuais não limitam aquisição e buffers | R: SQL/Runner; C: Git/HTTP |
| A11 | P1 | Lote ignora divergência/ausência de linhas no banco | R: zero linhas; C: concorrência |
| A12 | P1 | Checkout aceita falha na verificação de worktree | R |
| A13 | P1 | CI, pacote publicado e suporte anunciado não estão alinhados | R/C; plataformas restantes V |
| A14 | P2 | Dependência transitiva com advisories conhecidos | R: auditoria; alcançabilidade V |
| A15 | P1 | Controles de release e acesso à `main` insuficientemente demonstrados | C |
| A16 | P2 | Falhas residuais, recuperação, conteúdo ativo e UX | C/V |

Todos estavam abertos na entrega da auditoria. O progresso posterior está na seção 8. P2 não significa ignorar: cada risco deve
ser resolvido ou receber uma exceção explícita, com justificativa, responsável e
prazo. Não aprovar exceções genéricas para perda de dados ou exposição de segredos.

### A01 — Escrita a partir de projeção SQL derivada

**Condição/impacto:** em conexão com escrita habilitada, a grade considera o nome
de uma coluna retornada como prova de origem. Uma expressão com alias de PK pode
apontar a edição/exclusão para outro registro, mesmo havendo revisão posterior.

**Prova:** numa tabela descartável com IDs 1 e 2,
`SELECT id + 1 AS id, password FROM users WHERE id=1` foi aceito como editável.
O modelo produziu `{id: 2}` e o serviço de mutação alterou a linha 2. A reprodução
foi no caminho modelo/serviço, não uma sequência completa de teclado da TUI.

**Código:** [query-edit.ts](src/features/database/model/query-edit.ts), funções
`databaseEditableQueryTable`, `databaseQueryResultColumns` e
`databaseQueryResultRowKey`; consumo em
[DatabaseQueryWorkspace.tsx](src/features/database/query/DatabaseQueryWorkspace.tsx).
O teste atual rejeita joins/subqueries, mas não comprova a origem das projeções.

**Plano:** somente habilitar edição quando a origem direta de cada coluna e de
toda a PK estiver comprovada. Expressões, agregações, aliases ambíguos, duplicados
e SQL não compreendido devem falhar de forma fechada. Não tentar resolver isso
apenas acrescentando palavras a uma blacklist.

**Aceite:** regressões com alias de PK, constantes, expressões, agregações,
`DISTINCT`, nomes duplicados e schemas homônimos; nenhuma escrita enviada nesses
casos. SELECTs diretos suportados continuam editáveis. Provar na TUI que o alvo
original não muda entre resultado, staging, revisão e execução.

### A02 — “Somente leitura” não pode depender de prefixo SQL

**Prova:** `previewDatabaseQuery` de um perfil PostgreSQL RO aceita
`EXPLAIN ANALYZE DELETE FROM users` e `SELECT setval('audit_sequence', 100)` com
`mutating: false`. Num SQLite RW descartável, `PRAGMA user_version = 7` também foi
classificado como leitura e efetivamente mudou `user_version` para 7.

**Limite da prova:** não houve execução desses exemplos em PostgreSQL real.
SQLite RO tem proteção nativa; não foi demonstrado bypass desse modo. Para
MySQL/PostgreSQL, a criação do cliente não configura uma sessão/transação RO:
um usuário de banco com permissão de escrita continua sendo uma condição de risco.
`EXPLAIN ANALYZE` executa a instrução, conforme a
[documentação oficial do PostgreSQL](https://www.postgresql.org/docs/16/sql-explain.html).

**Código:** [database.ts](src/features/database/services/database.ts), linhas
1248 (`isReadOnlyEditorQuery`), 1347 (`createNativeClient`) e 1556 (`previewDatabaseQuery`).

**Plano:** proteção nativa por driver e privilégios mínimos no servidor; classificação
conservadora por dialeto para confirmação/histórico. Não oferecer uma garantia RO
que só existe na UI. Diferenciar cancelamento, rollback e efeito desconhecido.

**Aceite:** com credencial RW e opção RO do app, provar que DML, DDL, PRAGMAs de
escrita, funções com efeito, EXPLAIN executável e variantes de comentários/CTEs não
alteram estado. Repetir na matriz MySQL/MariaDB/PostgreSQL/SQLite. No MCP, confirmar
a restrição no servidor, além do filtro do cliente. RW continua exigindo revisão
para todo comando com efeitos, sem classificar alterações como leituras no histórico.

### A03 — Histórico SQL persiste segredos literais

**Prova:** executar um UPDATE com `AUDIT_FAKE_SQL_SECRET` gravou esse valor em
`databases.json`. `executeDatabaseQuery` persiste `plan.sql` em sucesso e SQL/erro
em falha. O mascaramento dos parâmetros de staging não protege SQL ad-hoc.

**Impacto:** credenciais, tokens ou dados privados inseridos no editor podem ir
para disco e backups sem intenção de salvá-los. Permissão `0600` não é criptografia
e não protege de outros processos da mesma conta.

**Código:** [database.ts](src/features/database/services/database.ts), linhas
1460–1554; retenção e serialização de histórico no mesmo módulo.

**Plano:** definir política de histórico seguro para SQL livre, incluindo
desabilitar persistência de conteúdo bruto por padrão ou torná-la opt-in informada;
separar metadados, SQL redigido e conteúdo volátil. SQL redigido não pode ser
silenciosamente reexecutado. Cobrir erros e favoritos, preservando o caráter
explícito de salvar uma query. Oferecer revisão/limpeza do histórico legado com
confirmação, sem apagar dados do usuário automaticamente.

**Aceite:** segredos fictícios em literais, URLs, comentários, funções, INSERT,
UPDATE e mensagens de erro não aparecem nos arquivos/diagnósticos padrão; histórico
e rerun continuam coerentes; política de migração testada em arquivo legado.

### A04 — Histórico HTTP perde a classificação de segredo

**Prova:** request para loopback com `?q={{private_value}}`, variável marcada
`secret: true`. O report da coleção ficou redigido, mas o histórico salvo com
`persistMetadata: true` e `persistBodies: false` continha o valor privado literal.
A persistência é opt-in; o vazamento depende de estar habilitada.

**Código:** [history.ts](src/features/http/model/history.ts), `redactHttpHistoryUrl`
e `createHttpSuccessHistoryEntry`; [storage/history.ts](src/features/http/storage/history.ts);
[use-http-send-document.ts](src/features/http/hooks/use-http-send-document.ts).
O filtro por nomes como `token` não reconhece um segredo sob `q` ou no caminho.

**Plano:** transportar o contexto de segredos até histórico/snapshots, não somente
até reports. Aplicar redaction por identidade/valor conhecido e suas formas
codificadas; impedir que URLs e headers internos burlem a política.

**Aceite:** request simples e coleção, sucesso e falha, redirects, query/caminho/
userinfo, variáveis privadas e extraídas; arquivos sem valores fictícios. Persistir
corpos precisa de política e consentimento próprios, sem prometer que `0600`
transforma dados sensíveis em dados seguros para compartilhamento.

### A05 — Redirect entre origens transporta autenticação personalizada

**Prova:** POST com auth API Key no header `X-Custom-Credential`, seguido de 307
para outro host simulado, enviou o mesmo segredo e body para o segundo destino.
Não houve tráfego para domínios externos na reprodução.

**Código:** [redirects.ts](src/features/http/services/redirects.ts), conjunto
`CROSS_ORIGIN_HEADERS` e `redirectHeaders`. Só quatro nomes fixos são removidos.
Também não há regra específica bloqueando downgrade HTTPS → HTTP.

**Plano:** preservar a origem/semântica dos headers de autenticação e impedir
reenvio automático de segredos para outro destino. Definir consentimento explícito
para body sensível e downgrade; redirects legítimos continuam possíveis segundo
política clara, tanto na TUI quanto no modo headless.

**Aceite:** headers auth personalizados e privados são removidos/bloqueados em
cross-origin; 301/302/303/307/308, portas, subdomínios e downgrade cobertos. Destinos
novos não herdam autorização TLS insegura. Nenhum retry silencioso de escrita.

### A06 — Cookie jar aceita supercookies

**Prova:** uma resposta simulada de `api.example.com` com `Domain=com` criou um
cookie que `jar.header('https://unrelated.com/')` devolveu. Isso permite injetar
esse cookie em hosts alheios; não demonstra leitura dos demais cookies host-only.

**Código:** [cookies.ts](src/features/http/services/cookies.ts), `domainMatches`,
`applyCookieAttribute` e `HttpCookieJar`. Faltam validação de sufixos públicos,
regras de prefixos de segurança e limites quantitativos do jar.

**Plano:** usar uma política de cookies com domínio registrável/sufixos públicos,
regras de `__Host-`/`__Secure-`, limites e escopo explícito entre ambientes/sessões.

**Aceite:** rejeitar `com`, `co.uk` e sufixos públicos equivalentes; cobrir IDN,
IPv4/IPv6, localhost, path, Secure, expiração e prefixos. `no-cookie-jar` não lê nem
escreve cookies. Testes negativos entre ambientes e origens sem cookies herdados.

### A07 — Autostart precisa de uma decisão local de confiança

**Evidência:** o parser aceita `autostart: true` de `.tuiminal/runner.yaml` e o
efeito em [RunnerWorkspace.tsx](src/features/runner/RunnerWorkspace.tsx), linha 654,
chama `runCommand` quando o projeto ativo é descoberto. Runner é a tela inicial.
O parser foi exercitado; não executamos um comando malicioso.

**Risco:** abrir um checkout recebido de terceiros pode executar código com as
permissões e o ambiente do usuário. Esse comportamento segue a convenção atual;
o ponto de atenção é que consentimento gravado pelo autor do repositório não é
necessariamente consentimento do usuário que o abre.

**Plano:** introduzir confiança local por raiz canônica e configuração relevante;
mostrar comandos, cwd, perfis/env e efeitos antes do primeiro autostart. Mudança
material da configuração revoga a aprovação. Abrir/descobrir projeto não pode
equivaler a confiar nele. Não desabilitar execução manual deliberada de comandos.

**Aceite:** primeiro acesso e configuração alterada não criam processos; aprovação
explícita libera apenas o escopo apresentado. Autostart legítimo de projeto
aprovado, importações Procfile/mprocs e restauração de sessão têm regressões.

### A08 — Encerramento deixa processo vivo

**Prova:** um shell PTY descartável que ignorava INT/TERM/HUP continuou vivo 1,5 s
após `stop()`, sem callback de saída. O teste depois encerrou **somente seu próprio
grupo** com SIGKILL e confirmou a limpeza.

**Código:** [terminal.ts](src/features/terminal/services/terminal.ts), `stop`:
envia Ctrl+C/TERM, fecha PTY e remove o handle do registro sem fallback forçado.
Runner tem fallback de um segundo em POSIX; isso não prova término da árvore no
Windows nem que todo shutdown da aplicação aguarde os filhos.

**Plano:** contrato assíncrono e idempotente de encerramento; manter ownership até
saída observada, período de graça, escalada e prazo final com erro visível. Tratar
árvores de processos conforme OS; não matar por nome de programa ou porta.

**Aceite:** shell e descendentes que ignoram sinais; fechamento de pane, restart,
saída normal, Ctrl+C, SIGTERM e erro de bootstrap. PIDs/portas dos testes somem e
processos sentinela alheios ficam vivos. Validar o launcher npm e cada OS suportado.

### A09 — Fronteira de filesystem e recuperação de configurações

**Prova HTTP:** em fixture, `.tuiminal` era symlink para outro diretório também
descartável. Salvar Scratch escreveu `http/scratch.http` fora da raiz do projeto.
`projectPath` valida caminho lexical, mas `writeAtomic` segue diretórios ancestrais.

**Evidência Banco:** `writeSettings` escreve diretamente no destino; `readSettings`
substitui JSON inválido por estado vazio em cache. Interrupção/duas instâncias
podem causar perda de perfis, favoritos ou histórico; essa perda por crash não foi
injetada nesta auditoria. Preferências globais também usam escrita direta.

**Código:** [collections.ts](src/features/http/storage/collections.ts), funções
`projectPath` e `writeAtomic`; [database.ts](src/features/database/services/database.ts),
linhas 611–647; [theme.ts](src/core/settings/theme.ts).

**Plano:** raiz real, ancestral seguro e política de symlink; escrita exclusiva em
temporário no mesmo diretório, sync/rename, versão/conflito entre instâncias e
backup recuperável. Validar consistência também em history, exports e configs.
JSON corrompido deve ser reportado/preservado, não sobrescrito como vazio.

**Aceite:** symlink em arquivo e em ancestrais, troca concorrente de destino,
duas instâncias, disco cheio, permissão negada e interrupção antes/depois de rename;
nenhuma escrita externa inesperada nem perda silenciosa de configuração anterior.

### A10 — Orçamentos precisam existir antes da renderização

**Provas:** SQL retornou `rowCount: 650`, com só 500 linhas visíveis: o limite é
aplicado após a aquisição. `pipeLines` recebeu 2.000.000 de caracteres sem newline,
não entregou nenhum fragmento e depois emitiu uma única linha de 2.000.000 de
caracteres. Não foi feito stress destrutivo nem demonstrado OOM.

**Outros caminhos estáticos:** Git local concatena stdout/stderr sem teto ou
timeout; scanner HTTP limita cada arquivo, mas não total de arquivos/diretórios;
download completo tem timeout/streaming, mas não orçamento de disco; cookies não
têm limite de quantidade. Limites existentes de resposta HTTP não protegem tudo isso.

**Código:** [database.ts](src/features/database/services/database.ts), `executeDatabaseQuery`;
[sqlite-query-process.ts](src/features/database/drivers/sqlite-query-process.ts);
[process.ts](src/features/runner/services/process.ts), `pipeLines`;
[git.ts](src/features/git/services/git.ts), `runGitCommand`;
[collections.ts](src/features/http/storage/collections.ts);
[download.ts](src/features/http/services/download.ts).

**Plano:** limites explícitos de bytes/linhas/células/tempo na leitura, IPC e
buffers; cancelamento e truncamento visível, sem modificar a semântica de SQL de
escrita. Paginação/streaming devem evitar carregar tudo para depois descartar.
Definir budgets de discovery/watchers, downloads e caches por workspace.

**Aceite:** resultados com célula/BLOB grande, linha contínua, saída rápida de
processo, diffs grandes, muitas coleções e cancelamentos repetidos. Registrar pico
de memória, latência de input e recursos após fechamento sob budgets definidos;
nenhum truncamento apresentado como resposta completa.

### A11 — Conflitos de escrita e contagem de sucesso

**Prova:** atualizar PK inexistente por `applyTableMutations` retornou `1`
(quantidade de statements), sem erro. O WHERE usa PK, mas não versão/valores
originais para detectar edição concorrente. Retornar statements não é por si só
contar linhas; falta tratar a divergência como conflito para a intenção do usuário.

**Código:** [database.ts](src/features/database/services/database.ts),
`primaryKeyWhere`, `buildUpdateStatement`, `applyTableMutations` (linha 2118).

**Plano:** revalidar alvo/schema e concorrência na transação; resultado estruturado
com operações/linhas/conflitos. Considerar diferenças de driver: no MySQL, update
sem mudança pode reportar zero sem a linha estar ausente. Definir motores/tabelas
suportados pela promessa de rollback; não presumir transação em tabela não transacional.

**Aceite:** registro removido, alterado por segunda conexão, PK modificada, no-op,
triggers, lote parcialmente inválido, mudança de perfil/alvo e perda de conexão
perto do commit. Provar rollback e estado incerto quando não for possível afirmar
commit/rollback. Nenhuma repetição automática para resolver resultado desconhecido.

### A12 — Checkout deve falhar quando a inspeção falha

**Prova:** num Git descartável com origin esperado e index inválido, `git status`
retornou 128, mas `inspectCheckoutClone` respondeu `eligible: true`. Não houve
checkout real nem perda de trabalho; o problema está na autorização preventiva.

**Código:** [pr-checkout.ts](src/features/git/services/pr-checkout.ts), linha 38.
O exit code do status não é verificado antes de interpretar stdout vazio como
worktree limpa. A inspeção dos hooks de PR/Issue também ocorre antes de etapas
remotas; uma mudança local posterior precisa ser considerada.

**Plano:** verificar todos os comandos obrigatórios; erros impedem checkout com
motivo claro. Revalidar o estado local imediatamente antes do despacho e serializar
por clone. Manter proibição de force/reset/clean/stash automático.

**Aceite:** index inválido, falha de permissão, timeout, erro de gitdir, worktree
suja e modificação durante confirmação bloqueiam a ação. Clones limpos e linked
worktrees continuam funcionando. Compartilhar a proteção entre PR e Issues.

### A13 — Release verificável e plataformas reais

**Evidências:** a `main` auditada falha no CI Ubuntu; o npm instalado contém
`UNLICENSED` e nenhum arquivo LICENSE nos dois pacotes baixados, enquanto a fonte
atual já exige Apache-2.0. A tag publicada aponta a um commit anterior. Isso prova
divergência de artefatos/metadados, não a ausência de toda correção funcional no binário.

O pacote passou em smoke tests macOS x64 sem Bun no PATH, mas não testamos Node 18,
macOS ARM64, Linux ou Windows nativos. A CI só tem Ubuntu/macOS de fonte, não uma
matriz dos seis pacotes instalados. O Free Terminal usa `/bin/zsh` quando `SHELL`
está ausente e flags POSIX nos comandos: esse fallback não é portátil para Windows.

**Código:** [check.yml](.github/workflows/check.yml),
[release-model.ts](scripts/release-model.ts), [build-release.ts](scripts/build-release.ts),
[release.test.ts](tests/release.test.ts), [terminal.ts](src/features/terminal/services/terminal.ts).

**Plano:** corrigir a falha Linux sem remover assertions; produzir release nova,
imutável, de SHA aprovado, com manifests/LICENSE e binários coerentes. Testar
instalação do tarball final, não só geradores de manifest. Definir shell/PTY e
pré-requisitos por plataforma; suporte anunciado precisa de evidência, não apenas
compilação cruzada. Decidir explicitamente canal `alpha` versus `latest`.

**Aceite:** seis combinações anunciadas aprovadas, ou decisão explícita do mantenedor
para mudar a matriz de suporte antes de divulgar. Em cada uma: instalar por npm
sem Bun, help/version, abrir TUI, cada tab, helper SQLite, HTTP loopback, PTY e
shutdown, upgrade/uninstall. Validar Node mínimo anunciado, caminhos com espaço/
Unicode, permissões, checksums, licença e consistência de versão/tag/commit.
Falha em plataforma não deve ser escondida mantendo promessa de suporte universal.

### A14 — Dependências e alcançabilidade

**Prova:** `bun audit --json` encontrou `qs` 6.15.3 na cadeia do SDK MCP/Express/
body-parser. Dois advisories moderados, com correção indicada em 6.16.0:
[GHSA-x5fp-wj9c-mxmx](https://github.com/advisories/GHSA-x5fp-wj9c-mxmx) e
[GHSA-4mjr-xmp4-gh2g](https://github.com/advisories/GHSA-4mjr-xmp4-gh2g).

O Tuiminal usa MCP como cliente stdio no caminho examinado, não um servidor Express
aberto. Não foi comprovado que a entrada vulnerável seja alcançável no binário;
não transformar o resultado da ferramenta em alegação de exploração remota.

**Plano/aceite:** atualizar de forma compatível, regenerar lockfile e rodar o gate;
inventariar componentes de cada binário e sua licença. Se houver exceção, documentar
alcançabilidade, mitigação, dono e expiração. Adicionar auditoria periódica e na
release, com política por risco em vez de apenas ignorar avisos. Checar também
dependências nativas/Bun incluídas na compilação.

### A15 — Governança da versão e da branch principal

**Evidências:** `branches/main` reporta `protected: false`; não foi encontrado
workflow de release nem `SECURITY.md` no checkout. O workflow de checks usa
permissão `contents: read`, uma boa base, mas ações referenciadas por tags mutáveis.
Não foram inspecionados tokens locais nem sua configuração de 2FA/permissões npm.

**Plano:** tornar verificável a política desejada de só o mantenedor integrar na
principal, usando controles disponíveis para o plano/tipo do repositório; checks
obrigatórios, revisões e restrição de force-push/exclusão. Auditar regras efetivas
e bypasses, não apenas existência de um formulário de configuração. Publicação
deve ter aprovação do mantenedor e credenciais mínimas/curtas ou identidade de CI.

**Aceite:** colaborador sem privilégio não consegue atualizar `main` nem publicar
pacote; candidato reprovado não gera release. Documentar canal privado de segurança,
versões suportadas, triagem e retirada/aviso de versão problemática. Fixar ações
por SHA revisado, vincular artefatos ao commit e verificar integridade/proveniência.
Não alterar visibilidade do repositório para resolver distribuição ou imagens sem
aprovação específica.

### A16 — Segunda camada de robustez e experiência

São pendências **C/V**, não incidentes demonstrados nesta auditoria:

- **Resultado remoto incerto:** revisar todos os erros depois do despacho, incluindo
  resposta inválida/saída excessiva e falha de reconciliação. As mutações tratam
  timeout/cancelamento como incertos; provar que nenhum outro caminho incentiva
  duplicar comentário, review ou escrita aceita. Usar `gh` falso para falhas e um
  repositório de teste autorizado para confirmação real.
- **Abertura de respostas:** `isSafeHttpResponseOpenType` aceita todo `image/*`,
  inclusive SVG. Nem todo documento de imagem/PDF é conteúdo inerte quando aberto
  externamente. Não foi executado payload; definir allowlist/aviso e testar MIME,
  extensão e nome antes de abrir no aplicativo do sistema.
- **Downloads:** tratar escrita parcial de arquivo, cancelamento, falta de espaço,
  status HTTP inesperado e limpeza do parcial. GET pode ter efeitos em serviços
  mal projetados; reenvio para download precisa permanecer explícito.
- **Drafts e saída:** o guard global de saída rastreia HTTP; auditar perda de SQL,
  staging e outros drafts. Diferenciar fechar UI, parar processo e descartar dados.
  Não confundir draft perdido com alteração já executada no banco.
- **Teclado/terminal real:** testar Alt/Option, Space/Alt+Space, Escape em camadas,
  paste, Unicode/graphemes, clipboard, mouse e resize em ambos os layouts e seis
  idiomas. O renderer de testes não substitui Terminal.app/iTerm2, terminais Linux,
  Windows Terminal, tmux e SSH. Cobrir transporte legacy e Kitty sem capturar atalhos
  globais dentro de inputs/PTYs.
- **Docs:** revisar garantias absolutas no README (segredos/rollback/encerramento/
  Windows). O plano de plugins contém descrições antigas de entrada/imports; não
  o apresentar como arquitetura já implementada nem ampliar a alfa com plugins
  antes de uma revisão própria de isolamento e permissões.

**Aceite:** cada item vira caso de teste ou decisão documentada com escopo e prazo;
falhas de segredo, alvo ou duplicação descobertas aqui sobem para P0/P1.

## 5. Ordem de execução proposta

| Fase | Trabalho | Dependência e saída verificável |
| --- | --- | --- |
| 0 — Fixar baseline | Registrar SHA, artefatos e decisões de suporte/risco | Este relatório; sem publicar candidato ainda |
| 1 — Integridade e confiança | A01, A02, A03, A07, A11, A12 | Provas negativas viram testes; revisão das proteções antes de UI cosmética |
| 2 — Privacidade e persistência | A04, A05, A06, A09 | Modelo de segredos/destinos e recuperação de arquivos consistente |
| 3 — Processos e limites | A08, A10; complementar A16 | Sem órfãos dos testes; budgets medidos; cancelamento confiável |
| 4 — Qualidade e distribuição | A13, A14, A15 | Mesmo SHA verde, matriz de drivers/plataformas e pacotes finais validados |
| 5 — Candidato alfa | Release notes, instalação limpa, revisão independente e aceite do mantenedor | Só então autorizar publicação; acompanhar regressões com plano de retirada |

Cada fase deve ter PRs pequenos por tema com: reprodução que falha no baseline,
correção, teste que passa, análise de efeitos colaterais e atualização das notas
de produto aplicáveis. Não elevar baseline de manutenção, apagar teste ou rotular
como flaky para contornar uma falha. Não é necessário implementar novas features
do roadmap para resolver os bloqueadores desta versão.

Responsáveis propostos: mantenedor aprova escopo/risco/release; contribuidores
implementam os itens; outra pessoa revisa especialmente SQL, segredos e publicação.
São papéis sugeridos, não convites, tarefas remotas ou permissões já atribuídos.

## 6. Checklist de liberação da alfa

As caixas ficam intencionalmente abertas; o verde do gate local não as preenche.

- [ ] A01–A13 e A15 resolvidos, com evidência no commit candidato; P2 triados.
- [ ] `bun install --frozen-lockfile`, `bun run check` e `git diff --check` passam
  no candidato e nos runners suportados; investigar as duas falhas Linux existentes.
- [ ] `bun run test:database:drivers` passa com containers descartáveis; validar
  também TLS/credenciais mínimas, concorrência e resultados incertos.
- [ ] Novos casos de segurança executados contra fonte **e** binários afetados;
  não depender de mocks para provar a proteção oferecida pelo driver/OS.
- [ ] Cada pacote anunciado instalado em ambiente limpo sem Bun, no Node mínimo;
  smoke completo das cinco ferramentas e testes de encerramento aprovados.
- [ ] Configurações legadas/atualização, backups, corrupção e duas instâncias
  testados sem perda de dados nem gravação de segredos.
- [ ] Auditoria de dependências, inventário/licenças e varredura de segredos do
  histórico e artefatos concluídos; exceções limitadas e revisadas.
- [ ] Memória, CPU, latência e recursos após cancelamento/fechamento medidos em
  stress controlado; limites documentados e truncamento honesto.
- [ ] Política de colaboração e publicação verificada; nenhuma credencial de
  publicação em logs, pacotes ou scripts; permissões mínimas.
- [ ] README/release notes refletem comportamento comprovado, plataformas,
  limitações e canal `alpha`; tag/version/LICENSE/checksums/commit consistentes.
- [ ] Canal privado de segurança, procedimento de reporte e plano de resposta a
  regressão/vazamento definidos antes de convidar usuários externos.
- [ ] Revisão final independente e aprovação explícita do mantenedor para publicar.

## 7. Limitações e próximo passo

Ainda faltam Docker/drivers reais, execução nativa nas demais plataformas,
Node mínimo, testes de chaveiro/TLS/proxy por OS, ações reais em GitHub de teste,
stress prolongado, injeção de falhas de disco/rede e revisão integral do histórico
Git/artefatos. Esses itens não foram declarados aprovados por inferência.

A evidência atual já basta para o parecer **não liberar ainda** e para organizar
o trabalho. Não é preciso acessar produção ou credenciais pessoais para começar:
o próximo passo técnico é transformar **A01 e A02** em regressões permanentes e
corrigir as fronteiras de escrita, mantendo os demais itens no plano. A execução
das correções foi autorizada posteriormente; commit, push e publicação continuam dependendo de autorização específica.

## 8. Implementação local após a auditoria

Registro cronológico do trabalho baseado em `2b3a013`. As referências abaixo a
trabalho local, ausência de commit/push e gates anteriores descrevem o momento de
cada rodada, não o estado final do checkpoint da seção 9. Não é um candidato
aprovado e não altera a conclusão de não publicar ainda. PRs/issues existentes
não foram consultadas, integradas ou alteradas nesta etapa.

| Item | Progresso e evidência local | Ainda falta para a liberação |
| --- | --- | --- |
| A01 | Projeção direta por dialeto, origem única, resultado compatível com schema e guardas em ações individuais/lote/insert. Regressões de expressões, aliases, duplicatas, comentários executáveis e schemas; TUI compact/framed bloqueia staging derivado. SELECT direto com PK composta mantém o alvo até callback de revisão e execução real em SQLite descartável. | Revisão final do candidato e fluxo completo de aprovação no workspace integrado; binário distribuído. |
| A02 | Classificador conservador; SQLite readonly e PostgreSQL READ ONLY; MySQL/MariaDB recebem proteção adicional no default da sessão, restaurado antes de devolver a conexão. Falha ao restaurar invalida/fecha o pool. Nove testes de ciclo/cancelamento e seis testes reais da matriz Docker passaram, incluindo DML/DDL recusados com credencial RW, SELECT de view com função mutante/sequence PostgreSQL, rollback e reutilização para escrita autorizada. | MCP depende também de restrição no servidor; matriz TLS/credenciais mínimas, plataformas e binários continuam pendentes. |
| A03 | Novas execuções persistem apenas metadados; SQL/erros/parâmetros ficam em cache volátil de até 200 entradas e 2 MB. Reexecução só com SQL disponível e mesmo alvo; favoritos continuam uma ação explícita de salvar SQL. Conteúdo legado permanece até `[D]` → `[Y]`, com cancelamento por `[Esc]` e controles de mouse; limpeza preserva metadados/favoritos e não remove backups. Testes reais SQLite de disco/legado e regressões TUI em ambos os layouts passaram. | Validação final integrada e em binário; recuperação/atomicidade do arquivo permanecem em A09. |
| A04 | Contexto privado não serializável acompanha preparação, redirects/cookies, sucesso/falha, extrações e mudanças de escopo até histórico e reports. Metadados mascaram valores conhecidos e encodings comuns; corpos com segredos conhecidos não são persistidos mesmo com opt-in. Assertions privadas omitem `actual` nos reports para não reintroduzir o corpo por outra via. Resposta ativa permanece exata em memória. Regressões locais e TUI compact/framed cobrem sucesso, erro e `@no-log`. | Revisão final e pacote/binário candidato; históricos/exportações/backups antigos não são apagados automaticamente. Filesystem e orçamentos gerais continuam em A09/A10. Não declarar A05/A06 corrigidos por transportar contexto de privacidade. |
| A05 | Implementação local remove headers privados por proveniência/valor, preserva origem dos cookies por toda a cadeia e pausa o transporte para autorizar body/URL privada cross-origin, downgrade e TLS inseguro. TUI/coleção/download/CLI usam a continuação do salto, sem repetir POSTs/dependências. Cancelamento, timeout e unmount descartam confirmações; flags headless exigem origem exata. | Revisão e validação final do candidato/binário e matriz nativa de TLS/terminais. Evidências adicionais abaixo; não confundir com A06. |
| A06–A16 | Demais correções ainda pendentes; os limites do cache SQL e a composição deduplicada dos contextos HTTP contribuem somente para partes de A10. | Manter o backlog e seus critérios originais; não reduzir o escopo ao Banco/HTTP. |

Detalhe confirmado pela matriz real: `BEGIN READ ONLY` sozinho não protege DDL
MySQL/MariaDB, pois o servidor encerra a transação implicitamente. O teste
reproduziu a criação indevida antes da proteção de sessão e passou depois dela.
As conexões continuaram aceitando escrita RW explícita após a restauração.

O gate `bun run check` passou (exit 0): tipos, formato, lint, arquitetura,
manutenção, **525 testes unitários/integrações locais aprovados, 8 pulados e
92 testes TUI aprovados**. Os oito pulados são a suíte Docker opt-in e seus hooks,
executada separadamente; não representam validação de plataformas ausentes.
Arquitetura: 423 módulos, 1.934 dependências e zero violações. Manutenção: zero
regressões, sem elevar baselines. Os testes novos de interface somam sete casos
(três de origem/PK e quatro de histórico/limpeza).

Rodadas anteriores revelaram intermitências no watcher HTTP e no timeout do
fixture de Issues, além de uma sobreposição da borda no novo cabeçalho do histórico
já corrigida. O passe posterior não elimina a necessidade de investigar essas
intermitências em A13. Não foram removidos testes nem suprimidos os 113 avisos
de lint ou os avisos de React `act(...)`. Nenhum pacote foi gerado/publicado e
nenhuma configuração, credencial ou banco real do usuário foi alterado.

Revalidação após a implementação do histórico: `bun run test:database:drivers`
passou novamente com **6 testes e 124 assertions**, em MySQL 8.4, MariaDB 11.8 e
PostgreSQL 17 descartáveis. A suíte TUI de privacidade também foi repetida com
**4 testes e 38 assertions**, incluindo a recusa de um evento Kitty de repetição
de `[Y]`. `git diff --check` passou. Os containers e arquivos temporários dos
testes foram encerrados/removidos pelos próprios testes; o repositório segue
sem commit/push/publicação destas alterações.

### Evidência adicional de privacidade HTTP

O teste com segredo fictício em `?q={{private_value}}` reproduziu a gravação
indevida na URL final, nos redirects e no body base64. Após a correção, a suíte
dedicada cobre persistência com bodies ativados/desativados, URI com userinfo,
Basic/API Key literal, campos sensíveis, encodings percent/form/JSON, cookies
recebidos inclusive antes de falha, extrações privadas, troca de escopo e erro de
resolução do ambiente. Contextos combinados permanecem deduplicados, sem lista
serializável de valores. Assertions com resposta codificada reproduziram um
segundo vazamento em `actual`; o report privado agora omite esse valor, mantendo
o original no snapshot ativo. O opt-in de body público continua funcionando.

Dois testes TUI novos enviam requests reais a loopback, validam os arquivos de
histórico e exercitam `@no-log` em compact/framed. As duas mensagens novas de
política/erro têm cobertura nos seis idiomas. Nenhum teste usa dados de produção.
Os fixtures temporários são removidos/restaurados pelos testes. A política e seus
limites estão alinhados no README, AGENTS, plano HTTP e handoff da reconstrução.

Verificações desta etapa: houve um gate completo aprovado com **542 testes
unitários/integrações locais, 8 pulados e 94 TUI**. A regressão adicional do
`actual` privado foi adicionada depois desse passe. Na rodada mais recente,
tipos/formato/lint/arquitetura/manutenção passaram, mas o gate terminou com
**542 aprovados, 8 pulados e 1 falha** no teste
`tests/git-pr-actions.test.ts: classifies a dispatched timeout as uncertain and
does not retry`. O resultado foi `uncertain/timeout`, mas o fixture não havia
registrado o único comando esperado dentro de 150 ms (arquivo vazio). A falha
também se repetiu isoladamente; o teste e o código de PR/Issues não foram alterados.
Não atribuir a causa definitivamente à inicialização sem instrumentação adicional;
o risco de estabilidade continua em A13. Não considerar o gate atual aprovado.

Após essa falha, a seleção HTTP/history/runner/i18n passou com **81 testes e 424
assertions**, incluindo os **12 casos novos de privacidade**. Arquitetura:
424 módulos, 1.947 dependências e zero violações. Manutenção: zero regressões;
lint permanece com os 113 avisos anteriores, sem supressões novas.

A suíte completa de interface foi então executada separadamente no código mais
recente: **94 testes passaram, zero falhas**. `git diff --check` também passou.
Isso não substitui o gate completo que falhou no fixture de timeout. A próxima
correção funcional é A05 (credenciais/body em redirects entre origens), seguida
de A06; nenhuma release, tag, commit ou push foi feito nesta etapa.

### Implementação e regressões de redirects HTTP (A05)

As duas reproduções iniciais (header API Key personalizado e body de POST 307
cross-origin) falharam antes da correção e passaram depois dela. A política agora
remove headers de autenticação pela origem, marcação sensível e valor privado
conhecido. Qualquer body retido cross-origin exige aprovação conservadora, assim
como URL privada ou downgrade. A origem é comparada por protocolo/host/porta
canônicos, sem equiparar subdomínios. Location com protocolo não HTTP ou userinfo
é recusado e o corpo da resposta de redirecionamento é encerrado.

A autorização mantém o transporte suspenso, não reinicia a execução. Coleções
preservam dependências já enviadas. `[Y]` autoriza o salto; `[I]` continua aprovando
TLS inseguro por destino/ambiente/sessão. A fila possui teto de 16, IDs únicos,
tratamento de StrictMode, cancelamento/timeout/unmount e recusa eventos repetidos.
No modo headless, `--allow-private-redirect-to` e `--allow-http-redirect-to`
exigem origens exatas; autorizar um risco não autoriza outro nem restaura headers.
README, ajuda CLI, AGENTS, plano HTTP e handoff registram essas regras.

Uma terceira reprodução mostrou reintrodução de cookie: A → B removia o cookie,
mas B → B o recolocava. A correção rastreia privacidade por origem durante toda a
cadeia e filtra os cookies herdados, preservando cookies próprios emitidos por B.
Isso não implementa a Public Suffix List nem encerra A06.

Os primeiros três testes TUI falharam porque o handler no backdrop não recebia
teclas dos filhos focados. O modal montado agora consome eventos por `useKeyboard`.
Os quatro testes de interface passaram: POST com `[Esc]` sem sair do App, teclado
e mouse em compact/framed, controles alcançáveis em 60×16, confirmação TLS única
entre prompts, StrictMode e descarte no unmount. Os testes de timeout/cancelamento
e coleção usam HTTP loopback e verificam contagem exata de requests.

Verificação focada até aqui: **50 testes e 311 assertions** (38 de redirects e
12 de histórico privado) passaram; tipos, formato, manutenção e arquitetura
passaram, com **432 módulos, 1.980 dependências e zero violações**. A validação
PTY nativa e a nova rodada do gate completo são registradas separadamente abaixo.
Esses resultados não aprovam uma release; todo o trabalho continua local.

`TUIMINAL_HTTP_PTY=1 bun test tests/http-redirect-pty.test.ts` passou em macOS x64
com **2 testes e 14 assertions**. A CLI fonte abriu um PTY real em compact/framed,
recebeu teclado via terminal, recusou o primeiro redirect com `[Esc]` sem sair,
autorizou o segundo com `[Y]`, mostrou a resposta e encerrou normalmente. Contadores
de servidores loopback comprovaram zero requests ao destino antes do consentimento
e exatamente um depois. O teste criou e removeu somente seus diretórios/configs,
servidores e processos; não acessou bancos ou credenciais do usuário. Esse opt-in
fica fora do gate padrão e não comprova outros sistemas/terminais ou o binário npm.

A rodada completa seguinte aprovou **582 testes unitários/integrações locais e
10 pulados** (8 Docker/hooks e 2 PTY opt-in). A TUI teve **97 aprovados e 1 falha**:
`keeps a continuous response bounded and the response pane interactive` excedeu
15 segundos. Repetição isolada também excedeu o limite; duas rodadas posteriores
passaram em aproximadamente 11–12,5 segundos. Instrumentação temporária mediu
captura de 1,5 MB e cancelamento do stream em cerca de 100 ms; o atraso de cerca de
10 segundos aconteceu entre esse término e a confirmação visual de `TRUNCADO`.
Isso localiza a investigação, mas não determina a causa. Não aumentar o timeout
nem remover a assertion para esconder o problema; permanece em A10/A13.

A cobertura de redirects também foi ampliada para a coleção integrada no App:
recusar a confirmação devolve o foco ao dataset; `[Esc]` desfoca esse input e só a
próxima tecla fecha a coleção, sem sair do aplicativo. Essa restauração passou em
compact/framed; os quatro testes focados agora têm **41 assertions**. Nomes de
headers privados com espaços são normalizados antes da comparação entre origens.
A última rodada completa ainda precisa ser repetida depois desses ajustes.

## 9. Plano de retomada — checkpoint em `development`

### Escopo, estado e limites da autorização

O mantenedor pediu para interromper as implementações, registrar **todas as
pendências conhecidas**, commitar o trabalho atual e enviá-lo à `development`.
Este checkpoint inclui código, regressões, documentação e demos já produzidos;
**não significa que todos os itens foram corrigidos nem que a alfa está pronta**.
Não ampliar o trabalho para novas features ou para o ecossistema de plugins.

- Base das alterações: `main` em `2b3a0137ea36050b602db9d73c057374cf386857`.
- Na conferência remota, `development` estava em `2e3537a`, ancestral da `main`,
  seis commits atrás e sem divergência. Preservar esses commits ao avançar a
  `development`; não sobrescrever histórico nem atualizar `main`.
- O GitHub identifica o repositório como `xuponds/tuiminal`, privado, com `main`
  principal. O remote local antigo redireciona para ele; não mudar visibilidade,
  permissões, branch principal ou regras de proteção nesta entrega.
- Outras branches remotas de correções existem, mas **não foram revisadas nem
  incorporadas**. Não presumir que resolvem os achados deste plano.
- PRs/Issues permanecem adiados conforme a orientação anterior. Guardar A12 e a
  parte remota de A16 no backlog, sem consultar/integrar PRs nem modificar essas
  funcionalidades até nova orientação. O gate completo mantém suas regressões.
- Versão continua `0.2.0-pre-alpha.0`. Nenhuma tag, release GitHub ou publicação npm
  está autorizada por este pedido de commit/push.
- As constatações de npm, CI, dependências e proteção das seções anteriores são
  históricas. Reconsultar o estado efetivo ao retomar; os drivers Docker já foram
  exercitados depois da auditoria inicial, como registrado na seção 8.

### Ordem sugerida para continuar

1. Reproduzir o gate deste checkpoint e investigar a instabilidade/performance
   HTTP registrada abaixo, sem aumentar timeouts nem enfraquecer assertions.
2. Fechar revisão e validação integrada de A01/A02, implementar A11; completar
   privacidade/isolamento HTTP com A06 e validar A03–A05 no candidato.
3. Implementar confiança do Runner (A07), persistência segura (A09) e encerramento
   (A08), com regressões negativas antes de alterar os contratos compartilhados.
4. Medir e impor os orçamentos de A10; concluir os itens locais de A16.
5. Atualizar dependências (A14), provar CI/pacotes/plataformas (A13) e preparar os
   controles/documentos de A15. Mudanças remotas dependem de autorização própria.
6. Retomar A12 e a parte remota de A16 somente quando o mantenedor liberar esse
   escopo. Adiamento não conta como correção nem remove bloqueadores da alfa.
7. Revisão independente, checklist da seção 6 e aceite explícito do mantenedor;
   apenas depois preparar uma publicação imutável do SHA aprovado.

### Checklist executável de pendências

Todas as caixas abaixo estão abertas intencionalmente. A01–A05 têm implementação
e regressões no checkpoint, mas **nenhum dos 16 itens tem aceite final de release**.
Para cada caixa encerrada, registrar commit, comando, ambiente, resultado e limites
da evidência; documentação ou teste isolado não substituem execução integrada.

#### A01 — Integridade do alvo de escrita SQL · P0 · parcialmente implementado

- [ ] Revisar proveniência/aliases, colunas de schema e PK composta por dialeto,
  incluindo resultado derivado, ambiguidade e mudanças de conexão/tabela/schema.
- [ ] Exercitar no workspace completo resultado → seleção → staging → revisão →
  aprovação → execução, provando que o alvo não muda entre essas etapas. Cobrir
  alterações individuais, em lote e inserções; falha deve impedir o despacho.
- [ ] Repetir os casos negativos e o SELECT direto permitido nos drivers e no
  binário candidato. Relacionar concorrência e contagem de linhas com A11.

#### A02 — Somente leitura imposto pelo driver · P0 · parcialmente implementado

- [ ] Revisar classificador conservador e ciclo da conexão/transação, incluindo
  cancelamento concorrente, erro de rollback/restauração e descarte do pool.
- [ ] Repetir matriz SQLite/MySQL/MariaDB/PostgreSQL com TLS e credenciais mínimas;
  manter DML/DDL e rotinas com efeitos bloqueados e reutilização RW explícita.
- [ ] Validar o contrato do MCP opt-in com servidor/credencial realmente somente
  leitura. O cliente não transforma rotinas do servidor em uma sandbox.
- [ ] Provar os mesmos limites no helper/binário e sistemas anunciados; registrar
  resultados incertos sem repetição automática.

#### A03 — Privacidade do histórico SQL · P1 · parcialmente implementado

- [ ] Validar no App e pacote final o histórico metadata-only, limites do cache,
  reexecução no mesmo alvo, favoritos explícitos e descarte ao encerrar a sessão.
- [ ] Cobrir atualização de histórico legado, confirmação/cancelamento de limpeza,
  dados indisponíveis após reinício e preservação dos favoritos/metadados.
- [ ] Integrar recuperação e atomicidade de A09. Documentar que backups e SQL salvo
  explicitamente não são eliminados nem sanitizados automaticamente.

#### A04 — Privacidade do histórico/report HTTP · P1 · parcialmente implementado

- [ ] Revisar propagação do contexto privado em sucesso, erro, redirects, cookies,
  chaining e troca de escopo; impedir reintrodução por assertions e metadados.
- [ ] Validar fonte e binário com segredo fictício, encodings, opt-in de body
  público/privado e `@no-log`, sem alterar os bytes ativos da resposta.
- [ ] Definir tratamento/documentação de históricos, exports e backups antigos;
  nenhuma limpeza destrutiva implícita. Fechar persistência e limites em A09/A10.

#### A05 — Autorização e isolamento de redirects · P1 · parcialmente implementado

- [ ] Revisar cada salto por protocolo/host/porta, headers privados normalizados,
  proveniência de cookies A → B → B, preservação/remoção de body e URL privada.
- [ ] Validar TLS real por novo destino, downgrade, proxy, download e coleção com
  datasets/execuções concorrentes, ambiente imutável e permissões independentes.
- [ ] Confirmar que negar, timeout, cancelamento e unmount descartam prompts e não
  reexecutam POSTs/dependências; nenhum fluxo de erro pode voltar ao retry global.
- [ ] Repetir foco em camadas, teclado/mouse, fila limitada, eventos repetidos,
  CLI por origem exata e PTY nos demais sistemas e binário distribuído.
- [ ] Não confundir os cookies filtrados nesta correção com a solução de A06.

#### A06 — Cookie jar seguro · P1 · não implementado

- [ ] Adotar validação mantida de Public Suffix List; recusar supercookies e
  normalizar domínio, IDN, IP, localhost, path, Secure, expiração e prefixos.
- [ ] Impor limites de bytes/quantidade/tempo e regras de `__Host-`/`__Secure-`.
- [ ] Isolar jar por escopo real de ambiente/projeto/sessão. Revisar a indexação
  atual por nome de ambiente em `use-http-response.ts`: nomes iguais em diretórios
  diferentes não podem compartilhar cookies por acidente. Cobrir coleções também.
- [ ] Provar que `no-cookie-jar` desliga leitura **e** escrita, incluindo redirects.

#### A07 — Confiança local para autostart · P1 · não implementado

- [ ] Exigir aprovação local vinculada à raiz canônica e fingerprint da
  configuração material, com revisão de comandos, cwd e ambiente antes de executar.
- [ ] Revogar aprovação após mudança material; descoberta, clone, troca de projeto
  e restauração de sessão não podem conceder confiança silenciosamente.
- [ ] Testar nenhum processo no primeiro acesso/alteração, autostart aprovado,
  importações e execução manual deliberada; nunca executar comandos de produção.

#### A08 — Encerramento de processos · P1 · não implementado

- [ ] Introduzir stop assíncrono/idempotente com ownership até saída observada,
  graça, escalada e erro final; integrar Free Terminal, Runner e shutdown do App.
- [ ] Provar fechamento/restart de pane, saída normal, sinais e falha de bootstrap
  com descendentes que ignoram sinais e processo sentinela externo preservado.
- [ ] Validar árvore de processos e liberação de portas por OS e launcher npm.
  Encerrar apenas PIDs/grupos criados pelo teste, nunca por nome de programa.

#### A09 — Arquivos e recuperação · P1 · não implementado

- [ ] Rejeitar symlinks/ancestrais e trocas concorrentes que escapam da raiz real
  nas coleções HTTP, configs, histórico, exportações e demais destinos afetados.
- [ ] Padronizar gravação atômica `0600`, conflito entre instâncias e recuperação
  de corrupção sem substituir o conteúdo anterior silenciosamente por vazio.
- [ ] Testar permissões, disco cheio, interrupção antes/depois de rename, arquivos
  legados, backups e duas instâncias; recuperação não deve copiar segredos novos.

#### A10 — Memória, volume e responsividade · P1 · não implementado integralmente

- [ ] Definir limites quantitativos por caminho antes de adquirir/alocar/parsear:
  SQL/IPC/células/BLOBs, Runner sem newline, stdout/diffs Git, discovery HTTP,
  imports, datasets, headers, cookies, caches, watchers e download em disco.
- [ ] Implementar cancelamento/streaming/truncamento explícito sem modificar
  semântica de escrita nem apresentar dados cortados como resposta completa.
- [ ] Investigar atraso pós-captura da resposta HTTP contínua (evidência abaixo).
  Inspecionar decodificação/sanitização anterior ao recorte de 50 mil caracteres,
  invalidação de memos e ciclo de render; são hipóteses, não causas comprovadas.
- [ ] Medir pico de memória/CPU, latência de teclado/mouse e recursos remanescentes
  com carga controlada e cancelamentos repetidos; publicar budgets e resultados.

#### A11 — Concorrência e linhas afetadas no Banco · P1 · não implementado

- [ ] Usar snapshot/versão original e revalidar alvo/schema dentro da transação;
  distinguir statements enviados, linhas afetadas, no-op, conflito e incerteza.
- [ ] Tratar semântica de matched/changed rows no MySQL e tabelas não transacionais;
  nunca prometer rollback quando o mecanismo não o oferece.
- [ ] Testar exclusão/edição concorrente, PK alterada, triggers, lote inválido e
  perda de conexão perto do commit. Conflito deve preservar uma revisão segura,
  sem sucesso inventado, escrita parcial silenciosa ou retry automático.

#### A12 — Checkout fail-closed · P1 · adiado junto com PRs/Issues

- [ ] Quando autorizado, corrigir `pr-checkout.ts`: status com exit code não zero,
  timeout, index/gitdir inválido ou erro de permissão bloqueia a autorização.
- [ ] Revalidar imediatamente antes do despacho e serializar por clone; cobrir
  alteração durante confirmação, worktree suja, clones limpos e linked worktrees.
- [ ] Compartilhar proteção com Issues sem force/reset/clean/stash automático.
  Não marcar resolvido apenas por revisar o workspace de Git local.

#### A13 — CI, instalação e distribuição · P1 · pendente

- [ ] Corrigir/interrogar falhas e intermitências registradas, obter gate completo
  no mesmo SHA em cada runner e repetir frozen install sem alterações no lockfile.
- [ ] Testar tarballs/binários finais em cada uma das seis combinações anunciadas,
  ou obter decisão explícita para reduzir o suporte antes da divulgação.
- [ ] Em instalação limpa via npm sem Bun: Node mínimo, help/version, cinco tabs,
  helper SQLite, HTTP loopback, PTY/shutdown, upgrade/uninstall e paths Unicode/espaço.
- [ ] Resolver portabilidade de shell/PTY, chaveiro, TLS e proxy por OS; compilação
  cruzada não é prova de funcionamento nativo.
- [ ] Alinhar versão/SHA/tag/manifests/LICENSE/checksums e notas; escolher canal
  `alpha`/`latest` com o mantenedor. Construção local não autoriza publicação.

#### A14 — Dependências · P2 · pendente

- [ ] Reexecutar auditoria e revalidar advisories/versões, atualizar a cadeia
  vulnerável de forma compatível e verificar lockfile, frozen install e gate.
- [ ] Inventariar dependências e licenças de cada artefato, inclusive Bun/nativas;
  registrar alcançabilidade sem confundir advisory com exploração demonstrada.
- [ ] Definir auditoria recorrente; exceções precisam de motivo, mitigação, dono e
  expiração. Não silenciar avisos ou elevar baselines para aprovar a versão.

#### A15 — Governança e publicação · P1 · pendente, mudanças remotas não autorizadas

- [ ] Revalidar proteções/regras e bypasses efetivos da `main`, permissões de
  colaboradores e checks obrigatórios, compatíveis com o plano atual do GitHub.
- [ ] Preparar `SECURITY.md`, canal privado, versões suportadas e procedimento de
  triagem/aviso/retirada; revisar ações fixadas por SHA e proveniência dos pacotes.
- [ ] Planejar release com aprovação do mantenedor e credenciais mínimas/curtas ou
  identidade de CI; provar que candidato reprovado não publica.
- [ ] Pedir autorização específica antes de alterar controles remotos, tokens,
  visibilidade ou executar a primeira publicação. Não ler/expor tokens pessoais.

#### A16 — Robustez e experiência residual · P2, reclassificar riscos encontrados

- [ ] Após liberar PRs/Issues, cobrir falhas pós-despacho/reconciliação inválida,
  saída excessiva e resultado incerto com `gh` falso; escrita remota real somente
  em repositório de teste expressamente autorizado, sem replay automático.
- [ ] Definir allowlist/aviso para abrir respostas externas; testar SVG/PDF,
  MIME/extensão/nome sem executar conteúdo ativo de origem não confiável.
- [ ] Cobrir download parcial, erro de disco, cancelamento, status inesperado e
  limpeza; reenvio de GET para baixar completo permanece ação explícita.
- [ ] Auditar drafts SQL, staging e saída global; distinguir desfocar/fechar,
  descartar rascunho, parar processo e alteração já enviada ao servidor.
- [ ] Exercitar terminais reais legacy/Kitty, Alt/Option, Space/Alt+Space, Escape,
  paste, Unicode, clipboard, mouse e resize em compact/framed e seis idiomas;
  incluir Terminal.app/iTerm2, Linux, Windows Terminal, tmux e SSH.
- [ ] Revisar README, ajuda, planos/handoffs e demos após mudanças; manter claro
  o que está implementado versus futuro e as limitações de segredo/rollback/OS.
- [ ] Converter cada achado residual em teste ou decisão com responsável e prazo;
  elevar a P0/P1 se envolver segredo, alvo incorreto, perda ou duplicação de escrita.

### Roadmap registrado, fora dos bloqueadores desta alfa

Estes itens continuam visíveis para não se perderem, mas não devem ampliar a
estabilização sem uma decisão de escopo:

- Banco: importação CSV/TSV/JSON com mapeamento e validação em staging; inspeção de
  triggers e navegação visual opcional de relacionamentos; favoritos com “Salvar
  como”, renomeação/organização e limpeza/persistência opcional do histórico de tabs.
- HTTP: evoluções futuras e critérios condicionais continuam em
  `HTTP_CLIENT_PLAN.md` e `docs/handoffs/http-client-rebuild.md`; fases funcionais
  concluídas não substituem os bloqueadores A04–A06/A09/A10/A13/A16.
- Plugins: revisar `PLUGIN_SYSTEM_PLAN.md` antes de iniciar SDK, isolamento,
  permissões, comandos ou distribuição de extensões; não é comportamento atual.
- Git remoto: preservar os planos de PR, Issues e Inbox sem incorporar outras
  branches ou executar ações remotas durante o adiamento solicitado.

### Evidência e comandos para a próxima sessão

A investigação HTTP anterior capturou e cancelou 1,5 MB em cerca de 100 ms, mas
levou aproximadamente 10 s adicionais até a UI confirmar `TRUNCADO`. Houve falhas
por timeout de 15 s e passes isolados de 11–12,5 s. Isso **não prova** que a captura
esteja ilimitada nem identifica a causa do atraso. A instrumentação temporária
foi removida; não há correção de performance neste checkpoint.

Também preservar no acompanhamento: CI Linux histórico em cookies/TLS, watcher
HTTP, avisos React `act(...)` e fixture Git PR de timeout de 150 ms que falhou em
uma rodada e passou em outra. Um passe posterior não encerra essas investigações.

Comandos existentes, a executar na raiz do projeto, separadamente para preservar
o resultado de cada etapa:

```sh
git status --short --branch
bun install --frozen-lockfile
bun run check
git diff --check
bun run test:database:drivers
TUIMINAL_HTTP_PTY=1 bun test tests/http-redirect-pty.test.ts
bun test --preload ./tests/tui/setup.ts tests/tui/http-redirect.test.tsx
bun test --preload ./tests/tui/setup.ts tests/tui/http.test.tsx --test-name-pattern 'keeps a continuous response bounded'
bun run docs:demos
```

Usar Docker descartável para drivers e servidores loopback/configs temporárias
nos demais testes. A suíte PTY opt-in requer suporte nativo e não cobre Windows
por inferência. Os 8 skips de Docker/hooks e 2 de PTY no gate padrão precisam de
execução separada; distinguir skips de evidência aprovada. Não acessar produção.

As cinco demos foram regeneradas pelo script com fixtures; somente os GIFs Git,
Runner e Terminal tiveram diferença de bytes nesta rodada.

### Verificação final do checkpoint (9/9/2026)

| Verificação | Resultado desta rodada | Pendência/limite |
| --- | --- | --- |
| `bun run check` | **Exit 1**: tipos, formato, lint, arquitetura, manutenção e unitários passaram; TUI com **97 pass / 1 fail**, 1.444 assertions | Teste de resposta HTTP contínua levou 15.158 ms e excedeu 15.000 ms; A10/A13 abertos |
| `bun run test:unit`, repetido separadamente | **Exit 0**, 582 pass / 10 skip / 0 fail, 2.866 assertions, 592 testes em 58 arquivos | Docker/hooks e PTY são opt-in; não significam aprovação da matriz nativa |
| `TUIMINAL_HTTP_PTY=1 bun test tests/http-redirect-pty.test.ts` | **Exit 0**, 2 pass / 0 fail, 14 assertions; compact/framed em macOS x64 | Fonte em PTY nativo, não pacote npm nem demais sistemas |
| `bun run docs:demos` | **Exit 0**, cinco demos geradas com fixtures | Não acessa serviços ou credenciais reais |
| `git diff --check` | **Exit 0** | Verificação textual, não teste funcional |
| Drivers Docker | Última execução da implementação: **6 pass, 124 assertions** | Não repetida no fechamento; TLS/credenciais mínimas/plataformas seguem abertos |
| Frozen install, binários finais e npm | Não repetidos/produzidos nesta etapa de checkpoint | Validação e publicação futuras continuam sujeitas aos aceites e autorização |

O commit é deliberadamente um **checkpoint de trabalho incompleto**, com o gate
vermelho documentado. Não foram removidos testes, elevados timeouts/baselines nem
ocultados avisos para aparentar aprovação. O próximo trabalho começa pela falha
acima e pelo checklist, não pela publicação. Ao retomar, registrar `git rev-parse
HEAD` e vincular novas evidências ao SHA efetivamente testado.

## 10. Fechamento da retomada local — 10/9/2026

Esta seção substitui o checklist aberto da seção 9 como retrato operacional. O
trabalho possível no checkout local foi concluído, mas as alterações ainda estão
sem commit sobre `4d7a5be58fd682dd722d8e3b89575b0502da8ef1` em `development`.
Consequentemente, elas não formam um SHA candidato imutável e não autorizam tag,
release GitHub ou publicação npm.

### Resultado dos achados

| ID | Estado local | Implementação/evidência encerrada | Aceite externo ou residual |
| --- | --- | --- | --- |
| A01 | **Corrigido e coberto** | Proveniência direta e única por dialeto; projeções derivadas, aliases/duplicatas e sintaxe ambígua falham fechadas. O fluxo TUI preserva a PK composta até revisão e execução. | Repetir no pacote candidato e nos drivers nativos. |
| A02 | **Corrigido e coberto** | Classificador conservador, SQLite readonly, PostgreSQL `READ ONLY` e proteção/restauração de sessão MySQL/MariaDB, invalidando o pool quando a restauração falha. | MCP continua dependendo de servidor/credencial realmente RO; repetir matriz atual em Docker e nos sistemas anunciados. |
| A03 | **Corrigido e coberto** | Histórico novo persiste só metadados; SQL, erros e parâmetros ficam em cache volátil limitado. Limpeza legada é explícita e preserva favoritos/metadados. | Backups e queries salvas deliberadamente não são sanitizados automaticamente. |
| A04 | **Corrigido e coberto** | Contexto privado acompanha sucesso, falha, redirect, chaining, assertions, histórico e reports; valores e encodings conhecidos são redigidos sem alterar a resposta ativa. | Dados antigos não são apagados implicitamente; corpo público opt-in ainda pode conter segredo não reconhecido. |
| A05 | **Corrigido e coberto** | Redirects removem credenciais por proveniência/valor, preservam a origem dos cookies e pausam body/URL privada, downgrade e TLS inseguro. Continuação, recusa, timeout e cancelamento não repetem POST/dependências. | Repetir TLS/proxy/PTY com os pacotes nos demais sistemas. |
| A06 | **Corrigido e coberto** | Cookie jar usa PSL mantida, incluindo sufixos privados, normaliza IDN/IP, aplica prefixos seguros e limites de vida, tamanho, quantidade e header, e isola diretório/ambiente/coleção. | Validar novamente no candidato nativo. |
| A07 | **Corrigido e coberto** | Autostart exige aprovação local da raiz canônica e fingerprint material; a revisão mostra comandos, cwd, perfil, nomes de ambiente, arquivos, PTY e políticas. Mudanças revogam confiança; Procfile/mprocs não ganham autostart. | Revisão humana do modal nos terminais-alvo. |
| A08 | **Corrigido e coberto** | Stop de Runner/Free Terminal é assíncrono e idempotente, mantém ownership até saída observada, escala somente a árvore/grupo criado e faz restart/shutdown aguardar. Testes preservam processo sentinela externo. | Validar árvores de processos, portas e launcher em macOS/Windows; somente Linux x64 foi exercitado nesta retomada. |
| A09 | **Corrigido e coberto localmente** | Escrita compartilhada rejeita symlinks/ancestrais, usa arquivo temporário protegido, rename atômico, hash contra escrita stale e backup de corrupção. Históricos/configurações não viram vazio silenciosamente. | Falhas reais de filesystem por falta de espaço/interrupção e concorrência multiprocesso precisam da matriz de SO. |
| A10 | **Corrigido e coberto localmente** | Budgets agora limitam aquisição/parse/buffers de Banco, Runner, Git e HTTP; discovery, cookies, datasets, saída, células e respostas têm truncamento/cancelamento explícito. A regressão HTTP contínua passou no gate completo. | Medição comparável de pico de memória/CPU e latência nos seis sistemas permanece parte da qualificação do candidato. |
| A11 | **Corrigido e coberto** | Escritas revalidam alvo, schema e snapshot dentro de uma transação; distinguem matched/affected/no-op/confirmed e estado de commit incerto. MySQL não transacional é bloqueado; não há retry automático. | Repetir os casos em MySQL/MariaDB/PostgreSQL atuais; Docker não estava disponível nesta WSL. |
| A12 | **Corrigido e coberto** | Checkout falha fechado para status, timeout, gitdir/index inválido e erro de inspeção; revalida imediatamente antes do único despacho e serializa por clone, compartilhado com Issues. | Escrita remota real continua fora de escopo sem repositório de teste autorizado. |
| A13 | **Preparado; aceite nativo pendente** | Workflow manual read-only cobre seis runners; build cruzado gerou os seis pacotes, manifests, helper e checksums. O smoke conferiu todos os tarballs e executou launcher, HTTP loopback e helper SQLite em Linux x64 com Node 22 e sem Bun no `PATH`. | O workflow ainda precisa rodar no mesmo SHA imutável; cinco runtimes nativos, PTY/shutdown, chaveiro, TLS/proxy e ciclo upgrade/uninstall continuam sem prova nesta retomada. |
| A14 | **Corrigido e automatizado** | MCP SDK atualizado, `qs` fixado em versão corrigida, `bun audit --json` limpo, inventário reproduzível em `THIRD_PARTY_NOTICES.md` e licença exata do Bun empacotada. Audit e licenças agora fazem parte dos workflows/gates apropriados. | Inventário não substitui revisão jurídica independente do artefato final. |
| A15 | **Controles locais prontos; governança remota pendente** | `SECURITY.md`, processo de release, hashes, conteúdo exato de pacote, ações fixadas por SHA e workflow candidato sem credenciais/permissão de publicação foram adicionados. | Revalidar proteção/bypasses/colaboradores da `main`, configurar Trusted Publishing e obter aprovação explícita de versão, SHA, tag, notas e dist-tag. |
| A16 | **Hardening local concluído; matriz humana pendente** | Saída excessiva de `gh` vira resultado incerto com reconciliação e despacho único; abrir resposta externa aceita somente raster com MIME + magic bytes; SVG/PDF/spoof ficam bloqueados. Download cobre parcial, cancelamento, disco e status. PTY real compact/framed passou. | Matriz de terminais/idiomas/SO, revisão visual dos demos e qualquer escrita remota controlada dependem dos ambientes e autorizações indicados abaixo. |

### Evidência final desta árvore de trabalho

| Verificação | Resultado em 10/9/2026 | Limite |
| --- | --- | --- |
| `bun run check` | **Exit 0**: 611 testes unitários/integrações locais passaram, 10 foram pulados; 99 testes TUI passaram. Tipos, formato, lint, arquitetura, manutenção e licenças passaram; **448 módulos, 2.045 dependências, zero violações e zero regressões de baseline**. | Os skips são a matriz Docker/hooks e PTY opt-in; warnings de complexidade histórica e React `act(...)` permanecem visíveis. |
| PTY opt-in | `TUIMINAL_HTTP_PTY=1 ...`: **2 pass, 14 assertions**, compact/framed em Linux x64. | Não prova outros terminais ou sistemas. |
| Dependências | `bun audit --json`: **Exit 0, `{}`**. Frozen install Linux x64 não alterou o lockfile; SHA-256 do `bun.lock`: `6367b4692fff6e3132af99a78aaa7d31d43de8fb9a4c753f92ce869434ca942e`. | Resultado temporal; repetir no SHA candidato. |
| Distribuição | `bun run build:release all`: seis plataformas compiladas. `bun run test:release`: **passou todos os manifests e o runtime Linux x64** com Node 22.23.2, pacote instalado em path com espaço/Unicode, sem Bun no `PATH`. | Compilação cruzada não equivale a execução nativa dos outros cinco pacotes. `dist/` é artefato ignorado e não foi publicado. |
| Drivers reais | Não executado: comando `docker` indisponível nesta distribuição WSL 2. | A execução anterior registrada na seção 8 não substitui a repetição após A11. |
| Demos | Tentativa feita; falhou antes da conversão porque `magick`/ImageMagick não está instalado. | Instalar a ferramenta no ambiente apropriado, executar `bun run docs:demos` e revisar os cinco GIFs. Nenhum GIF foi alterado nesta tentativa. |
| GitHub/npm | Nenhuma consulta autenticada confiável, alteração remota ou publicação foi feita; `gh` não está disponível. | Estado efetivo de proteção, permissões, checks e registry deve ser revalidado com autorização. |

### Bloqueadores restantes para aprovar a alfa

Não resta implementação local conhecida dos achados A01–A16 sem uma decisão já
registrada, mas **a release continua bloqueada** até que todos os itens abaixo
sejam vinculados ao mesmo SHA candidato:

1. criar o commit imutável somente quando o mantenedor pedir e obter o gate verde
   do workflow comum e da matriz manual nos seis runners nativos;
2. repetir a matriz Docker de SQLite/MySQL/MariaDB/PostgreSQL após A11;
3. executar nos pacotes nativos a matriz de PTY/process tree, helper, TLS/proxy,
   chaveiro, terminal/mouse/clipboard/Unicode e upgrade/uninstall;
4. regenerar e revisar visualmente os cinco demos com ImageMagick;
5. realizar revisão independente de segurança/licenças e revalidar governança,
   proteção, bypasses e identidade de publicação no GitHub/npm;
6. obter do mantenedor aprovação explícita para versão, SHA, tag, release notes e
   dist-tag. Candidato reprovado ou resultado incerto não publica nem é repetido
   automaticamente.

Até esses aceites, o termo correto é **hardening local concluído**, não “alfa
pronta”. Nenhuma limitação externa foi convertida em passe por inferência.
