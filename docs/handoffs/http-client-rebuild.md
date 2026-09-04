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

O resultado atual já é um workspace funcional, mas o programa de evolução ainda
não está concluído. A regra para as próximas mudanças é preservar o que funciona,
fechar as lacunas documentadas abaixo e manter o gate `bun run check` verde.

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

### Fase 1 — avançada

- Quatro modos responsivos, builder e response simultâneos, seis tabs, split,
  maximização, jump mode e método customizado.
- Params, Headers, Body, Auth e Mais conectados ao draft.
- Preview da requisição preparada mostra origem dos valores e mascara segredos.
- Saída do aplicativo confirma drafts HTTP ainda não salvos.
- Pendente: validar em terminal real toda a matriz entre `60x16` e `160x40`, nos
  layouts framed/compact e nas seis línguas.

### Fase 2 — avançada

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

Pendências desta fase, em ordem:

1. Criar uma matriz ampla e versionada de fixtures `.http` baseada na sintaxe
   documentada pelo JetBrains HTTP Client.
2. Exibir o texto raw completo do bloco opaco. Hoje a UI avisa em Opções que o
   request é somente leitura, mas ainda não oferece o pane raw planejado.
3. Decidir e implementar o escopo de ambientes por diretório. O carregador atual
   considera os arquivos público/privado na raiz do projeto; a referência
   JetBrains permite resolução pelo arquivo mais próximo e diretórios pais.
4. Manter explicitamente bloqueadas, até implementação real, diretivas como
   `@connection-timeout`, `@no-cookie-jar` e `@no-auto-encoding`.

### Fase 3 — avançada

- Busca e folding, JSONPath, copiar/salvar, resposta binária, redirect, cookies,
  timing, histórico opt-in, comparação e download completo.
- Pendente: expor as opções avançadas previstas no plano, em especial cookie jar,
  proxy e TLS, e fazer auditoria manual de carga com respostas grandes/contínuas.

### Fase 4 — avançada

- Importadores Postman/OpenAPI com preview, assertions, chaining e extrações
  secretas voláteis.
- Collection runner com dataset/concorrência e CLI com relatórios text, JSON e
  JUnit. Execução individual e em coleção usam o mesmo motor; dependências são
  resolvidas topologicamente.
- Pendente: fixtures amplas de compatibilidade de importação e validação final dos
  fluxos TUI e CLI.

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

1. Começar pelas fixtures `.http` e pela visualização raw de blocos opacos. Isso
   reduz o maior risco atual: perda ou execução incorreta de arquivos do usuário.
2. Implementar/testar resolução de ambientes por diretório somente depois de
   registrar no plano a regra exata de precedência e escopo.
3. Executar a matriz visual real da Fase 1 e registrar cada breakpoint problemático
   como regressão automatizada quando possível.
4. Fechar opções da Fase 3 e fixtures/validação da Fase 4.
5. Só então concluir tutorial, documentação final de atalhos e gate de release.

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

- `bun run check`: aprovado;
- arquitetura: 208 módulos, 944 dependências e 0 violações;
- manutenção: 0 regressões e 58 funções preexistentes acima da complexidade 20;
- testes unitários: 249 aprovados, 6 integrações pesadas ignoradas por opt-in e 0
  falhas;
- testes TUI: 23 aprovados e 0 falhas.

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

Não marque o programa como pronto enquanto restarem: matriz visual em terminal
real, raw seguro para sintaxe opaca, opções avançadas, fixtures amplas de
compatibilidade, tutorial/documentação final e gate completo de release. Atualize
este handoff e `HTTP_CLIENT_PLAN.md` sempre que uma dessas fronteiras mudar.
