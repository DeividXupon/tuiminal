# Prontidão para alfa

Este é o checklist operacional de qualificação, não um histórico de sessões.
O hardening local registrado em 10/9/2026 foi concluído; **a alfa não está
aprovada**. Alterações e testes locais não comprovam o funcionamento dos pacotes
nos seis sistemas anunciados, nem autorizam commit, tag ou publicação.

O procedimento e as exigências de distribuição estão no
[processo de release](./docs/release-process.md). As invariantes implementadas
ficam no [AGENTS.md](./AGENTS.md), nas [especificações Git](./docs/design/git-pr-interface.md)
e no [README](./README.md), evitando repetir aqui planos já concluídos.

## Resumo do hardening local

Os IDs abaixo preservam a rastreabilidade da auditoria original. “Corrigido
localmente” não dispensa revalidação no candidato nem constitui certificação.

| IDs | Entrega local | Limite que permanece relevante |
| --- | --- | --- |
| A01–A02 | Proveniência conservadora para SQL editável e proteção nativa de leituras por dialeto. | Repetir nos drivers nativos. Servidores MCP e rotinas do banco dependem de credenciais e permissões realmente restritas. |
| A03 | Histórico SQL novo persiste metadados; SQL, parâmetros e diagnósticos ficam em cache volátil limitado. | Favoritos salvam SQL por escolha explícita; limpeza legada e backups não são automáticos. |
| A04–A06 | Contexto privado HTTP, consentimento de redirects, isolamento de credenciais e cookies com PSL, prefixos e limites. | Repetir TLS/proxy/PTY nos pacotes. Histórico antigo não é apagado implicitamente; corpo público opt-in pode conter segredo não reconhecido. |
| A07–A08 | Autostart exige confiança na raiz/fingerprint; encerramento mantém ownership e aguarda somente os processos criados. | Aceite humano do modal e matriz nativa de árvores de processos, portas e launcher. |
| A09–A10 | Persistência protegida, detecção de corrupção/escrita stale e limites de aquisição, buffers e renderização. | Validar falta de espaço, interrupção, concorrência multiprocesso e medidas de memória/CPU/latência nos sistemas-alvo. |
| A11 | Escritas revalidam alvo/schema/snapshot em transação, distinguem resultado incerto e não repetem automaticamente. | Repetir MySQL/MariaDB/PostgreSQL após as mudanças; tabelas MySQL não transacionais continuam bloqueadas. |
| A12 | Checkout compartilhado de PR/Issue inspeciona clone/remote/index/status, serializa e revalida antes do único despacho. | Escrita remota real exige repositório de teste e autorização próprios. |
| A13 | Matriz manual read-only, empacotamento de seis alvos e smoke do launcher/helper sem Bun no `PATH`. | Compilação cruzada não prova execução nativa; o aceite dos seis pacotes segue pendente. |
| A14–A15 | Inventário de licenças reproduzível, auditoria de dependências e controles locais de release. | Repetir no candidato, obter revisão independente e verificar governança/identidade de publicação remotas. |
| A16 | Transporte `gh` limitado com reconciliação sem replay; abertura externa de resposta restrita a raster validado e download controlado. | Aceite humano de terminais/idiomas/SO, demos e eventuais escritas remotas autorizadas. |

## Evidência histórica e limites

Na rodada local de 10/9, `bun run check`, PTY HTTP opt-in compact/framed,
auditoria de dependências, build cruzado e smoke de distribuição em Linux x64
passaram. Isso não substitui uma execução no SHA candidato: contagens e resultados
de dependências envelhecem e devem ser registrados novamente em cada qualificação.

Naquela rodada, a matriz Docker não pôde ser repetida, os demos não foram gerados
por ausência do ImageMagick e os outros cinco runtimes nativos não foram
exercitados. Proteções/permissões GitHub e publicação npm não foram validadas.
Esses itens continuam sem aceite neste checklist; ausência de ambiente não é passe.

## Bloqueadores para aprovar a alfa

Todos os resultados precisam corresponder ao **mesmo SHA candidato imutável**:

- [ ] Definir o candidato com o mantenedor. Criar commit somente quando solicitado;
  executar `bun run check`, `git diff --check` e o workflow comum nesse SHA.
- [ ] Executar `Release candidate matrix` nos seis runners nativos, conferindo
  pacotes, hashes, launcher e helper SQLite sem Bun no `PATH`.
- [ ] Repetir `bun run test:database:drivers` e os casos de SQLite, MySQL, MariaDB
  e PostgreSQL após as mudanças de escrita/readonly.
- [ ] Validar nos pacotes nativos PTY, encerramento/árvore de processos, helper,
  TLS/proxy, chaveiro, terminal, mouse, clipboard, Unicode e upgrade/uninstall.
- [ ] Regenerar `bun run docs:demos` com ImageMagick e revisar os cinco demos.
- [ ] Repetir auditoria de dependências/licenças e realizar revisão independente
  do artefato final; o inventário não substitui essa revisão.
- [ ] Verificar proteção de branches, bypasses, colaboradores e identidade de
  publicação no GitHub/npm, incluindo Trusted Publishing.
- [ ] Obter aprovação explícita de versão, SHA, tag, notas e dist-tag.

Candidato reprovado ou resultado incerto não publica nem repete uma escrita
automaticamente. Nenhum item acima autoriza por si só alterações remotas.

## Pontos de investigação preservados

A revisão de código de 12/9 registrou as hipóteses abaixo, **não falhas reproduzidas
no gate final**. Verifique a implementação e crie uma reprodução antes de propor
correção; esta lista não implica que todos os riscos já foram resolvidos.

- Git: respostas tardias no console/diff/stage ao trocar de projeto, concorrência
  de configuração, ciclo de vida do terminal guiado e precedência de consultas
  booleanas/escopo de conta/identidade.
- Runner: validação dos dados restaurados.
- HTTP: salvamentos concorrentes, prévia de importação obsoleta, foco de modais
  e limites de renderização JSON.
- Traduções: dados tratados como texto de UI, códigos de erro em português,
  custo de padrões em avisos desconhecidos profundamente aninhados e entradas
  antigas sem confirmação de ausência de consumidores.
- Scripts: atalhos antigos nas demos, isolamento dos smoke tests e espera pela
  limpeza de processos.
- Testes: restauração das preferências do Inbox, limpeza após falhas de asserção,
  conexão ou servidor e esperas fixas sensíveis à carga da máquina.

Ao qualificar o candidato, registre SHA, plataforma, comandos executados, skips,
resultados e riscos ainda abertos. Não converta uma revisão local ou um gate verde
em afirmação de ausência de vulnerabilidades.
