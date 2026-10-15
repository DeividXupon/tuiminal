import {
  paletteAction,
  type RunnablePaletteAction,
} from "@xupon/tuiminal-core/ui/use-action-palette"

type QueryActionState = { confirming: boolean; busy: boolean; canNewTab: boolean; hasRow: boolean }
type QueryActionHandlers = Record<
  | "run"
  | "cancel"
  | "editor"
  | "clear"
  | "save"
  | "favorites"
  | "newTab"
  | "closeTab"
  | "catalog"
  | "maximize"
  | "sensitive"
  | "inspector",
  () => void
>

export function databaseQueryActions(
  state: QueryActionState,
  handlers: QueryActionHandlers,
  gridActions: readonly RunnablePaletteAction[],
  boxAction?: RunnablePaletteAction,
) {
  return [
    ...(boxAction ? [boxAction] : []),
    paletteAction(
      "run",
      "[Ctrl+A]",
      state.confirming ? "Confirmar execução" : "Executar SQL",
      "Executa a instrução no cursor; escritas exigem confirmação.",
      "SQL",
      handlers.run,
      state.busy && "Operação em andamento",
    ),
    paletteAction(
      "cancel",
      "[Ctrl+X]",
      "Cancelar",
      "Cancela a consulta em andamento.",
      "SQL",
      handlers.cancel,
      !state.busy && "Nenhuma consulta em andamento",
    ),
    paletteAction(
      "editor",
      "[A]",
      "Editor SQL",
      "Foca o editor sem alterar o SQL.",
      "SQL",
      handlers.editor,
    ),
    paletteAction(
      "clear",
      "[L]",
      "Limpar",
      "Limpa o editor e o resultado da consulta.",
      "SQL",
      handlers.clear,
      state.busy && "Operação em andamento",
    ),
    paletteAction(
      "save",
      "[Ctrl+S]",
      "Salvar favorita",
      "Salva o SQL atual nas consultas favoritas.",
      "SQL",
      handlers.save,
      state.busy && "Operação em andamento",
    ),
    paletteAction(
      "favorites",
      "[Ctrl+F]",
      "Favoritas",
      "Abre as consultas favoritas desta conexão.",
      "SQL",
      handlers.favorites,
    ),
    paletteAction(
      "new-tab",
      "[Ctrl+N]",
      "Nova aba SQL",
      "Abre outra aba na conexão atual.",
      "NAVEGAÇÃO",
      handlers.newTab,
      !state.canNewTab && "Limite de abas atingido",
    ),
    paletteAction(
      "close-tab",
      "[Ctrl+W]",
      "Fechar aba",
      "Fecha a aba SQL atual.",
      "NAVEGAÇÃO",
      handlers.closeTab,
    ),
    paletteAction(
      "catalog",
      "",
      "Catálogo",
      "Retorna à lista de tabelas preservando o SQL.",
      "NAVEGAÇÃO",
      handlers.catalog,
    ),
    paletteAction(
      "maximize",
      "[F10]",
      "Maximizar foco",
      "Alterna entre a divisão e o painel maximizado.",
      "NAVEGAÇÃO",
      handlers.maximize,
    ),
    paletteAction(
      "sensitive",
      "[V]",
      "Dados sensíveis",
      "Campos sensíveis começam visíveis. [V] mascara os valores; para revelá-los novamente, confirme com [V].",
      "Dados",
      handlers.sensitive,
    ),
    paletteAction(
      "inspector",
      "[I]",
      "Inspetor",
      "Mostra os campos da linha selecionada.",
      "Dados",
      handlers.inspector,
      !state.hasRow && "Selecione uma linha",
    ),
    ...gridActions,
  ]
}
