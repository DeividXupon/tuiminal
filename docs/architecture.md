# Arquitetura atual

O Tuiminal é um monólito modular: um aplicativo, uma instalação e módulos internos
com responsabilidades e dependências verificadas automaticamente. Essa estrutura
facilita encontrar código, testar regras sem montar uma tela e adicionar ferramentas
sem transformar o núcleo numa lista de detalhes internos de cada funcionalidade.

## Mapa do código

```text
bin/tuiminal.ts                 argumentos e diretório da invocação
src/index.tsx                  entrada estável
src/app/
  bootstrap.tsx                inicialização explícita e renderizador
  App.tsx                      composição, navegação e modais globais
  tool-catalog.ts              identificadores, aliases e atalhos
  feature-registry.ts          políticas de teclado e encerramento
  ui/                          configurações e termos sensíveis
  tutorial/                    sobreposição e roteiro do tutorial
src/core/
  keyboard/                    contrato de posse do teclado
  lifecycle/                   encerramento de todos os recursos registrados
  settings/                    tema e persistência das preferências
src/shared/
  ui/                          controles reutilizáveis
  i18n/                        traduções, largura Unicode e runtime JSX
  security/                    mascaramento de valores sensíveis
  data/                        normalização de propriedades opcionais
src/features/
  runner/                      comandos, processos, logs e projetos
  database/                    catálogo, SQL, grid, inspeção e conexões
  git/                         arquivos, commits, grafo e diffs
  http/                        requisições e respostas
  terminal/                    sessões PTY livres
tests/                         lógica e integrações locais
  tui/                         interação no renderizador OpenTUI
  fixtures/                    projetos descartáveis de demonstração
scripts/                       verificações de arquitetura e manutenção
docs/adr/                      decisões e tradeoffs
```

Cada ferramenta expõe somente a API usada pelo aplicativo em `index.ts`. Nem toda
ferramenta precisa de todas as subpastas: crie-as quando houver uma responsabilidade
concreta. Não adicione arquivos vazios apenas para satisfazer o desenho.

## Dependências permitidas

- `app` compõe as APIs públicas das features e utiliza `core`/`shared`.
- Features não importam outras features nem `app`. Runner solicita abrir uma URL
  via callback; a aplicação decide encaminhá-la ao HTTP.
- `core` e `shared` não conhecem features nem `app`; podem se comunicar sem ciclos.
- `model` contém regras e tipos, sem React, OpenTUI, IO ou imports de serviços,
  storage e renderização, inclusive imports usados somente como tipos.
- Serviços e persistência podem utilizar o modelo. UI utiliza modelo e serviços;
  detalhes de renderização ficam fora do domínio.
- Não há ciclos, imports locais não resolvidos ou acesso da aplicação aos internos
  das ferramentas. `.dependency-cruiser.cjs` verifica essas regras e descobre novas
  features automaticamente. O wrapper também falha se qualquer fonte for ignorado.

O `services/runner.ts` ainda é uma fachada interna de compatibilidade para os
consumidores da própria ferramenta; não é o SDK público de plugins.

## Separações já aplicadas

Runner tem módulos distintos para descoberta de projetos, detectores por família
de linguagem, comandos de shell, processos, PTY, registro de processos, portas,
health checks e abertura de URLs. O painel múltiplo, a apresentação dos status,
os tipos e as preferências dos logs saíram do workspace. Filtro, stream e horários
usam um reducer puro com transições testadas.

Banco separa workspace principal, workspace SQL, inspetor de linha e demonstração
do tutorial. Tipos, seleção, staging e análise léxica SQL ficam no modelo; exportar
seleção para disco fica em storage. Realçar um editor OpenTUI utiliza o lexer,
mas o autocomplete não depende do renderizador.

Git separa árvore de arquivos, grafo de commits, diff/intraline, tipos e apresentação.

Ainda há controladores grandes de Banco e Runner. A separação de pastas não os
torna pequenos automaticamente: o [ADR](./adr/0001-modular-monolith.md) registra os
próximos cortes, e o baseline impede crescimento silencioso.

## Inicialização, teclado e encerramento

O catálogo define Runner como ferramenta inicial, tanto no CLI quanto no modo de
desenvolvimento. O lançamento resolve a ferramenta uma vez por montagem: um modo
isolado válido tem prioridade; identificadores desconhecidos voltam ao padrão.

A cor de marca está em `shared/ui/brand.ts`: `#4B75FF`. `ShortcutText` traduz e
estiliza somente os trechos `[atalho]` em um único nó nativo de texto, preservando
largura, quebra de linha e cores herdadas do rótulo. O componente é explícito:
o runtime JSX não recolore colchetes de logs/SQL/dados. `InlineButton` o utiliza
automaticamente; textos mistos de ajuda/dados podem desativar o destaque.

Na adoção desse componente em 2026-09-04, os limites de linhas de 12 telas foram
ajustados somente pelos imports, opt-outs de dados e quebras do formatter
(1–8 linhas por arquivo). Os limites de complexidade permaneceram inalterados;
essa revisão não abre margem para aumentar a lógica dos controladores.

Importar o tema não lê preferências nem altera idioma/mascaramento globais.
`initializeUiSettings()` é chamado explicitamente pelo CLI e bootstrap. As features
são importadas depois da inicialização do tema, pois estilos SQL/diff capturam cores.
Configurações continuam no mesmo local; não há migração dos dados do usuário.

As políticas de teclado ficam em `features/<nome>/keyboard.ts`. Inputs e pickers
focados retêm os atalhos; os modais consomem o evento localmente. `[Esc]` primeiro
desfoca o input e só depois fecha o modal. O Banco mantém o tratamento adiado de
Escape, e PTYs retêm Ctrl+C. Não foi introduzido um event bus nem substituído o
sistema de foco nativo do OpenTUI.

O encerramento usa os disposers das ferramentas montadas. Uma falha não impede os
outros disposers de executar. Cada módulo continua responsável por encerrar somente
os processos/conexões que criou; encerrar ferramentas não autoriza matar processos
descobertos por varredura de portas.

## Adicionar uma ferramenta

1. Crie `features/<nome>` com componente e modelos testáveis.
2. Exporte a superfície mínima por `index.ts`.
3. Registre identificador, aliases, rótulo e atalho em `app/tool-catalog.ts`.
4. Declare a política de teclado e, se necessário, um disposer na composição
   `app/feature-registry.ts`. Não inclua IDs internos diretamente em `App`.
5. Adicione o painel em `App`, respeitando `active`, abas visitadas e modo isolado.
   Montar apenas a ferramenta escolhida não implica carregamento dinâmico de código
   por ferramenta: essa otimização ainda não foi implementada.
6. Acrescente traduções, testes unitários e de TUI, documentação e tutorial aplicável.
7. Execute o gate completo. Não use `@ts-ignore`, `any` ou relaxamento de regras
   como substituto da modelagem de estados e opcionais.
