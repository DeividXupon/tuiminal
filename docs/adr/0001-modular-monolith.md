# ADR 0001 — Monólito modular antes do SDK de plugins

Status: aceito e aplicado como primeira etapa em 2026-09-04.

## Contexto

A análise encontrou 41 arquivos de fonte com aproximadamente 27,7 mil linhas.
Banco reunia 5.720 linhas de interface, Runner 3.036 e Git 2.142. O entrypoint
misturava uma ferramenta, aplicação e bootstrap. Modelos importavam tipos de serviços,
e o guard global conhecia dezenas de IDs internos de inputs e modais.

Mudar diretamente para vários pacotes publicáveis adicionaria versionamento,
builds e compatibilidade de SDK antes de haver limites estáveis entre módulos.

## Decisão

Organizar `app`, `core`, `shared` e features independentes; extrair responsabilidades
coesivas; verificar dependências, tipos e interações antes de criar workspaces/plugins.
Usar reducers pequenos quando os estados pertencem à mesma regra; preservar refs,
identidade dos componentes, processos e sessões durante a migração.

Padronizar Bun 1.3.14, formatter Biome, TypeScript estrito e CI em Linux/macOS.
Ativar `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitReturns`
e `noFallthroughCasesInSwitch`. Valores ausentes são omitidos em fronteiras de
normalização; drafts que permitem limpar campos declaram isso explicitamente.

O dependency-cruiser 18 precisa da API AST do TypeScript anterior à versão 7.
Manter o compilador nativo 7 sob alias e a API 6 como dependência exclusivamente de
desenvolvimento evita aceitar um relatório vazio de “zero violações”. O wrapper
exige que todos os arquivos sejam efetivamente analisados. Revisitar essa solução
quando houver suporte à API nativa, sem mudar o runtime de produção.

## Consequências e limites

- Mais arquivos, mas cada responsabilidade tem um local identificável.
- Não muda atalhos, layout, dados salvos ou formato da configuração do usuário.
- O custo principal da mudança é revisão de imports e formatação, não nova lógica.
- Testes nativos de TUI cobrem Runner, modal de salvar e composição com App;
  não representam cobertura visual completa de todas as ferramentas.
- Permanecem funções e controladores grandes. Os avisos existentes ficam visíveis
  e o baseline limita tamanho e complexidade por arquivo. Não foi “zerada” a dívida.
- Não foi feita medição comparativa de desempenho nesta etapa; organização melhor
  não é evidência de redução de latência.
- Não há monorepo, SDK, marketplace, carregador de plugins nem sandbox implementados.

## Validação

Validação local desta etapa: `bun install --frozen-lockfile`, `bun run check`,
`bun test` e `git diff --check` passaram. São 127 testes aprovados (124 de lógica/
integração local e 3 de TUI), 6 itens da matriz Docker opt-in ignorados e nenhuma
falha. O grafo analisou 96 módulos de fonte e 417 dependências, sem violações.
Os 60 avisos de complexidade existentes estão no baseline, sem regressões no gate.
O Runner também foi aberto pelo CLI com configuração temporária para conferir
modo múltiplo, digitação e modal de salvar. O CI foi configurado, mas não executado
remotamente nesta alteração.

## Próximas extrações, em ordem

1. Runner: lifecycle das execuções/restarts/health e sessões; separar painel de
   comandos, picker, histórico e log com contratos menores e testes de navegação.
2. Banco: separar persistência de conexões/histórico, adaptadores MySQL/Postgres/SQLite
   e execução/cancelamento; decompor controladores de grid e SQL por transações de estado.
3. Git: reduzir controle de navegação e ampliar testes de grafo/diff/renderização.
4. Expandir testes TUI para Banco, PTYs, redimensionamento, mouse e todos os idiomas.
5. Prototipar uma ferramenta usando somente um contrato candidato a SDK. Só então
   avaliar workspaces, publicação, permissões e isolamento descritos no plano de plugins.

Cada corte deve preservar comportamento e reduzir o baseline. Não mover todo um
controlador para `useWorkspace.ts` apenas para diminuir o arquivo visível.
