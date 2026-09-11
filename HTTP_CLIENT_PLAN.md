# Plano de evolução do cliente HTTP

> Status: plano técnico vivo e registro de execução. As fases descrevem a direção
> alvo; o quadro de andamento distingue o que já possui evidência no worktree do
> que ainda depende de implementação ou validação.
>
> Pesquisa e auditoria atualizadas em 5 de setembro de 2026.
>
> Decisão de implementação: o HTTP será reconstruído do zero. Código, modelos,
> estado, componentes e testes específicos da implementação HTTP anterior não são
> base de migração. Somente contratos externos e infraestrutura compartilhada do
> Tuiminal podem ser reutilizados.
>
> Para retomar o trabalho sem o contexto da sessão anterior, comece pelo
> [handoff da reconstrução HTTP](./docs/handoffs/http-client-rebuild.md). Ele
> registra o mapa do código entregue, as invariantes e a ordem das pendências.

### Revisão de prontidão — 9 de setembro de 2026

A conclusão histórica das fases funcionais não é aprovação para lançamento.
A auditoria em `ALPHA_READINESS_PLAN.md` encontrou falhas de privacidade e
isolamento ainda em correção. O histórico passou a transportar contexto privado
volátil de ponta a ponta (A04), com regressões de encodings, auth, cookies,
extrações, troca de escopo, sucesso/erro e envio pela TUI. Redirects entre origens
(A05) também têm implementação e regressões no checkpoint, ainda sem aceite do
candidato/binário. Política de domínio de cookies (A06), filesystem e limites
globais permanecem pendentes. A seção 9 do plano de alfa consolida a retomada;
não deduzir segurança dessas superfícies pelo passe do histórico.

## Resumo executivo

O cliente HTTP deve evoluir de uma chamada avulsa com histórico de sessão para um
workspace de API integrado ao Tuiminal. A direção recomendada combina:

- a hierarquia visual do Posting: URL sempre visível, coleção lateral, request e
  response simultâneos, foco evidente, tabs densas e ajuda contextual;
- o modelo de projeto do Restless: arquivos `.http` legíveis, versionáveis e úteis
  também fora da TUI;
- a cobertura do ATAC como referência de longo prazo, sem copiar de imediato sua
  grande superfície de protocolos, autenticações e estados;
- a clareza do post-tui como referência de onboarding, mas superando seus limites
  de edição, responsividade, cancelamento, segurança e testes.

A tese de produto é: **a aparência e o fluxo principal lembram Posting; os dados
pertencem ao projeto; a execução é limitada, cancelável e segura por padrão; e o
resultado continua sendo uma parte coerente do Tuiminal, não outro aplicativo
encaixado dentro dele**.

As primeiras entregas não devem começar por OpenAPI, scripts ou WebSocket. A nova
feature começa por contratos de domínio, resolver de layout, ownership de execução,
transporte limitado/cancelável e uma composição nova. Coleções, ambientes, inspeção
avançada e automação entram sobre essa fundação.

## Estado da execução

- **Fase 0 — implementada e coberta por testes direcionados:** a implementação
  anterior foi substituída por módulos novos de domínio, layout, transporte,
  storage e UI; ownership de execução, cancelamento, timeout, captura limitada e
  propagação de `[Esc]` já possuem regressões.
- **Fase 1 — concluída no escopo atual:** os quatro modos responsivos, builder/response, seis tabs,
  split, maximização, jump mode, Params/Headers/Body/Auth/Mais e método customizado
  estão conectados. O preview mostra a requisição preparada com origens e segredos
  mascarados, e sair do aplicativo com drafts HTTP exige confirmação. Uma matriz
  automatizada cobre `60×16`, `72×18`, `80×24`, `96×24`, `120×30` e `160×40` nos
  layouts framed/compact e nas seis línguas, incluindo URL/CJK longos, seis tabs,
  bounds dos controles e resize sem remount. Sessões PTY reais confirmaram framed e
  compact nas seis dimensões, resize durante edição, sequência de `[Esc]`, drag real
  do divisor e alinhamento CJK em japonês, dentro de WezTerm/WSL2 e tmux.
- **Fase 2 — concluída no escopo atual:** scanner/watcher, parser e serializer `.http`, arquivos,
  ambientes público/privado carregados do projeto, cURL, multipart e body por
  arquivo existem. Conflitos externos agora abrem um diff redigido com escolhas
  explícitas para recarregar, aplicar a versão local ou salvá-la como cópia. O
  gerenciador de ambientes cria valores privados em arquivo `0600`, oferece a regra
  de `.gitignore` e pode guardar somente uma referência opaca no keychain. O editor
  visual de defaults não secretos persiste `.tuiminal/http/config.json` e mantém a
  precedência request explícito > workspace. A primeira auditoria corrigiu unidades
  JetBrains de `@timeout`, diretivas `//`, `# @name =`, GET abreviado e URLs
  multilinha. A matriz versionada cobre requests editáveis, bodies, diretivas,
  scripts, redirects de saída, versão HTTP e protocolos não iniciados. Sintaxe
  opaca abre com o bloco raw exato, sem builder/omnibar editável, e fica bloqueada
  para execução, save, move e duplicação. Ambientes são resolvidos por nome, por
  request, do diretório do `.http` até a raiz, sem misturar o escopo vencedor com
  pais ou irmãos; novos valores privados são gravados ao lado do arquivo ativo.
- **Fase 3 — concluída no escopo atual:** busca, folding, JSONPath, copy/save, resposta binária,
  redirect, cookies, timing, histórico opt-in, diff e download completo existem.
  `[C]` agora controla o cookie jar por request, desativa leitura e escrita quando
  necessário, aparece no preview e faz round-trip por `@no-cookie-jar`. Proxy
  HTTP/HTTPS explícito, `@proxy`, cURL `--proxy`, verificação TLS por request,
  `@insecure-tls` e cURL `--insecure` também estão completos. TLS inseguro exige
  aprovação por target/ambiente/sessão na TUI ou `--allow-insecure-tls` no modo
  headless. A auditoria de carga confirmou cancelamento do stream no limite de
  1,5 MB e motivou um preview nativo limitado a 50 mil caracteres. Abrir no
  desktop ficou restrito a PNG/JPEG/GIF/WebP/BMP com MIME e assinatura
  compatíveis; SVG, PDF, binário genérico e MIME forjado só podem ser salvos.
  Download completo reenvia apenas GET, limita 256 MB, recusa status não 2xx e
  remove o arquivo parcial em cancelamento, stream ou disco com falha.
- **Fase 4 — concluída no escopo atual:** Postman/OpenAPI com preview, assertions, chaining,
  extrações secretas voláteis, runner TUI com dataset/concorrência e CLI
  text/JSON/JUnit estão implementados. O envio individual usa o mesmo motor e
  resolve dependências topologicamente. Fixtures versionadas cobrem Postman v2.1,
  OpenAPI 3.0 JSON e 3.1 YAML, incluindo herança, secrets, bodies, `$ref` local,
  `allOf`, servers, overrides e perdas explícitas. CLI e TUI percorrem import,
  preview e escrita protegida sem vazar literais.
- **Fase 5 — não iniciada por decisão:** OAuth2, certificados, SSE, WebSocket,
  scripting, GraphQL e gRPC permanecem sujeitos à evidência prevista nesta fase.

O programa das fases 0–4 atende à definição de concluído. A auditoria manual
disponível foi executada em WezTerm/WSL2 e tmux com Bun 1.3.14; GNU Screen, VS Code
Terminal, Windows Terminal e macOS não estavam disponíveis e permanecem como
validação de compatibilidade futura, não como lacuna funcional conhecida. O gate
final aprovou 337 testes unitários e 44 testes TUI, sem falhas, violações
arquiteturais ou regressões de manutenção. A Fase 5 continua deliberadamente fora
do escopo até existir demanda e evidência de segurança.

## Objetivos e não objetivos

### Objetivos

1. Tornar requisições frequentes rápidas para teclado e mouse.
2. Manter coleção, ambientes e exemplos junto do projeto, em formato textual.
3. Dar à resposta a maior parte do espaço útil e ferramentas reais de depuração.
4. Reimplementar como requisitos: cancelamento, timeout, limite de captura,
   interface multilíngue e integração com a porta detectada pelo Runner.
5. Impedir que histórico, exports, logs ou arquivos privados vazem credenciais por
   padrão.
6. Permitir evolução posterior para execução headless, assertions e novos
   protocolos sem transformar `HttpWorkspace.tsx` em um controlador monolítico.

### Não objetivos imediatos

- reproduzir toda a superfície do Postman;
- sincronização em nuvem, conta ou colaboração em tempo real;
- executar scripts importados sem consentimento e isolamento;
- implementar GraphQL, gRPC, MQTT, WebSocket e SSE na primeira sequência;
- criar um formato proprietário quando `.http` atende ao núcleo do caso de uso;
- copiar código ou identidade visual de outro projeto.

## Método e fontes analisadas

A análise considerou documentação, screenshots e código-fonte nos seguintes
snapshots. Links apontam para a revisão estudada sempre que possível.

| Projeto | Snapshot | Base técnica | Material principal |
| --- | --- | --- | --- |
| Tuiminal | worktree local em 2026-09-04 | Bun, OpenTUI, React | [`HttpWorkspace.tsx`](./src/features/http/HttpWorkspace.tsx), [`collection-runner.ts`](./src/features/http/services/collection-runner.ts), [`http.test.ts`](./tests/http.test.ts) |
| Posting | [`56703a1`](https://github.com/darrenburns/posting/tree/56703a11513e8e74e681b4f859f31945b71e746f), versão 2.10.0 | Python, Textual, httpx | [guia](https://posting.sh/guide/), [navegação](https://posting.sh/guide/navigation/), [roadmap](https://posting.sh/roadmap/) |
| ATAC | [`e5daf66`](https://github.com/Julien-cpsn/ATAC/tree/e5daf666e5b5fc75eb787f1551083fdc37507ffb), versão 0.23.1 | Rust, Ratatui, reqwest | [README e matriz de recursos](https://github.com/Julien-cpsn/ATAC#features) |
| Restless | [`b5d7d3e`](https://github.com/shahadulhaider/restless/tree/b5d7d3e34cccaf0c7e98fae8cb3d9c3e6e1818b3) | Go, Bubble Tea, `net/http` | [README](https://github.com/shahadulhaider/restless), [atalhos](https://github.com/shahadulhaider/restless/blob/b5d7d3e34cccaf0c7e98fae8cb3d9c3e6e1818b3/docs/keybindings.md) |
| post-tui | [`b73d912`](https://github.com/raufendro-dev/post-tui/tree/b73d91273447c05f7acdd3f4f9cdf5cedd901f48), versão 1.0.3 | Rust, Ratatui, reqwest | [README, limitações e roadmap](https://github.com/raufendro-dev/post-tui#current-limitations) |
| Sintaxe `.http` | documentação 2026.2 | formato de arquivo interoperável | [sintaxe](https://www.jetbrains.com/help/idea/exploring-http-syntax.html), [variáveis e arquivos privados](https://www.jetbrains.com/help/idea/http-client-variables.html) |

### Base de UX/UI usada no desenho

O layout não deriva somente da aparência dos concorrentes. As decisões abaixo
cruzam referências gerais de interação, recomendações específicas para terminal e
limitações observadas em TUIs reais.

| Evidência | Consequência para o Tuiminal |
| --- | --- |
| As [heurísticas de Nielsen](https://www.nngroup.com/articles/ten-usability-heuristics/) priorizam visibilidade do estado, controle e liberdade, consistência, prevenção de erro, reconhecimento em vez de memorização e minimalismo. | Execução, foco, ambiente, dirty state, truncamento e resultado ficam visíveis; cancelar e desfazer são caminhos explícitos; ajuda e ações primárias são reconhecíveis sem memorizar uma gramática inteira. |
| [Progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/) reduz sobrecarga em aplicações com muitos comandos, e a orientação para [aplicações complexas](https://www.nngroup.com/articles/complex-application-design/) recomenda revelar opções avançadas no contexto em que se tornam relevantes. | A superfície principal não replica todas as tabs do Posting/ATAC. Params, Headers, Body e Auth permanecem visíveis; opções raras ficam em `Mais`, command palette ou menus contextuais. |
| O guia de layout do [Textual](https://textual.textualize.io/how-to/design-a-layout/) recomenda esboçar retângulos, registrar quais regiões rolam e construir de fora para dentro, com áreas flexíveis absorvendo o espaço restante. | Cada pane tem mínimo, máximo, política de scroll e prioridade declarados. O response recebe o espaço elástico, enquanto barras e identidade do request permanecem estáveis. |
| As fundações do [TUIKit](https://github.com/github/TUIKit/blob/main/docs/foundations.md) tratam responsividade como medição de colunas/linhas, recomendam animação com parcimônia e definem ordem de foco igual à ordem visual. | Breakpoints usam a área útil da feature e restrições de conteúdo, não apenas percentuais. A ordem é esquerda-direita/cima-baixo; animação nunca é o único indicador. |
| O [Command Line Interface Guidelines](https://clig.dev/) recomenda feedback em menos de 100 ms, progresso para esperas, timeout, erros acionáveis, cor intencional e saída simples para automação. | Enviar muda imediatamente para estado `Enviando`; a fase atual e o cancelamento permanecem visíveis; erros mostram causa e próximo passo; o modo headless tem saída `text`, `json` e `junit` estável. |
| A experiência do [GitHub CLI com acessibilidade](https://github.blog/engineering/user-experience/building-a-more-accessible-github-cli/) mostra que redraw constante, prompts ornamentais e spinners podem confundir leitores de tela; também favorece cores 4-bit configuráveis. | Haverá modo acessível/reduced-motion com progresso textual estático, menos ornamento e sem dependência de truecolor. Paletas precisam funcionar em fundo claro, escuro e alto contraste. |
| A orientação [WCAG2ICT para terminal](https://github.com/w3c/wcag2ict/blob/main/text-command-line-terminal-applications-and-interfaces.md), além dos princípios de [reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow), [contraste](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum) e [foco visível](https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html), continua útil mesmo sem DOM. | Redimensionar nunca remove funcionalidade; cor não carrega significado sozinha; foco combina fundo, accent e marcador textual; o modo estreito oferece uma coluna em vez de exigir scroll bidimensional fora de tabelas/editores. |
| A discussão de UX do [lazygit](https://github.com/jesseduffield/lazygit/issues/1712) registra dois conflitos recorrentes: novatos versus usuários experientes e atalhos globais com significado local diferente. | Ações perigosas confirmam por padrão e podem ganhar preferência posterior; um atalho global nunca muda de significado dentro de um pane; atalhos locais aparecem em ajuda contextual. |

Essas fontes não são tratadas como regras transplantadas literalmente da web ou de
CLIs lineares. Elas fornecem critérios verificáveis para uma TUI full-screen: cada
estado deve responder “onde estou, o que está selecionado, o que está rodando, o
que mudou e qual é a próxima ação?” sem depender apenas de cor ou memória.

Não foram tratados como prova recursos que aparecem apenas em um roadmap. Na
comparação, “não identificado” significa que a capacidade não apareceu nem na
documentação nem no caminho de execução inspecionado; não significa que jamais
tenha existido em outra revisão.

## Auditoria do HTTP atual do Tuiminal

### Capacidades atuais que precisam ser reimplementadas

- métodos GET, POST, PUT, PATCH, DELETE, HEAD e OPTIONS;
- normalização de URL sem protocolo para `http://` e rejeição de protocolos não
  HTTP;
- headers em texto, body textual/JSON e `Content-Type` automático;
- resposta com status, duração total, bytes capturados, headers e JSON formatado;
- timeout de 30 segundos, cancelamento com `AbortController` e captura limitada a
  aproximadamente 1,5 MB;
- histórico de até 30 chamadas na sessão;
- layout request/response lado a lado e fallback por painéis em terminal estreito;
- envio de uma URL detectada pelo Runner para a aba HTTP;
- mouse nos principais botões e listas;
- textos integrados ao sistema de tradução do Tuiminal.

Os três testes HTTP anteriores cobriam normalização, parsing básico de headers e uma
chamada JSON local. Eles são substituídos por testes dos contratos novos; não devem
ditar nomes, tipos ou arquitetura. A cobertura nova precisa provar TUI, cancelamento,
truncamento, redirects, binários, erros, ownership e segurança.

### Lacunas de produto

- Não há coleção de projeto, requests salvos, pastas, busca ou múltiplos requests
  abertos.
- Histórico, draft e resposta vivem apenas no estado React; reiniciar perde tudo.
- Query params e path params não têm editores próprios nem preservam duplicatas e
  estado habilitado/desabilitado de forma explícita.
- Não há autenticação estruturada, ambientes, variáveis ou separação de segredos.
- Body é apenas raw; faltam form URL encoded, multipart, arquivo e tipos explícitos.
- A resposta só alterna body/headers. Faltam raw/pretty, cookies, redirects, timing
  por etapa disponível, busca, folding JSON, cópia, download e diff.
- Não há import/export de cURL, `.http`, Postman ou OpenAPI.
- Não há assertions, execução headless ou collection runner.

### Riscos técnicos e de interação

- `HttpWorkspace.tsx` concentra cerca de 731 linhas de layout, estado, teclado,
  execução, histórico e apresentação. Acrescentar coleções e ambientes nesse mesmo
  controlador aumentaria o acoplamento e dificultaria testes.
- O modelo `HttpRequestDraft` representa headers como um único texto e body como
  uma única string. Ele não consegue expressar enable/disable, segredo, tipo de
  body, arquivos, autenticação ou a origem de uma variável.
- A troca entre Headers e Body usa uma `key` que remonta o textarea. Mesmo com a
  sincronização atual, o padrão perde cursor, seleção e histórico de edição; a nova
  UI deve manter os editores montados e inativos.
- O escopo global de teclado lista somente URL e editor. A lista de histórico e o
  scroll da resposta também recebem foco, e o handler de histórico fecha com
  `[Esc]` sem consumir explicitamente o evento. Isso precisa de um teste real de
  propagação antes de ampliar a TUI.
- `Response.headers.entries()` não é suficiente como contrato para headers
  repetidos, principalmente `Set-Cookie`. O novo snapshot deve preservar ordem e
  múltiplos valores.
- O tamanho exibido é o número de bytes retidos. Em uma resposta truncada, isso
  não representa necessariamente o tamanho declarado ou transferido.
- O `fetch` fornece um bom tempo total, mas não expõe DNS/TCP/TLS detalhados. A UI
  não deve inventar métricas que o transporte não consegue medir.
- Trinta respostas no limite máximo podem reter dezenas de megabytes. O número de
  entradas e o orçamento total dos corpos precisam ser limites independentes.

## Comparação funcional

| Capacidade | Tuiminal atual | Posting | ATAC | Restless | post-tui |
| --- | --- | --- | --- | --- | --- |
| Request e response simultâneos | Sim | Sim | Sim | Alternância | Sim |
| Coleção local | Não | Diretório + YAML por request | JSON/YAML | Arquivos `.http` | JSON interno + import Postman |
| Ambientes/variáveis | Não | `.env`, hot reload | Arquivos de ambiente | JSON, inline e dinâmicas | Não |
| Params estruturados | Não | Query e path | Query/path | Sintaxe `.http` | Query |
| Auth estruturada | Não | Basic, Digest, Bearer | Basic, Bearer, Digest, JWT | Header no `.http` | Basic, Bearer, API key |
| Body além de raw | Não | Raw e URL encoded | Raw, form, multipart e arquivo | Inline e arquivo | Não |
| Resposta avançada | Body/headers | Body, headers, cookies, scripts, trace | Body/imagem, cookies, headers, console | Body, headers, timing, assertions, folding | Pretty, tree, raw, HTML, headers, erro |
| Histórico comparável | Sessão, 30 | Não identificado | Resposta pode acompanhar request | Persistente por request + diff | Persistente, 100 |
| Busca na resposta | Não | Planejada | Não identificada | Sim | Sim |
| cURL | Não | Import/export | Import/export e outras linguagens | Import/export + codegen | Export |
| Import Postman/OpenAPI | Não | Ambos, experimentais | Ambos | Postman, Insomnia, Bruno e OpenAPI | Postman v2.1 |
| Assertions/headless | Não | Testes planejados | CLI ampla, sem framework de assertions identificado | Sim | Não |
| Cancelamento explícito | Sim | Worker assíncrono, sem ação clara de cancelar | `CancellationToken` | Não identificado na TUI | Planejado |
| Limite explícito de corpo | 1,5 MB | Não identificado | Não identificado | Não; usa leitura integral | Não; usa leitura integral |
| Mouse documentado/implementado | Parcial | Completo | Não identificado | Completo, inclusive divisor | Não identificado |
| Testes automatizados no snapshot | 3 HTTP | Unitários + snapshots de TUI | Não identificados | Cobertura ampla por módulo e TUI | Não identificados |
| Internacionalização | 6 idiomas | Não | Não | Não | Não |

## Pontos fortes e críticas por referência

### Posting

**O que adotar**

- URL e ação de envio formam uma barra estável, acima do restante do trabalho.
- Coleção lateral, request em cima e response embaixo criam uma hierarquia clara:
  escolher, montar, executar, inspecionar.
- A cor do método e do status transmite estado sem adicionar texto redundante.
- Tabs separam Headers, Body, Path, Query, Auth, Info, Scripts e Options; resposta
  separa Body, Headers, Cookies, Scripts e Trace.
- Jump mode `[Ctrl+O]`, ajuda contextual `[F1]`, command palette, autocomplete e
  integração com editor/pager reduzem o custo de uma interface rica.
- O modo compacto remove bordas e padding sem perder a hierarquia de superfícies.

**O que fazer melhor**

- O próprio roadmap reconhece footer congestionado, falta de resize manual,
  busca na resposta, switchers de coleção/ambiente e contexto de estado mais claro.
- Muitas tabs sempre visíveis aumentam carga visual. O Tuiminal deve agrupar itens
  raros em `Mais`/command palette e mostrar indicadores somente quando há conteúdo.
- A coleção global padrão contraria a regra do Tuiminal de respeitar o diretório de
  lançamento. Scratch global pode existir, mas nunca substituir a coleção do projeto.
- Não foi identificado histórico de execuções comparável. O Tuiminal já tem sessão
  e deve evoluí-la sem perder privacidade.
- [Scripts Python](https://github.com/darrenburns/posting/blob/56703a11513e8e74e681b4f859f31945b71e746f/docs/guide/scripting.md)
  rodam no mesmo processo e ambiente; a própria documentação alerta para operações
  globais destrutivas. Esse modelo não será copiado.
- O controlador principal continua grande, embora os widgets estejam separados. A
  composição visual pode ser adotada sem repetir esse acoplamento.
- Internacionalização e largura dupla ainda aparecem como trabalho futuro no
  roadmap; o Tuiminal já precisa preservar isso desde o primeiro componente.

### ATAC

**O que adotar**

- Cobertura explícita de body, autenticação, proxy, redirects, cookies, arquivos,
  export e WebSocket serve como checklist de maturidade.
- Coleções em JSON ou YAML são locais, legíveis e retrocompatíveis.
- Keymaps e temas são configuráveis, e o help é derivado dos eventos disponíveis.
- O protocolo é modelado como variante HTTP/WebSocket, em vez de espalhar flags por
  toda a aplicação.

**O que fazer melhor**

- A amplitude vem acompanhada de cerca de 18 mil linhas Rust e um
  [enum de estado](https://github.com/Julien-cpsn/ATAC/blob/e5daf666e5b5fc75eb787f1551083fdc37507ffb/src/tui/app_states.rs)
  com dezenas de modos de edição. O Tuiminal deve usar estado por pane/modal/tab e
  reducers testáveis, evitando uma máquina global combinatória.
- O [layout principal](https://github.com/Julien-cpsn/ATAC/blob/e5daf666e5b5fc75eb787f1551083fdc37507ffb/src/tui/ui/ui.rs)
  usa proporções fixas de 20/80 e 50/50. A UI do Tuiminal precisa
  responder à largura, altura, conteúdo e ao divisor movido pelo usuário.
- Não foi encontrada suíte automatizada no snapshot. Recursos como auth, import e
  scripts não entram sem testes determinísticos.
- Não foi identificado mouse. No Tuiminal, qualquer ação visível deve continuar
  acessível por clique.
- O README classifica o import OpenAPI como gerado por IA e sujeito a bugs. Import
  deve ser tratado como parser não confiável, com preview, validação e testes de
  fixtures antes de escrever no projeto.
- A lista de recursos incentiva implementar muitos protocolos cedo. Para o
  Tuiminal, HTTP precisa ficar excelente antes de abrir outra frente.

### Restless

**O que adotar**

- `.http` é simples, versionável e interoperável com IDEs. Um arquivo pode conter
  múltiplos requests, variáveis, nomes e assertions.
- O histórico pertence ao request e permite carregar duas execuções para diff.
- Pretty/raw, folding JSON, busca, linha, wrap, seleção visual, JSON path, cópia via
  OSC52 e codegen tornam a resposta uma ferramenta de depuração de verdade.
- Assertions, request chaining, execução headless e data-driven runner conectam uso
  interativo a CI sem duplicar a definição do request.
- O código está dividido entre parser, engine, history, importers, exporter,
  scripts, writer e TUI, com testes próximos de cada responsabilidade.
- O carregamento de body externo valida que o caminho não atravesse para fora da
  coleção; esse limite deve existir no Tuiminal.

**O que fazer melhor**

- Request e response alternam no mesmo painel. Para o fluxo interativo do Tuiminal,
  ambos devem permanecer visíveis quando houver espaço.
- A gramática Vim de múltiplas teclas é poderosa, mas tem curva de aprendizado. O
  Tuiminal pode oferecer prefixes somente com um which-key contextual e manter
  ações essenciais em um único atalho.
- O editor interno preserva assertions e scripts sem conseguir editá-los. A UI não
  deve dar a impressão de edição completa quando parte do arquivo é opaca.
- O [engine](https://github.com/shahadulhaider/restless/blob/b5d7d3e34cccaf0c7e98fae8cb3d9c3e6e1818b3/internal/engine/engine.go)
  usa leitura integral do corpo. Uma resposta grande pode bloquear ou esgotar
  memória; o limite e o streaming atuais do Tuiminal são melhores.
- O [histórico](https://github.com/shahadulhaider/restless/blob/b5d7d3e34cccaf0c7e98fae8cb3d9c3e6e1818b3/internal/history/history.go)
  cria diretório `0755`, arquivo `0644` e serializa request e response sem redação.
  Tokens, cookies e payloads podem ficar legíveis no disco. O Tuiminal deve
  persistir somente metadados redigidos por padrão e usar `0700`/`0600`.
- Scripts JavaScript têm timeout, mas ainda executam dentro do processo. Scripts
  ficam adiados até existir isolamento e permissões coerentes com o plano de plugins.

### post-tui

**O que adotar**

- O layout de três áreas é imediatamente compreensível: sidebar, builder e response.
- O builder resume método, URL, headers, query, auth e body antes de entrar em edição.
- Pretty, tree, raw, HTML, headers e erro demonstram bom progressive disclosure.
- Coleções importadas, requests salvos e histórico compartilham uma sidebar simples.
- O README explicita limitações, tornando a fronteira do produto fácil de avaliar.

**O que fazer melhor**

- A [sidebar fixa e divisão 48/52](https://github.com/raufendro-dev/post-tui/blob/b73d91273447c05f7acdd3f4f9cdf5cedd901f48/src/ui.rs)
  não respondem bem a terminais pequenos ou conteúdo longo.
- Headers e body usam um buffer de edição compacto; multiline, variáveis, tabs de
  request e ambientes ainda estão no roadmap.
- Requests rodam no fluxo principal, sem cancelamento, e o cliente não define
  timeout configurável.
- No [transporte](https://github.com/raufendro-dev/post-tui/blob/b73d91273447c05f7acdd3f4f9cdf5cedd901f48/src/http.rs),
  o tempo é capturado após receber headers e antes de ler o body; portanto não é o
  tempo total exibido ao usuário.
- O mesmo transporte lê o corpo integralmente e o converte com perda para UTF-8,
  inclusive binário.
- Requests e histórico incluem auth e são gravados em JSON pelo
  [storage](https://github.com/raufendro-dev/post-tui/blob/b73d91273447c05f7acdd3f4f9cdf5cedd901f48/src/storage.rs),
  sem proteção explícita de modo ou redação.
- `app.rs` tem cerca de 1.350 linhas e `ui.rs` cerca de 637; não foram encontrados
  testes. É um bom protótipo de produto, mas não um molde de arquitetura.

## Pressão observada nos backlogs públicos

Snapshot consultado em 4 de setembro de 2026. A contagem inclui bugs, melhorias,
dúvidas e duplicatas; ela mede pressão pública, não qualidade absoluta.

| Projeto | Issues abertas | Sinais principais | Efeito neste plano |
| --- | ---: | --- | --- |
| [Posting](https://github.com/darrenburns/posting/issues) | 67 | Query params enviados como `null` ([#362](https://github.com/darrenburns/posting/issues/362)), resposta de outro request aparecendo no foco atual ([#320](https://github.com/darrenburns/posting/issues/320)), certificado de cliente ignorado ([#325](https://github.com/darrenburns/posting/issues/325)), além de pedidos por variáveis internas ([#279](https://github.com/darrenburns/posting/issues/279)), CLI/headless ([#303](https://github.com/darrenburns/posting/issues/303)) e OAuth2 ([#306](https://github.com/darrenburns/posting/issues/306)). | Execução recebe `executionId` e ownership por tab; URL resolvida e request preparado ficam inspecionáveis; certificados/OAuth2 entram apenas após testes; variáveis e automação são fundações, não remendos de UI. |
| [ATAC](https://github.com/Julien-cpsn/ATAC/issues) | 13 | Request fica pendente quando post-script falha ([#209](https://github.com/Julien-cpsn/ATAC/issues/209)); há problemas com cookie ([#163](https://github.com/Julien-cpsn/ATAC/issues/163)), AltGr ([#204](https://github.com/Julien-cpsn/ATAC/issues/204)), Vim/yank e GNU Screen; usuários pedem herança de variáveis, headers e auth por coleção ([#124](https://github.com/Julien-cpsn/ATAC/issues/124)) e `.http` ([#109](https://github.com/Julien-cpsn/ATAC/issues/109)). | Todo caminho assíncrono termina em sucesso, erro ou cancelado; compatibilidade de teclado/terminal entra na matriz de teste; herança por escopo e `.http` precedem protocolos adicionais. |
| [Restless](https://github.com/shahadulhaider/restless/issues) | 0 | O tracker não expõe pedidos atuais; o produto já demonstra `.http`, history diff, assertions, chaining, busca/folding e resize por mouse. | Adotar o modelo versionável e as ferramentas de depuração, mas testar privacidade do histórico, limites de corpo e discoverability sem assumir que ausência de issue significa ausência de risco. |
| [post-tui](https://github.com/raufendro-dev/post-tui/issues) | 0 | O [roadmap](https://github.com/raufendro-dev/post-tui#roadmap) reconhece editor multiline, variáveis, export de coleção, background/cancelamento, clipboard, request tabs e configuração como trabalho futuro. | Essas capacidades precisam nascer no modelo e no layout, sem bloquear o fluxo scratch; cancelamento, variáveis e tabs não podem ser acrescentados apenas como flags no componente principal. |

Os padrões comuns tornam não negociáveis: vínculo inequívoco entre request e
response, término de todo estado de loading, foco compatível com diferentes
terminais, herança explícita de configuração, persistência redigida e um caminho
headless acessível. A extensão de protocolos continua posterior a essa base.

## Direção de produto

### Princípios

1. **Projeto primeiro.** O diretório passado ao CLI determina coleção, ambientes e
   histórico opt-in. Restaurar sessão nunca troca essa raiz.
2. **Scratch sem cerimônia.** Abrir HTTP continua permitindo colar URL e enviar sem
   criar arquivos.
3. **Visual inspirado, não clonado.** Usar a hierarquia do Posting com paletas,
   layout compacto/framed, botões, i18n e convenções próprias do Tuiminal.
4. **Resposta em primeiro plano.** Depois do envio, foco e espaço favorecem o
   resultado sem esconder o request em terminais largos.
5. **Texto como fonte de verdade.** Requests salvos usam `.http`; estado efêmero de
   UI não contamina os arquivos versionados.
6. **Seguro e limitado por padrão.** Nada de scripts automáticos, histórico cru,
   host env implícito ou leitura sem limite.
7. **Capacidade honesta.** Mostrar somente métricas que o transporte mede e avisar
   sempre que dados forem truncados, redigidos ou não persistidos.
8. **Paridade de interação.** Teclado e mouse alcançam todas as ações; `[Esc]` fecha
   somente a camada superior.
9. **Interop antes de ecossistema próprio.** `.http` e cURL precedem formatos e SDKs
   específicos do Tuiminal.
10. **Automação nasce do mesmo modelo.** TUI e `tuiminal http run` executam a mesma
    preparação, transporte, assertions e política de segurança.

### Indicadores de sucesso

- Um usuário novo consegue enviar uma URL, editar JSON e entender a resposta sem
  abrir o help.
- Um usuário frequente abre, troca, executa e salva requests sem tirar as mãos do
  teclado, mas todas essas ações também têm controles de mouse.
- Em 80×24 não há sobreposição, clipping de ações ou perda do caminho para request e
  response; em 120×30 ambos ficam visíveis.
- Cancelar interrompe leitura e para atualizações em até uma iteração do event loop.
- O limite de captura continua funcionando para corpo normal, chunked e comprimido.
- Nenhuma credencial entra em histórico persistente, log, export ou mensagem de erro
  sem ação explícita do usuário.
- Salvar e reabrir um `.http` preserva requests, comentários e blocos ainda não
  compreendidos pelo editor visual.
- Toda lógica nova relevante tem teste; o gate final continua `bun run check`.

## Experiência alvo e sistema de layout

### Modelo mental e hierarquia

O workspace segue a sequência natural `escolher → montar → executar → inspecionar`.
O usuário pode entrar em qualquer etapa, mas a geometria não muda arbitrariamente:

1. **Tabs de documentos** identificam os requests montados e seu dirty state.
2. **Omnibar** mantém método, URL resolvível, ambiente e enviar/cancelar no mesmo
   lugar em todos os modos.
3. **Navegação** alterna coleção e histórico sem mostrar duas árvores competindo.
4. **Request builder** organiza somente a preparação da chamada.
5. **Response inspector** recebe o espaço flexível e todo o estado de execução.
6. **Footer contextual** mostra poucas ações válidas para o foco atual; `[F1]` abre
   o mapa completo.

Tabs de documentos e tabs internas são visualmente diferentes. Documentos formam
uma faixa própria acima da omnibar; Params/Headers/Body/Auth e
Pretty/Raw/Headers/Timing pertencem aos panes. Isso evita a sensação de uma única
fileira com dois níveis de navegação misturados.

### Anatomia persistente

```text
 GET listar usuários ● ×   POST criar usuário ×   [Ctrl+N]
 GET ▾  https://api.exemplo.com/users/{{id}}   ambiente: dev ▾   [S] Enviar
 ─────────────────────────────────────────────────────────────────────────────
 área adaptativa: navegação | request | response
 ─────────────────────────────────────────────────────────────────────────────
 ajuda curta do foco                                      [F1] Todos os atalhos
```

- O tab ativo usa background + accent; `●` significa modificado e `×` é somente o
  controle de mouse para fechar, com tooltip `[Ctrl+W]`.
- A omnibar nunca some quando coleção, histórico ou response recebem foco. Em
  largura mínima, ela quebra em duas linhas antes de truncar URL ou enviar.
- Método e ambiente abrem pickers por mouse ou `[Enter]`; o ambiente nunca desaparece
  silenciosamente, principalmente quando marcado como produção.
- Durante execução, `[S] Enviar` é substituído no mesmo lugar por `[X] Cancelar` e
  o response anuncia a fase atual imediatamente.
- O footer não é um catálogo permanente. Ele tem no máximo cinco ações primárias,
  ordenadas pela frequência/contexto; recursos raros ficam em `[F1]` ou `[Ctrl+P]`.

### Resolução por restrições, não por percentuais fixos

Os breakpoints abaixo usam a largura e altura **úteis da feature**, depois da
navegação global do Tuiminal. São valores iniciais para protótipo: o resolver só
escolhe um modo se todos os mínimos couberem; caso contrário, desce para o próximo.

| Modo | Condição inicial | Composição | Restrições principais |
| --- | --- | --- | --- |
| Panorama | `W ≥ 132` e `H ≥ 24` | `navegação │ request │ response` | Navegação 22–32 colunas; request e response começam com larguras iguais e mantêm mínimos de 42. |
| Workbench | `W ≥ 96` e `H ≥ 22` | `navegação │ request sobre response` | Navegação 22–30; área direita mínima 65. Request e response começam com a mesma altura. |
| Foco | `W ≥ 72` e `H ≥ 18` | request sobre response, sem sidebar fixa | Coleção/history abrem como drawer; request e response começam com a mesma altura e mantêm seus mínimos. |
| Mínimo | abaixo desses limites | um pane por vez | Omnibar em duas linhas e seletor local Coleção/Request/Response; nenhuma função desaparece. |

Prioridade de degradação: recolher navegação, mover request para cima do response,
quebrar omnibar, trocar para um pane. Nunca comprimir silenciosamente response,
editor ou botões até ficarem inutilizáveis. Percentuais só são aplicados depois dos
mínimos, e um divisor movido pelo usuário é preservado por modo durante a sessão e
clampado com segurança ao redimensionar.

### Panorama: três colunas

Usado apenas quando o response ainda preserva uma largura adequada para código,
tabelas e headers. Ele aproveita terminais ultrawide sem produzir linhas JSON
excessivamente longas.

```text
 GET listar ● ×   POST criar ×   [Ctrl+N]
 GET ▾  https://api.exemplo.com/users/{{id}}      dev ▾       [S] Enviar
┌ NAVEGAÇÃO ─────────┬ REQUEST ─────────────────┬ RESPONSE ───────────────────┐
│ Coleção  Histórico │ Params Headers Body Auth │ 200 OK · total 143 ms       │
│ / buscar            │                         │ Pretty Raw Headers Timing   │
│ ▾ api               │ id       42             │ 1 {                         │
│   ▾ users           │ verbose  true           │ 2   "id": 42,              │
│     GET listar ●    │                         │ 3   "name": "Ada"         │
│     POST criar      │                         │ 4 }                          │
│                     │                         │                              │
└─────────────────────┴─────────────────────────┴──────────────────────────────┘
 Params: [Enter] Editar [Space] Ativar [Ctrl+A] Adicionar          [F1] Ajuda
```

- Inspirado na leitura imediata do post-tui e na hierarquia do Posting, mas com
  mínimos que impedem a divisão fixa observada em post-tui/ATAC.
- Request e response começam com larguras iguais; o divisor continua respeitando
  a largura mínima de ambos ao ser movido.
- O divisor navegação/request e o divisor request/response são arrastáveis. Duplo
  clique restaura o tamanho recomendado; o controle também existe por teclado.

### Workbench: sidebar e split vertical

É o modo padrão esperado na maioria dos terminais desktop. Mantém a coleção visível
e dá largura integral ao conteúdo do request/response.

```text
 GET listar ● ×   POST criar ×   [Ctrl+N]
 GET ▾  https://api.exemplo.com/users/{{id}}   dev ▾   [S] Enviar
┌ NAVEGAÇÃO ─────────┬ REQUEST · Params Headers Body Auth Mais ───────────────┐
│ Coleção  Histórico │ key/value, editor ou formulário da seção               │
│ / buscar            ├ RESPONSE · Pretty Raw Headers Timing Mais ────────────┤
│ ▾ api               │ 200 OK · JSON · headers 68 ms · total 143 ms · 12 KB  │
│   ▾ users           │ 1 {                                                    │
│     GET listar ●    │ 2   "id": 42                                          │
└─────────────────────┴────────────────────────────────────────────────────────┘
```

- O split inicia em 50/50.
- `[Ctrl+↑/↓]` ajusta em passos estáveis; `[F10]` maximiza o pane focado e restaura
  exatamente o split anterior.
- Coleção e Histórico são dois modos da mesma sidebar, não duas listas permanentes.
  Histórico agrupa execuções pelo request e oferece compare sem poluir a árvore.

### Foco: sem sidebar fixa

Em aproximadamente 80×24, coleção e histórico viram drawers sobrepostos à esquerda,
sem desmontar os editores. Request e response continuam simultâneos enquanto a
altura útil respeitar os mínimos.

```text
 GET listar ● ×   [Ctrl+N]
 GET ▾  http://localhost:3000/users   dev ▾   [S] Enviar
 [C] Coleção  [Y] Histórico
 REQUEST · Params Headers Body Auth Mais
 ──────────────────────────────────────────────────────────────────────
 RESPONSE · Pretty Raw Headers Timing Mais
 200 OK · 143 ms · 12 KB
```

- Abrir drawer move o foco para ele; fechar devolve o foco ao controle de origem.
- O drawer ocupa entre 24 e 70% da largura, nunca cobre a indicação de ambiente nem
  exige que request/response percam estado.
- Barras internas rolam horizontalmente como unidade somente se os labels essenciais
  não couberem; conteúdo não é desenhado por cima do último botão.

### Mínimo: um pane por vez

```text
 GET listar ● ×   [Ctrl+N]
 GET ▾  http://localhost:3000/users
 dev ▾                                      [S] Enviar
 [C] Coleção   [1] Request   [2] Response
 ─────────────────────────────────────────────────────
 conteúdo do pane ativo
 ─────────────────────────────────────────────────────
 [Tab] Navegar  [Enter] Abrir                   [F1] Ajuda
```

- Enviar seleciona Response, mas `[1]` retorna ao Request com cursor, seleção,
  autocomplete e scroll preservados.
- O seletor local mantém significado constante; breakpoints nunca reinterpretam uma
  tecla existente.
- Status, duração, tamanho e truncamento quebram em linhas sem omitir o estado.
- A área informa o mínimo recomendado quando tão pequena que nem o modo de um pane
  consegue manter controles seguros; o app não deve tentar pintar fragmentos.

### Divulgação progressiva nos panes

O Posting prova a utilidade de tabs especializadas, mas seu próprio roadmap registra
congestionamento. O ATAC mostra o custo de muitos modos simultâneos. O desenho alvo
mantém um primeiro nível estável e move o restante para contexto:

- Request: `Params`, `Headers`, `Body`, `Auth`, `Mais`.
- `Params` contém subseções Query e Path, com contadores e validação; não consome duas
  tabs permanentes.
- `Mais` contém Options, documentação gerada e, futuramente, certificados/scripts.
- Response: `Pretty`, `Raw`, `Headers`, `Timing`, `Mais`.
- `Mais` contém Cookies, Redirects, Assertions e Console; badges indicam conteúdo ou
  falha sem mover tabs de posição.
- A tab ativa, erro e quantidade de itens usam texto/símbolo além da cor.
- Se uma função avançada se tornar frequente nos testes de uso, ela pode ser promovida
  com evidência; não se adiciona uma tab permanente apenas porque outro cliente tem.

### Foco, navegação e mouse

- `[Tab]`/`[Shift+Tab]` percorrem as quatro regiões na ordem estável
  `rota → coleção → request → response`; `[H/L]` e, fora da árvore JSON,
  `[←/→]` oferecem a mesma troca rápida. `[Tab]` sai deliberadamente de inputs do
  HTTP, enquanto as demais teclas de texto mantêm a edição nativa.
- Com o request focado e nenhum editor possuindo o teclado, `[A←]`/`[F→]` ciclam
  `Params → Headers → Body → Auth → Mais`. Os controles equivalentes aparecem apenas
  nesse foco e a troca mantém o teclado no pane para permitir ciclos consecutivos.
- Faixas horizontais dentro da seção atual usam `[Z←]`/`[V→]`: tipos de Body,
  tipos de Auth, subseções de request `Mais` e de response `Mais`. A faixa primária
  da resposta usa `[A←]`/`[F→]`. Nenhum desses atalhos atravessa um editor focado.
- Em Params, `[J/K]` ou `[↑/↓]` alterna o subpainel focado entre Query Params e
  Path Params. Somente o subpainel focado mostra e aceita `[N] Adicionar`.
- No Pretty de um JSON válido e limitado, `[↑/↓]` ou `[J/K]` percorrem blocos,
  `[←/→]` recolhem ou expandem o bloco atual e `[Enter]` alterna seu estado. O
  caminho selecionado e os blocos recolhidos pertencem ao documento e não alteram
  o body capturado.
- `[Ctrl+O]` abre jump mode sobre panes e ações, como no Posting, mas os targets usam
  a mesma letra em todos os breakpoints.
- Um atalho global não ganha significado local diferente. Se houver conflito, a ação
  rara vai para menu/ajuda em vez de sequestrar memória muscular.
- `[Esc]` fecha exatamente uma camada: autocomplete → input → modal/drawer →
  maximização → tela. Cada camada consome o evento antes de devolver foco.
- Pane oculto ou tab inativa não recebe input, mouse wheel nem shortcuts.
- Clique primeiro estabelece foco e depois executa a ação prevista; áreas clicáveis
  cobrem o label inteiro, não apenas um glyph de uma coluna.
- Wheel rola o pane sob o ponteiro; drag move apenas divisores; seleção nativa do
  terminal continua disponível por uma ação/modificador documentado.
- Scrollbars discretas aparecem somente quando informam posição; início/fim também
  são anunciados por texto na navegação por teclado.

### Estado visual e feedback

| Pergunta do usuário | Tratamento obrigatório |
| --- | --- |
| Onde está o foco? | Accent + mudança de background + título ativo; foco não depende de borda fina ou hover. |
| O que foi modificado? | `● Modificado` no documento, contador por seção e confirmação antes de perder draft. |
| Qual ambiente será usado? | Nome sempre na omnibar; produção mostra `PROD` por texto e cor de perigo. |
| A chamada começou? | Em até uma atualização de UI, `Enviando · aguardando headers` e `[X] Cancelar`. |
| A chamada terminou? | Status textual, URL final, tipo, bytes e timing honesto no cabeçalho do response. |
| Algo está incompleto? | `TRUNCADO`, `REDIGIDO`, `TLS INSEGURO` e `HISTÓRICO DESATIVADO` aparecem literalmente. |
| O resultado pertence a quê? | Nome/método e `executionId` ficam associados à tab; resultado tardio nunca escreve em outra tab. |
| Como corrigir um erro? | Resumo humano, causa provável, próximo passo e `[D] Detalhes`; detalhes técnicos são redigidos. |

Animação é decorativa. No modo normal, um spinner discreto pode acompanhar o texto;
se parar, a mensagem e o tempo decorrido ainda provam que existe trabalho. Sucesso,
aviso, erro, método HTTP e seleção têm símbolos/labels para funcionar sem cor.

### Acessibilidade e compatibilidade de terminal

- O HTTP deve respeitar um futuro ajuste global de acessibilidade/reduced-motion;
  até ele existir, o protótipo precisa manter uma variante testável sem animação.
- Essa variante troca spinners por texto estático atualizado com baixa frequência,
  reduz bordas decorativas e escreve alternativas como `(selecionado)`, `(erro)` e
  `(modificado)` onde o layout visual usaria apenas glyph/cor.
- Ordem de foco acompanha ordem de leitura e nenhum prompt exige varredura visual
  sem label. Help é contextual, pesquisável e também disponível fora da TUI.
- Paletas usam tokens semânticos mapeáveis a 4-bit/256/truecolor e são verificadas
  em fundos claro, escuro e alto contraste. `dim` não carrega informação essencial.
- CJK, português e outros textos passam por medição grapheme-aware; truncamento
  preserva o atalho/estado e fornece o valor completo no detalhe.
- O modo headless é a alternativa linear e automatizável: sem animação quando não há
  TTY, respeita `NO_COLOR` e oferece JSON estável para ferramentas assistivas.

### Mapa de atalhos proposto

Atalhos atuais continuam disponíveis durante a migração. Novos atalhos só passam a
ser documentados quando tiverem controle de mouse equivalente e teste de propagação.

| Ação | Atalho |
| --- | --- |
| Focar URL | `[/]` |
| Enviar | `[S]` fora de inputs; `[Ctrl+Enter]` em qualquer editor |
| Cancelar | `[X]` durante execução |
| Próximo/anterior método | `[M]` / `[Shift+M]` |
| Alternar rota / coleção / request / response | `[Tab]` / `[Shift+Tab]` ou `[H/L]` |
| Ciclar Params / Headers / Body / Auth / Mais no request focado | `[A←]` / `[F→]` |
| Ciclar uma faixa horizontal interna | `[Z←]` / `[V→]` |
| Alternar Query Params / Path Params | `[J/K]` ou `[↑/↓]` |
| Adicionar no subpainel focado | `[N]` |
| Alternar views primárias do response | `[A←]` / `[F→]` |
| Navegar / recolher / expandir blocos JSON | `[↑/↓]` ou `[J/K]` / `[←/→]` / `[Enter]` |
| Buscar no response focado | `[Ctrl+F]` |
| Abrir coleção | `[C]` |
| Abrir/fechar histórico | `[Y]` |
| Novo request scratch | `[Ctrl+N]` |
| Salvar request | `[Ctrl+S]` |
| Fechar request aberto | `[Ctrl+W]` |
| Ciclar requests abertos | `[Alt+←/→]` |
| Jump mode | `[Ctrl+O]` |
| Ajuda contextual | `[F1]` |
| Ajustar split | `[Ctrl+↑/↓]` |
| Maximizar/restaurar pane | `[F10]` |
| Fechar autocomplete/input/modal/pane | `[Esc]`, uma camada por vez |

`[/]` nunca vira busca contextual: continua focando URL em qualquer pane. Busca no
response usa `[Ctrl+F]`, evitando o conflito de atalhos globais observado em TUIs
maduras. `[Ctrl+P]` fica reservado para command palette quando houver comandos raros
em número suficiente; não criar uma palette vazia apenas por semelhança com Posting.

### Matriz obrigatória do protótipo visual

Antes de ligar coleção, ambientes ou transporte novo, renderizar fixtures realistas
em `60×16`, `72×18`, `80×24`, `96×24`, `120×30` e `160×40`, nos layouts framed e
compact. A revisão precisa verificar:

- URL longa, seis documents tabs, nomes CJK e tradução mais larga;
- JSON profundo, texto longo, binário, resposta vazia, erro e loading;
- headers/params suficientes para scroll vertical e horizontal;
- mouse, drag de divisor, resize durante edição e restauração de foco;
- macOS/Windows/Linux, VS Code terminal, tmux e GNU Screen quando disponíveis;
- AltGr, setas, teclas de função, `[Cmd+C]`/seleção e fallbacks documentados;
- paletas 4-bit, 256 e truecolor em fundo claro/escuro/alto contraste;
- variante accessible/reduced-motion sem animação ou significado exclusivo por cor.

Breakpoints só se tornam decisão implementada depois dessa matriz. Screenshots
isolados não bastam: os testes devem enviar teclas, mover mouse, redimensionar e
afirmar foco, conteúdo preservado e camada fechada por `[Esc]`.

## Especificação funcional alvo

### Request builder

- presets dos métodos atuais e campo para método HTTP customizado válido;
- URL com syntax highlight, autocomplete de histórico/variáveis e preview da URL
  resolvida sem revelar segredos;
- query e path params em tabelas de key/value com enable/disable, duplicatas, ordem e
  sincronização previsível com a URL, reunidos visualmente na tab `Params`;
- headers em tabela com autocomplete de nomes/valores, duplicatas e indicação dos
  headers adicionados automaticamente ou herdados, incluindo badge de origem;
- auth: No Auth, Bearer, Basic e API Key na primeira versão estruturada; Digest,
  OAuth2 e certificados de cliente só depois da base segura;
- body: none, JSON, raw/text, XML, form URL encoded, multipart e arquivo;
- Content-Type automático visível e sempre substituível pelo usuário;
- options: timeout, redirects, cookie jar, proxy e verificação TLS;
- dirty state por request e aviso antes de fechar/trocar quando houver perda;
- até seis requests montados; reabrir o mesmo request foca a tab existente;
- preview inspecionável da chamada preparada, mostrando valores herdados/resolvidos
  e headers automáticos sem revelar segredos.

### Coleções e formato `.http`

- O Tuiminal descobre `.http`/`.rest` sob a raiz do projeto, ignorando `.git`,
  `node_modules`, diretórios de build e symlinks que escapem da raiz.
- `.tuiminal/http/` é a pasta sugerida para novos requests, não a única pasta lida.
- Arquivos podem conter múltiplos requests separados por `###` e nomeados por
  `# @name`.
- O parser produz AST com trivia para preservar comentários, ordem, espaçamento e
  blocos desconhecidos. O editor visual nunca reserializa o arquivo inteiro a partir
  de um modelo com perda.
- Se um bloco não puder ser editado com segurança, ele abre em modo raw com mensagem
  clara; salvar outras partes não o remove.
- A árvore representa pastas, arquivos e requests, permite fuzzy search, duplicar,
  renomear, mover e excluir com confirmação.
- Alterações externas são observadas. Se houver draft local sujo, oferecer diff e
  escolha; nunca sobrescrever silenciosamente.
- Defaults opcionais de workspace/coleção podem viver em
  `.tuiminal/http/config.json`, separados do conteúdo canônico `.http`. O arquivo
  aceita headers não secretos, options e referências de auth; nunca token/senha
  literal. Essa extensão precisa de schema versionado e protótipo antes de congelar.

Exemplo canônico inicial:

```http
@baseUrl = https://api.exemplo.com

### Buscar usuário
# @name buscar-usuario
GET {{baseUrl}}/users/{{userId}}
Accept: application/json
Authorization: Bearer {{apiToken}}

# @assert status == 200
```

### Ambientes e segredos

- Suportar `http-client.env.json` para valores públicos e
  `http-client.private.env.json` para overrides privados, aproveitando a convenção
  documentada por IDEs.
- Ao criar o arquivo privado, verificar `.gitignore` e oferecer a inclusão explícita;
  não presumir que a IDE fará isso.
- Arquivo privado usa diretório `0700`, arquivo `0600` e escrita atômica. Segredos de
  maior valor podem ficar no keychain e aparecer no arquivo apenas como referência.
- Precedência inicial: variável do request > variável do arquivo > ambiente privado
  > ambiente público > built-in dinâmica. Duplicatas mostram a origem vencedora.
- Escopo por arquivo: para um request salvo, procurar o nome de ambiente selecionado
  primeiro no diretório do `.http` e depois em cada diretório pai até a raiz do
  projeto. O primeiro diretório que definir esse ambiente vence por inteiro; não
  mesclar variáveis homônimas de um pai depois que um escopo mais próximo foi
  encontrado. Dentro do mesmo diretório, o arquivo privado sobrescreve o público.
- Requests scratch consultam somente a raiz. Ambientes existentes apenas em
  diretórios irmãos não aparecem nem são usados, evitando importar acidentalmente
  segredos de outro serviço. A seleção é o nome do ambiente; em collection runs,
  cada request resolve esse mesmo nome contra a sua própria cadeia de diretórios.
- `[N] Novo ambiente privado` grava no diretório do arquivo ativo, ou na raiz para
  scratch, e mostra o caminho de destino antes da confirmação. Ao trocar para um
  documento cuja cadeia não contenha o nome selecionado, voltar explicitamente a
  `Sem ambiente`.
- Para headers/options/auth: valor explícito do request > defaults da coleção mais
  próxima > defaults do workspace > valor automático do cliente. O preview mostra
  origem e conflito; auth herdada nunca fica implícita apenas em uma cor.
- Host environment é bloqueado por padrão e exige habilitação explícita, seguindo a
  decisão segura adotada pelo Posting.
- Segredos aparecem mascarados no preview, autocomplete, logs, history, copy e erros.
- Trocar para um ambiente marcado como produção pode exigir confirmação por sessão.

### Response inspector

- tabs primárias fixas: Pretty, Raw, Headers, Timing e Mais; Cookies, Redirects,
  Assertions e Console ficam em Mais, com badges de conteúdo/erro;
- JSON/XML/HTML com highlight; JSON com folding, busca, linha, wrap e JSON path;
- cópia via OSC52 de seleção, linha, body, headers, JSON path/value e cURL redigido;
- bytes não textuais não são convertidos com perda: mostrar tipo, tamanho e ações
  `[S] Salvar`/`[O] Abrir` quando seguras;
- status, URL final, content type, encoding, tamanho declarado, bytes capturados,
  bytes baixados conhecidos e truncamento são campos distintos;
- medir `até headers`, `download` e `total` com `performance.now()`. DNS/TCP/TLS só
  aparecem se um transporte futuro fornecer esses dados;
- redirect chain opcional com status e host por salto;
- erros classificados em URL, DNS/conexão, TLS, timeout, cancelamento, redirect,
  corpo e parse, sem despejar tokens na mensagem;
- resposta vazia, 204, HEAD, streaming e truncamento têm estados próprios.

### Histórico

- Histórico de sessão mantém até 30 metadados, mas usa orçamento global de corpos;
  corpos antigos são descartados antes de metadados.
- Histórico persistente é opt-in por projeto. Por padrão guarda apenas metadados e
  preview redigido em arquivo `0600`.
- Guardar corpo completo exige opt-in separado, limite por item e limite global.
- Mesmo com esse opt-in, execuções com segredos conhecidos não persistem corpos.
  O contexto privado acompanha todos os saltos, cookies enviados/recebidos e
  extrações antes do histórico, sem serializar uma lista de valores secretos.
  Metadados, erros e assertions mascaram também formas comuns percent-encoded,
  double-encoded, form e JSON. O snapshot ativo permanece exato e volátil;
  exportação manual é uma decisão separada. Não prometer sanitização completa de
  corpos arbitrários ou limpeza retroativa de arquivos e backups antigos.
- Requests podem declarar `@no-log`; ações com auth literal sugerem não persistir.
- Histórico se agrupa por request estável, permite reabrir e comparar duas respostas.
- Rerun usa o ambiente atual e passa pela preparação/confirmação normal; nunca
  reaproveita segredo serializado de uma execução antiga.

### Import, export e automação

Ordem de implementação:

1. copiar/exportar cURL com quoting correto e segredo redigido por padrão;
2. importar cURL com preview antes de substituir o draft;
3. ler, editar e executar `.http`;
4. importar Postman v2.1 e OpenAPI 3.x para uma pasta escolhida, com relatório de
   itens suportados, ignorados e conflitantes;
5. importar Bruno/Insomnia apenas se houver demanda comprovada;
6. assertions declarativas e execução headless;
7. codegen adicional somente depois de cURL e `.http` estarem corretos.

CLI futuro, preservando `tuiminal http [diretório]`:

```text
tuiminal http [diretório]
tuiminal http run <arquivo>[#request] [--env <nome>] [--report text|json|junit]
tuiminal http import curl <comando> [--output <diretório>]
tuiminal http import postman|openapi <arquivo> [--output <diretório>]
```

`run` e `import` são palavras reservadas somente depois de `http`; um caminho de
projeto continua funcionando como hoje. TUI e modo headless compartilham parser,
resolver, transporte, assertions e redação.

## Arquitetura proposta

### Fronteiras

```text
src/features/http/
  index.ts                         API pública mínima da feature
  HttpWorkspace.tsx               composição fina dos panes
  keyboard.ts                     posse de foco e atalhos locais
  model/
    types.ts                      request, response, env e history
    workspace.ts                  reducer de tabs, pane, modal e dirty state
    variables.ts                  resolução, precedência e masking
    http-file.ts                  AST lossless e seleção de request
    response.ts                   view model, busca e folding
  services/
    transport.ts                  contrato cancelável
    fetch-transport.ts            implementação Bun inicial
    request-builder.ts            modelo -> request preparado
    response-reader.ts            streaming, limites e decoding
    redirects.ts                  política e remoção de credenciais
  storage/
    collections.ts                descoberta e escrita atômica `.http`
    environments.ts               público/privado/keychain
    history.ts                    sessão e persistência opt-in
  importing/
    curl.ts
    postman.ts
    openapi.ts
  exporting/
    curl.ts
  ui/
    HttpTopBar.tsx
    HttpCollectionPane.tsx
    HttpRequestPane.tsx
    HttpResponsePane.tsx
    HttpKeyValueEditor.tsx
    HttpEnvironmentModal.tsx
    HttpHistoryOverlay.tsx
tests/
  http-*.test.ts                  regras e integrações locais
  tui/http.test.tsx               sequências reais OpenTUI
```

Criar pastas apenas quando a fase correspondente existir. O desenho é uma direção
de dependências, não autorização para arquivos vazios.

### Modelo essencial

```ts
type HttpRequestDefinition = {
  id: string
  source: { kind: "scratch" } | { kind: "file"; path: string; blockId: string }
  name: string
  method: string
  url: string
  headers: Array<KeyValueEntry>
  query: Array<KeyValueEntry>
  path: Array<KeyValueEntry>
  auth: HttpAuth
  body: HttpBody
  options: HttpRequestOptions
}

type KeyValueEntry = {
  id: string
  enabled: boolean
  name: string
  value: string
  sensitivity: "normal" | "secret-ref" | "literal-secret"
}

type HttpResponseSnapshot = {
  executionId: string
  requestId: string
  requestRevision: number
  status: number
  statusText: string
  url: string
  headers: Array<[string, string]>
  body: Uint8Array
  bodyKind: "text" | "json" | "xml" | "html" | "binary"
  declaredBytes?: number
  capturedBytes: number
  truncated: boolean
  timings: { headersMs?: number; downloadMs?: number; totalMs: number }
  redirects: Array<HttpRedirectHop>
}
```

O estado do workspace usa reducer puro. Cada tab preserva draft, resposta, erro,
scroll, busca, tab interna e split. Modais e autocomplete ficam em uma pilha
explícita para que `[Esc]` sempre remova exatamente uma camada.

O reducer só aceita um resultado se `executionId`, `requestId` e revisão ainda
corresponderem à execução pendente daquela tab. Trocar foco, fechar uma tab ou
enviar novamente nunca permite que uma resposta tardia seja anexada a outro request.

### Pipeline de execução

```text
draft
  -> validar sem mutar
  -> resolver variáveis e registrar origem/masking
  -> aplicar auth e headers automáticos visíveis
  -> preparar URL/body/arquivos
  -> confirmar opções perigosas
  -> executar com AbortSignal
  -> ler stream dentro de limites
  -> classificar/formatar sem bloquear a TUI
  -> atualizar snapshot
  -> registrar histórico redigido conforme política
```

O transport não conhece React, storage ou componentes. O mesmo serviço é usado por
TUI e CLI. A feature não importa `app`; callbacks continuam sendo a fronteira com
Runner e navegação global, mantendo compatibilidade com a futura migração de plugins.

### Reuso dentro do Tuiminal

- usar o padrão de tabs montadas, split `[Ctrl+↑/↓]` e `[F10]` do SQL workspace;
- usar `InlineButton`, seleção mouse e superfícies do tema, sem criar um segundo kit;
- usar escrita protegida/atômica já aplicada em Runner e Database;
- usar OSC52 já usado por Runner e export do Database;
- aproveitar o lexer/highlight estável do projeto quando couber, sem remount de
  editor;
- seguir o lifecycle registry apenas para recursos realmente criados pelo HTTP,
  como watchers, workers ou cookie jars persistentes.

## Segurança, privacidade e robustez

Requisitos obrigatórios antes de persistência ou import:

- sanitizar controles ANSI/C0/C1 vindos de URL, headers e body antes de renderizar,
  evitando terminal injection;
- preservar dados brutos somente em memória/arquivo protegido e renderizar uma view
  segura;
- remover `Authorization`, `Proxy-Authorization`, `Cookie` e headers configuráveis ao
  redirecionar para outra origem;
- a correção local de A05 preserva a proveniência de autenticação e valores
  privados dos headers; cookies aprendidos numa origem não reaparecem noutra em
  saltos posteriores. Cookies próprios do destino continuam disponíveis;
- pausar o transporte corrente para confirmar body/URL privada cross-origin,
  downgrade ou TLS inseguro não aprovado. `[Y]` confirma somente o salto; `[I]`
  continua reservado à aprovação TLS por target/ambiente/sessão. Nenhum caminho
  deve reexecutar POSTs/dependências para retomar um redirect. A fila de 16 itens
  aceita decisões únicas e descarta abort/timeout/unmount;
- headless exige `--allow-private-redirect-to <origin>` para body/URL privada e
  `--allow-http-redirect-to <origin>` para downgrade, com origem exata e flags
  repetíveis; TLS inseguro permanece independente em `--allow-insecure-tls`.
  Credenciais da origem continuam removidas após consentimento. Protocolos não
  HTTP/HTTPS e credenciais na URL do redirect permanecem bloqueados;
- limitar quantidade de redirects e detectar loops;
- aplicar limite depois de descompressão e ter proteção contra payload comprimido
  desproporcional;
- limitar preview e leitura de arquivo de body; caminhos relativos ficam dentro da
  coleção, salvo aprovação explícita para arquivo externo;
- nunca escrever auth, cookie, query sensível ou body cru em log de erro;
- exports com segredo são redigidos por padrão; revelar/exportar requer ação clara;
- abrir a resposta no handler do sistema exige allowlist de imagem raster e magic
  bytes compatíveis; SVG, PDF e MIME/extensão conflitantes nunca são abertos
  diretamente. Salvar continua uma ação separada;
- scripts importados permanecem desabilitados. Futuro scripting deve usar processo
  ou worker isolado, timeout, limite de memória, API reduzida e permissões declaradas;
- TLS inseguro aparece em vermelho e exige confirmação por target/ambiente;
- arquivos privados e histórico usam `0700`/`0600`, escrita atômica e nunca seguem
  symlink inesperado;
- import nunca sobrescreve arquivo sem preview e confirmação;
- erros de parse apontam arquivo/linha sem imprimir o valor secreto.

## Performance e limites

- captura padrão: 1,5 MB por resposta, configurável apenas dentro de teto seguro;
- histórico: 30 metadados por sessão e orçamento inicial de 12 MB para corpos;
- renderizar response como um documento estilizado, não um renderable por linha;
- JSON grande é formatado/foldado incrementalmente ou fora do caminho de input;
- manter URL, body, busca e scroll responsivos durante download;
- cancelamento deve encerrar reader e impedir commit tardio de resposta cancelada;
- preservar seleção absoluta, scroll e split em resize;
- descoberta de `.http` ignora árvores pesadas e é incremental;
- watchers são encerrados ao trocar raiz/fechar aplicação;
- body completo maior que o limite de captura pode ser salvo por streaming em
  arquivo `0600`, até 256 MB, sem ficar inteiro em memória. Somente GET é reenviado
  explicitamente; status não 2xx, cancelamento e erro removem o `.part`.

## Plano de entrega

Tamanhos representam complexidade relativa, não prazo. Cada fase termina com seus
critérios antes da seguinte ampliar o modelo.

### Fase 0 — estabilizar e separar a base (M)

Entregas:

- testes de TUI para foco de URL/editor/history/response e propagação de `[Esc]`;
- incluir todos os focos HTTP no keyboard scope;
- extrair reducer/modelo de workspace e serviço de leitura da resposta;
- vincular toda execução a `executionId`, request, revisão e tab, descartando commit
  tardio ou pertencente a outro contexto;
- distinguir bytes capturados, declarados e truncamento;
- preservar headers repetidos e classificar body textual/binário;
- testes de timeout, cancelamento, resposta grande, chunked, binário e erro;
- remover a implementação HTTP anterior depois de registrar os contratos externos
  com App/Runner/i18n e construir substitutos novos para eles.

Saída:

- `HttpWorkspace.tsx` novo apenas compõe; parsing/transporte/history pertencem a
  módulos novos e nenhum deles importa o serviço HTTP anterior;
- uma request scratch é enviada pelo pipeline novo, sem adapter de migração;
- `[Esc]` fecha history ou desfoca input sem encerrar o app na mesma tecla;
- sucesso, erro, timeout e cancelamento sempre encerram loading da execução correta;
- nenhum teste usa rede externa ou dados reais do usuário.

### Fase 1 — workbench visual e request completo (L)

Entregas:

- protótipo fixture-first dos quatro modos Panorama/Workbench/Foco/Mínimo antes de
  ligar o novo transporte ou storage;
- resolver puro de layout por mínimos de conteúdo, área útil e preferências de
  split, nos layouts framed/compact;
- sidebar inicial com scratch e histórico de sessão;
- tabs primárias de request: Params, Headers, Body, Auth e Mais;
- tabs primárias de response: Pretty, Raw, Headers, Timing e Mais;
- até seis requests scratch montados, dirty state, close e cycle;
- split ajustável, maximização, jump mode e help contextual;
- key/value editor reutilizável com mouse, enable/disable e autocomplete básico;
- auth No Auth/Bearer/Basic/API Key e body JSON/raw/form URL encoded.

Saída:

- fluxo completo funciona em `60×16`, `72×18`, `80×24`, `96×24`, `120×30` e
  `160×40`, degradando sem perder ações;
- mudar tab/pane/layout não perde cursor, draft, resposta ou foco indevidamente;
- headers automáticos aparecem na preparação antes do envio;
- toda ação visível tem mouse e texto com atalhos entre colchetes.

### Fase 2 — projeto, `.http`, ambientes e cURL (XL)

Entregas:

- scanner de `.http`/`.rest`, árvore, busca e watcher;
- parser/serializer lossless com múltiplos requests por arquivo;
- salvar, duplicar, renomear, mover e excluir requests;
- ambientes público/privado, variable preview, autocomplete e keychain opcional;
- protótipo e schema versionado de `.tuiminal/http/config.json` para defaults
  não secretos de workspace/coleção;
- import/export cURL com preview, quoting e masking;
- multipart e body de arquivo com sandbox de caminho;
- migração do scratch para arquivo sem apagar dados;
- CLI continua aceitando `tuiminal http [diretório]`.

Saída:

- round-trip de fixtures `.http` não altera bytes fora do bloco editado;
- abrir outro projeto não restaura coleção/ambiente do projeto anterior;
- segredo privado nunca aparece em arquivo público, snapshot ou histórico;
- alteração externa conflituosa nunca é sobrescrita silenciosamente.

### Fase 3 — depuração de resposta e histórico (L)

Entregas:

- folding JSON, busca, wrap, line numbers e JSON path;
- copy/yank via OSC52 e save seguro de texto/binário;
- redirect chain, cookies por ambiente e timing honesto;
- histórico por request, persistence opt-in e diff de duas respostas;
- política de orçamento global para corpos e limpeza;
- controles de truncamento e download completo por streaming.

Saída:

- resposta grande não bloqueia navegação;
- cookie/redirect respeita domínio, path, secure, expiry e remoção cross-origin;
- history diff funciona sem persistir credencial ou corpo quando desabilitado;
- terminal control sequences aparecem neutralizadas.

### Fase 4 — import amplo, assertions e modo headless (XL)

Entregas:

- import Postman v2.1 e OpenAPI 3.x com relatório de compatibilidade;
- assertions declarativas em `.http` e tab de resultados;
- request chaining sem serializar segredo extraído;
- `tuiminal http run` com saída text/JSON/JUnit e exit codes documentados;
- collection runner com dataset local e concorrência limitada;
- fixtures de compatibilidade e integração CLI/TUI.

Saída:

- o mesmo request produz preparação equivalente na TUI e no CLI;
- CI falha apenas por parse, transporte ou assertion, com exit codes estáveis;
- import é determinístico, não sobrescreve e explica perdas;
- runner cancela filhos e conexões criados por ele, nunca processos externos.

### Fase 5 — recursos avançados sob evidência (pesquisa)

Avaliar, nessa ordem:

1. OAuth2 com armazenamento no keychain;
2. certificados de cliente;
3. SSE como resposta streaming;
4. WebSocket como modo dentro da feature HTTP;
5. scripting isolado e permissionado;
6. GraphQL assistido por schema;
7. gRPC em proposta própria, não como extensão improvisada do HTTP builder.

Nenhum item entra apenas porque um concorrente o possui. Exigir caso de uso,
protótipo, modelo de segurança e impacto de manutenção.

## Estratégia de testes

### Unitários

- resolver de layout em cada limiar, mínimos de pane, clamp/restauração de divisor e
  largura grapheme-aware;
- reducer rejeita resposta cancelada, tardia, de revisão anterior ou de outra tab;
- URL, métodos customizados e rejeição de CR/LF em nome de header;
- duplicatas e ordem de query/headers;
- coerção de body, Content-Type e auth;
- precedência, ciclos, unresolved variables e masking;
- parser/AST/round-trip `.http`, inclusive quotes, comentários e múltiplos requests;
- quoting cURL em Unix e representação segura em plataformas suportadas;
- leitura limitada, UTF-8 quebrado, binário, compressão e truncamento;
- redirects, remoção de credenciais e cookie matching;
- budget/redação do histórico e escrita protegida;
- folding, busca, JSON path e diff.

### Integração local

Servidor HTTP efêmero e isolado para:

- status 1xx/2xx/3xx/4xx/5xx, HEAD, 204 e headers repetidos;
- redirect same-origin/cross-origin/loop;
- resposta lenta antes dos headers e durante o body;
- cancelamento, timeout, chunked, gzip/brotli, body grande e conexão interrompida;
- upload JSON, form, multipart e arquivo;
- cookies com domain/path/secure/expiry;
- proxy HTTP local e TLS com certificado descartável; strict falha, insecure exige
  aprovação anterior ao transporte e só então desativa a verificação.

### TUI real

- clicar, focar, editar, enviar, cancelar e rolar;
- sequência completa de `[Esc]` em autocomplete, input, modal, sidebar e app;
- global shortcuts bloqueados enquanto input/modal/picker possui o teclado;
- layouts compact/framed na matriz `60×16` a `160×40`, inclusive resize atravessando
  todos os breakpoints;
- tabs montadas preservam conteúdo, cursor e resposta;
- divisor por mouse e teclado;
- coleção alterada externamente e conflito de draft;
- todos os textos e targets de tutorial nos seis idiomas;
- variante accessible/reduced-motion com progresso estático, ordem de foco linear e
  estado compreensível sem cor;
- AltGr, tmux/GNU Screen, VS Code terminal, seleção/cópia no macOS e fallbacks de
  teclas de função quando o ambiente estiver disponível.

### CLI e gate

- compatibilidade de `tuiminal http [diretório]`;
- `run`, reports e exit codes sem rede externa;
- import em diretório temporário;
- `bun run check` e `git diff --check` em toda entrega;
- nunca ler config, keychain, `.env` ou serviços reais do usuário nos testes.

## Priorização resumida

| Item | Valor | Risco | Decisão |
| --- | --- | --- | --- |
| Foco, `[Esc]`, cancelamento e limites | Muito alto | Médio | Primeiro |
| Layout Posting-inspired | Muito alto | Médio | Fase 1 |
| Query/headers/auth/body estruturados | Muito alto | Médio | Fase 1 |
| `.http` lossless e coleção de projeto | Muito alto | Alto | Fase 2 |
| Ambientes + segredo privado/keychain | Muito alto | Alto | Fase 2 |
| cURL import/export | Alto | Médio | Fase 2 |
| Busca/folding/copy da resposta | Alto | Médio | Fase 3 |
| Histórico persistente + diff | Alto | Alto por privacidade | Fase 3, opt-in |
| Postman/OpenAPI | Médio | Alto | Fase 4 |
| Assertions/headless | Alto | Alto | Fase 4 |
| Codegen multi-linguagem | Médio | Médio | Depois de cURL |
| Scripts | Alto para poucos casos | Muito alto | Adiado até isolamento |
| WebSocket/SSE | Médio | Alto | Pesquisa após HTTP maduro |
| gRPC/MQTT | Baixo no escopo atual | Muito alto | Fora do plano imediato |

## Decisões que precisam permanecer explícitas

- **Escolhido:** visual baseado no Posting, adaptado às regras do Tuiminal.
- **Escolhido:** reconstrução do zero da feature HTTP; não copiar componentes,
  reducers, tipos, helpers, testes ou fluxo de execução anteriores.
- **Escolhido:** preservar apenas os contratos públicos necessários (`active`, URL
  encaminhada pelo Runner, keyboard scope e shutdown futuro) e reutilizar somente
  infraestrutura transversal do Tuiminal, como tema, i18n, OpenTUI e UI compartilhada.
- **Escolhido:** quatro composições por restrição: Panorama em três colunas,
  Workbench com sidebar/split, Foco sem sidebar fixa e Mínimo com um pane.
- **Escolhido:** tabs primárias estáveis e divulgação progressiva; Params reúne
  Query/Path e `Mais` abriga capacidades raras sem mover controles de posição.
- **Escolhido:** URL, ambiente e enviar/cancelar permanecem na omnibar; footer é
  contextual e limitado, não uma lista de todo o keymap.
- **Escolhido:** foco segue ordem visual, atalhos globais não mudam de significado e
  `[Esc]` fecha uma camada por vez em qualquer breakpoint.
- **Escolhido:** estado nunca depende apenas de cor/animação; o layout terá variante
  accessible/reduced-motion e saída headless linear.
- **Escolhido:** `.http` como formato canônico versionável; estado de UI fica fora.
- **Escolhido:** raiz do projeto atual acima de qualquer sessão restaurada.
- **Escolhido:** histórico de sessão padrão; persistência é opt-in e redigida.
- **Escolhido:** host environment não é carregado implicitamente.
- **Escolhido:** até seis requests montados, alinhado ao SQL workspace.
- **Escolhido:** timing parcial é rotulado como parcial; não simular DNS/TLS.
- **Escolhido:** scripts e protocolos adicionais não bloqueiam as quatro primeiras
  fases.
- **Validar em protótipo:** qualidade de um AST lossless `.http` em TypeScript/Bun.
- **Validar em protótipo:** custo de formatar/foldar JSON grande fora do caminho de
  input no OpenTUI.
- **Validar em protótipo:** API de Bun para múltiplos `Set-Cookie`, trailers,
  streaming e redirects manuais nas versões suportadas.

Se uma validação falhar, atualizar este documento com a evidência e a alternativa;
não esconder a limitação atrás de uma abstração que prometa mais do que entrega.

## Definição de concluído do programa

O plano estará implementado, e não apenas “com a tela nova”, quando:

1. scratch, projeto `.http`, ambiente, segredo e histórico tenham limites claros;
2. os fluxos de request e response funcionem por teclado e mouse nos dois layouts;
3. `.http` faça round-trip sem perda e seja executável na TUI e no modo headless;
4. response tenha inspeção, busca, copy/save, truncamento e erro honestos;
5. cancelamento, redirects, cookies, arquivos e persistência passem pelos testes de
   segurança descritos;
6. import nunca sobrescreva silenciosamente e sempre produza relatório;
7. nenhum recurso novo quebre Database, Git, Runner ou Free Terminal;
8. README, AGENTS, atalhos, traduções, tutorial e testes estejam atualizados por
   fase;
9. `bun run check` e `git diff --check` passem;
10. uma auditoria manual confirme a matriz `60×16`–`160×40`, compact, framed,
    mouse, drag, resize e sequência real de `[Esc]`;
11. foco, status, dirty state, produção, erro, truncamento e redação continuem
    compreensíveis sem cor e sem animação.
