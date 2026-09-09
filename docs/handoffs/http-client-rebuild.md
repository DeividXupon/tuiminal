# Handoff da reconstrução do cliente HTTP

Este documento permite continuar a reconstrução do HTTP sem depender do histórico
de uma sessão do Codex. A especificação de produto e a pesquisa de UX continuam em
[`HTTP_CLIENT_PLAN.md`](../../HTTP_CLIENT_PLAN.md); as convenções duráveis de todo o
repositório estão em [`AGENTS.md`](../../AGENTS.md).

## Objetivo e limite da migração

O HTTP foi reconstruído do zero dentro do monólito modular. A implementação antiga
em `src/http.ts` e `src/components/HttpClient.tsx` foi removida; ela não deve ser
reintroduzida nem usada como modelo interno. Somente contratos externos do CLI e a
infraestrutura compartilhada do Tuiminal podem ser reutilizados.

O resultado atual é um workspace funcional e as fases 0–4 do programa foram
concluídas. A regra para as próximas mudanças é preservar o que funciona, tratar a
Fase 5 somente quando houver demanda/evidência e manter o gate `bun run check`
verde.

## Onde cada responsabilidade está

- `src/features/http/HttpWorkspace.tsx`: composição da feature; deve permanecer
  fino. Estado e efeitos novos devem ir para hooks, serviços ou modelos.
- `src/features/http/model/`: contratos puros de request, response, layout,
  navegação, variáveis, assertions, arquivos `.http` e automação.
- `src/features/http/services/`: preparação/execução limitada e cancelável,
  cookies, redirects, downloads, preview e collection runner.
- `src/features/http/storage/`: coleção, ambientes, configuração, histórico,
  conflitos externos e snapshots de resposta.
- `src/features/http/hooks/`: ownership do estado e dos fluxos da interface.
- `src/features/http/ui/`: panes, editores, modais e overlays.
- `src/features/http/importing/`, `exporting/` e `cli/`: interoperabilidade e modo
  headless.
- `src/shared/i18n/http-*.ts`: textos fixos da feature nas seis línguas.
- `tests/http-*.test.ts`, `tests/http.test.ts` e `tests/tui/http.test.tsx`:
  regressões de domínio, integração local e TUI.

## Estado entregue por fase

### Fase 0 — concluída

- Nova separação de domínio, layout, transporte, storage e UI.
- Ownership de execução por documento, cancelamento, timeout e limite de captura.
- Regressões para transporte, ciclo de vida e consumo correto de `[Esc]`.

### Fase 1 — concluída no escopo atual

- Quatro modos responsivos, builder e response simultâneos, seis tabs, split,
  maximização, jump mode e método customizado.
- Params, Headers, Body, Auth e Mais conectados ao draft.
- Preview da requisição preparada mostra origem dos valores e mascara segredos.
- Saída do aplicativo confirma drafts HTTP ainda não salvos.
- A matriz automatizada cobre `60x16`, `72x18`, `80x24`, `96x24`, `120x30` e
  `160x40`, framed/compact e as seis línguas, com URL/CJK longos, seis documentos,
  bounds dos controles e resize sem perder a identidade do input. Ela encontrou e
  fixou overflow no omnibar/rodapé/panes, tabs estreitas e falta de espaço nos
  editores mínimos.
- Sessões PTY reais confirmaram framed e compact nas seis dimensões, o resize
  `160x40 → 60x16 → 160x40` sem perder o conteúdo editado, drag real do divisor,
  sequência de `[Esc]` e alinhamento CJK em japonês. A auditoria rodou dentro de
  WezTerm/WSL2 e em um socket tmux isolado; GNU Screen, VS Code Terminal, Windows
  Terminal e macOS não estavam disponíveis nesta máquina.

### Fase 2 — concluída no escopo atual

- Scanner e watcher do projeto, parser/serializer `.http`, request body por
  arquivo, multipart, ambientes público/privado e import/export cURL.
- Conflito de arquivo externo abre diff redigido e exige escolher entre recarregar,
  aplicar o draft local ou salvá-lo como cópia; nunca sobrescreve silenciosamente.
- O gerenciador de ambientes cria segredos no arquivo privado com modo `0600`,
  oferece adicionar a regra ao `.gitignore` e, quando disponível, guarda somente
  uma referência opaca no keychain do sistema.
- Defaults não secretos do workspace são editados por `[E]` e depois `[W]` e
  persistem atomicamente em `.tuiminal/http/config.json` com modo `0600`.
- Precedência implementada: opção explícita do request vence o default do
  workspace; o default do workspace vence o valor-base do runtime. O seletor da UI
  consegue voltar ao estado herdado.
- Primeira auditoria de compatibilidade JetBrains concluída: `#` e `//` em
  diretivas, `# @name`/`# @name =`, GET abreviado, URLs multilinha e `@timeout`
  com `ms`, `s` ou `m`. Timeout sem unidade segue a semântica JetBrains de segundos.
- Blocos com scripts, handlers/redirecionamento de resposta ou diretivas ainda não
  suportadas são opacos: ficam somente leitura e não podem ser executados nem
  reserializados como se fossem compreendidos.
- A matriz versionada em `tests/fixtures/http/` cobre sintaxe editável, bodies,
  diretivas opacas, scripts, redirects de saída, versões HTTP e protocolos da Fase
  5. Blocos opacos agora abrem com o raw original completo em um pane rolável; o
  builder e o omnibar editáveis não permanecem ativos.
- A resolução de ambientes agora é feita por nome para cada request: procura do
  diretório do `.http` até a raiz, o primeiro escopo vence por inteiro, o privado
  sobrescreve o público apenas no mesmo diretório e irmãos ficam isolados. Scratch
  usa somente a raiz e novos segredos são criados ao lado do arquivo ativo.

As pendências registradas para esta fase foram fechadas. Diretivas ainda sem
semântica segura, como `@connection-timeout` e `@no-auto-encoding`, permanecem
explicitamente opacas na matriz até uma implementação completa de parse, execução
e serialização. `@no-cookie-jar` saiu dessa lista porque já possui parse, execução,
preview e serialização completos.

### Fase 3 — concluída no escopo atual

- Busca e folding, JSONPath, copiar/salvar, resposta binária, redirect, cookies,
  timing, histórico opt-in, comparação e download completo.
- `[C]` em Opções inclui ou ignora o cookie jar por request. O estado aparece no
  preview, faz round-trip por `# @no-cookie-jar` e, quando desativado, não lê cookies
  nem incorpora `Set-Cookie` da resposta.
- Proxy HTTP/HTTPS explícito aceita variável privada, aparece redigido no preview,
  é aplicado em todos os redirects e faz round-trip por `# @proxy` e cURL
  `--proxy`. Credenciais literais não podem ser persistidas e erros de transporte
  também são redigidos.
- `[V]` alterna verificação TLS. `# @insecure-tls` e cURL `--insecure` fazem
  round-trip; antes do transporte a TUI exige `[I]` por target, ambiente e sessão,
  inclusive para cada novo target HTTPS após redirect. A CLI exige
  `--allow-insecure-tls`.
- A auditoria local de carga encerrou um stream contínuo ao atingir exatamente
  1.500.000 bytes. O teste TUI mantém o pane interativo após o truncamento; para
  evitar syntax highlighting e layout de megabytes, o preview usa um único texto
  nativo limitado a 50 mil caracteres, enquanto `Salvar` preserva toda a captura.

As pendências registradas para esta fase foram fechadas.

### Fase 4 — concluída no escopo atual

- Importadores Postman/OpenAPI com preview, assertions, chaining e extrações
  secretas voláteis.
- Collection runner com dataset/concorrência e CLI com relatórios text, JSON e
  JUnit. Execução individual e em coleção usam o mesmo motor; dependências são
  resolvidas topologicamente.
- A matriz versionada em `tests/fixtures/http/import/` cobre Postman v2.1,
  OpenAPI 3.0 JSON e 3.1 YAML: herança, secrets, URL estruturada, headers, bodies,
  `$ref` local, `allOf`, servers por escopo, override de parâmetros, callbacks,
  webhooks e referências externas explicitamente não seguidas.
- TUI e CLI percorrem preview, relatório e escrita protegida com placeholders
  privados únicos; os testes confirmam que nenhum segredo literal chega ao `.http`
  importado ou à prévia.

As pendências registradas para esta fase foram fechadas.

### Tutorial e split por mouse

- O tour HTTP usa dados simulados e seis targets estáveis: documentos, omnibar,
  coleção, request, automação/segurança e response. Ele não lê o projeto nem faz
  rede, e todo texto do card possui tradução nas seis línguas.
- O split request/response pode ser ajustado pelos botões `[Ctrl+↑/↓]` ou por um
  handle arrastável real. Ambos alteram a mesma proporção por documento, limitada
  a 25%–70%; há regressão TUI usando eventos de mouse por coordenada.

### Fase 5 — deliberadamente não iniciada

OAuth2, certificados, SSE, WebSocket, scripting, GraphQL e gRPC só devem começar
quando houver a evidência e os critérios de segurança definidos no plano.

## Invariantes que não podem regredir

- Toda execução termina em sucesso, erro ou cancelamento; trocar de tab não pode
  entregar resultado a outro documento.
- Timeout, cancelamento e limites de memória continuam pertencendo ao serviço de
  transporte, não a um componente React.
- Segredos não entram em arquivo público, preview aberto, histórico, logs,
  conflito, export ou mensagem de erro. Arquivos privados usam `0600`.
- Headers de API keys personalizadas, campos sensíveis e valores privados
  resolvidos preservam sua classificação no request preparado. Após um redirect
  mudar a origem, eles não são enviados em nenhum hop restante desse fluxo.
- Um bloco `.http` parcialmente compreendido nunca é executado nem salvo como se
  fosse seguro. Preservar texto é preferível a uma conversão destrutiva.
- Requests usam `explícito > workspace > base`; valores de ambiente continuam
  sujeitos à resolução e ao mascaramento próprios.
- O watcher ignora `.git`, `node_modules`, `.tuiminal/http/history` e exports, e
  deve continuar funcionando em plataformas sem `fs.watch` recursivo.
- `[Esc]` fecha somente a camada superior e o evento deve ser consumido. Nenhum
  atalho global dispara enquanto input, editor, modal ou picker possui o teclado.
- Todo atalho visível fica entre colchetes e toda ação principal possui alternativa
  de mouse quando praticável.
- Texto fixo novo passa por `translateUi` e ganha cobertura nas seis línguas.
- Não persistir dados de resposta por padrão. Metadata/body de histórico exigem os
  opt-ins separados da configuração do workspace.

## Próxima sequência recomendada

1. Preservar o gate e as matrizes versionadas ao evoluir as fases concluídas.
2. Repetir oportunisticamente a auditoria de compatibilidade em GNU Screen, VS Code
   Terminal, Windows Terminal e macOS quando esses ambientes estiverem disponíveis.
3. Só iniciar recursos da Fase 5 após registrar demanda, limites e modelo de
   segurança no plano.

## Como validar e retomar

Use Bun 1.3.14, fixado em `.bun-version` e `package.json`:

```bash
bun install --frozen-lockfile
bun run check
git diff --check
```

O gate executa typecheck, format check, lint, fronteiras arquiteturais, baseline de
manutenção, testes unitários e testes TUI. A matriz pesada de drivers de banco é
opt-in e não faz parte do gate offline:

Estado verificado na entrega deste handoff:

- gate completo: aprovado com Bun 1.3.14 e também com o Bun 1.4.2 disponível no
  ambiente;
- arquitetura: 292 módulos, 1317 dependências e 0 violações;
- manutenção: 0 regressões e 57 funções preexistentes acima da complexidade 20;
- testes unitários: 337 aprovados, 6 integrações pesadas ignoradas por opt-in e 0
  falhas;
- testes TUI: 44 aprovados e 0 falhas;
- `git diff --check`, typecheck, format check e lint: aprovados.

```bash
bun run test:database:drivers
```

Para localizar rapidamente itens ainda abertos:

```bash
rg -n "Ainda falt|Restam|pendente|não iniciada" HTTP_CLIENT_PLAN.md docs/handoffs/http-client-rebuild.md
```

## Alertas conhecidos

- Os testes TUI podem imprimir avisos do React sobre atualizações fora de `act()` e
  do `EventTarget` sobre muitos listeners. Eles não anulam assertions, mas devem ser
  eliminados em uma rodada própria; não silencie avisos enfraquecendo testes.
- O script de manutenção aceita uma baseline documentada de funções antigas acima
  da complexidade 20. Não aumente essa baseline; extraia responsabilidades.
- Uma instalação Bun pode avisar sobre chaves duplicadas no `package.json` do
  diretório pai do checkout. Esse arquivo está fora do repositório Tuiminal e não
  deve ser modificado por este projeto.
- `tuiminal-exports/` é saída local do produto e está ignorado. Não transforme uma
  resposta real exportada durante teste manual em fixture do repositório.

## Critério para declarar o plano concluído

O plano das fases 0–4 foi concluído com fixtures amplas de importação, tutorial,
documentação, auditoria PTY disponível e gate final no Bun 1.3.14. Compatibilidade
em sistemas/emuladores ausentes continua sendo uma verificação futura, sem alegar
cobertura que esta máquina não forneceu. Atualize este handoff e
`HTTP_CLIENT_PLAN.md` sempre que uma dessas fronteiras mudar.
