import type { ActionPaletteAction } from "@xupon/tuiminal-core/ui/action-palette"
import { orderActionPaletteActions } from "@xupon/tuiminal-core/ui/action-palette"
import type { GitFocusPane, ViewMode } from "./view"

export type GitBaseActionTag =
  | "files"
  | "diff"
  | "history"
  | "terminal"
  | "box"
  | "partial"
  | "navigation"
  | "app"

export type GitBaseActionId =
  | "open-selection"
  | "stage-file"
  | "stage-selection"
  | "discard"
  | "partial-stage"
  | "diff-layout"
  | "show-diff"
  | "log"
  | "graph"
  | "next-commit"
  | "previous-commit"
  | "open-commit"
  | "focus-terminal"
  | "toggle-terminal"
  | "choose-box"
  | "focus-files"
  | "focus-preview"
  | "partial-toggle-mode"
  | "partial-transfer"
  | "partial-apply"
  | "tab-pr"
  | "tab-issues"
  | "tab-inbox"
  | "compare"
  | "refresh"
  | "local-configuration"

export type GitBaseAction = ActionPaletteAction<GitBaseActionId, GitBaseActionTag>

export type GitBaseActionState = {
  repository: boolean
  focusedPane: GitFocusPane
  view: ViewMode
  partialStage: boolean
  partialStageStartDisabled: boolean
  fileCount: number
  selectedActionFileCount: number
  selectedFolder: boolean
  busy: boolean
  stagePending: boolean
  hasSelectedCommit: boolean
  commitCount: number
  terminalExpanded: boolean
  navigation: boolean
  localConfiguration: boolean
}

export function gitFocusedBlockTag(state: Pick<GitBaseActionState, "focusedPane" | "view">) {
  if (state.focusedPane === "files") return "files" as const
  if (state.focusedPane === "terminal") return "terminal" as const
  return state.view === "log" || state.view === "graph" ? ("history" as const) : ("diff" as const)
}

type Rule = string | null | false

function firstReason(...rules: Rule[]) {
  return rules.find((rule): rule is string => Boolean(rule)) ?? null
}

function historyView(view: ViewMode) {
  return view === "log" || view === "graph"
}

function action(
  id: GitBaseActionId,
  shortcut: string,
  label: string,
  description: string,
  tags: readonly GitBaseActionTag[],
  ...rules: Rule[]
): GitBaseAction {
  return { id, shortcut, label, description, tags, disabledReason: firstReason(...rules) }
}

function fileActions(state: GitBaseActionState): GitBaseAction[] {
  const diffView = state.view !== "diff" && "Disponível na visualização de diff"
  const noSelection = !state.selectedActionFileCount && "Selecione um arquivo ou pasta"
  const busy = state.busy && "Operação Git em andamento"
  const actions = [
    action(
      "open-selection",
      "[Enter]",
      "Abrir arquivo ou pasta",
      "Abre o diff do arquivo ou recolhe a pasta selecionada.",
      ["files"],
      !state.fileCount && "Nenhum arquivo alterado",
      state.focusedPane !== "files" && "Foque a árvore de arquivos",
    ),
    action(
      "stage-file",
      "[␠]",
      "Stage / unstage",
      "Alterna o stage do arquivo ou pasta selecionado.",
      ["files"],
      diffView,
      noSelection,
      busy,
    ),
    action(
      "stage-selection",
      "[A]",
      state.selectedFolder ? "Stage da pasta" : "Stage de todos",
      "Adiciona ao stage todas as alterações do escopo.",
      ["files"],
      diffView,
      !state.fileCount && "Nenhum arquivo alterado",
      busy,
    ),
  ]
  if (state.view === "diff") {
    actions.push(
      action(
        "discard",
        "[D]",
        "Descartar alterações",
        "Pede confirmação antes de descartar o alvo selecionado.",
        ["files"],
        noSelection,
        busy,
        state.stagePending && "Operação Git em andamento",
      ),
    )
  }
  return actions
}

function diffActions(state: GitBaseActionState): GitBaseAction[] {
  const actions = [
    action(
      "partial-stage",
      "[S]",
      "Stage parcial",
      "Escolhe hunks ou linhas do arquivo para o stage.",
      ["diff"],
      state.view !== "diff" && "Disponível na visualização de diff",
      state.focusedPane !== "preview" && "Foque o painel de diff",
      state.partialStageStartDisabled && "Indisponível para o arquivo selecionado",
    ),
    action(
      "diff-layout",
      "[V]",
      "Alternar visualização",
      "Alterna entre diff unificado, lado a lado e inline.",
      ["diff"],
      historyView(state.view) && "Disponível na visualização de diff",
    ),
  ]
  if (state.view !== "diff") {
    actions.push(
      action("show-diff", "[D]", "Voltar ao diff", "Mostra as alterações locais.", ["diff"]),
    )
  }
  return actions
}

function historyActions(state: GitBaseActionState): GitBaseAction[] {
  const history = !historyView(state.view) && "Abra o histórico ou a árvore de commits"
  const historyFocus = state.focusedPane !== "preview" && "Foque o histórico de commits"
  return [
    action(
      "log",
      "[O]",
      "Histórico de commits",
      "Lista os commits de todos os branches.",
      ["history"],
      state.view === "log" && "Já está aberto",
    ),
    action(
      "graph",
      "[G]",
      state.view === "graph" ? "Fechar árvore de commits" : "Árvore de commits",
      "Mostra o grafo de commits de todos os branches.",
      ["history"],
    ),
    action(
      "next-commit",
      "[J/↓]",
      "Próximo commit",
      "Seleciona o commit seguinte.",
      ["history"],
      history,
      historyFocus,
      !state.commitCount && "Nenhum commit",
    ),
    action(
      "previous-commit",
      "[K/↑]",
      "Commit anterior",
      "Seleciona o commit anterior.",
      ["history"],
      history,
      historyFocus,
      !state.commitCount && "Nenhum commit",
    ),
    action(
      "open-commit",
      "[Enter]",
      "Abrir commit",
      "Mostra o diff do commit selecionado.",
      ["history"],
      history,
      historyFocus,
      !state.hasSelectedCommit && "Nenhum commit selecionado",
    ),
  ]
}

function boxActions(state: GitBaseActionState): GitBaseAction[] {
  return [
    action("choose-box", "[M]", "Escolher box", "Navega visualmente entre os boxes abertos.", [
      "box",
    ]),
    action(
      "focus-files",
      "",
      "Focar arquivos",
      "Move o foco para a árvore de arquivos.",
      ["box", "files"],
      state.focusedPane === "files" && "Já está focado",
    ),
    action(
      "focus-preview",
      "",
      historyView(state.view) ? "Focar histórico" : "Focar diff",
      "Move o foco para o painel de visualização.",
      ["box", historyView(state.view) ? "history" : "diff"],
      state.focusedPane === "preview" && "Já está focado",
    ),
    action(
      "focus-terminal",
      "[T]",
      "Focar terminal Git",
      "Executa comandos Git no projeto selecionado.",
      ["box", "terminal"],
      state.focusedPane === "terminal" && "Já está focado",
    ),
    action(
      "toggle-terminal",
      "",
      state.terminalExpanded ? "Recolher terminal Git" : "Expandir terminal Git",
      "Alterna a altura do terminal Git.",
      ["terminal"],
    ),
  ]
}

function partialStageActions(): GitBaseAction[] {
  return [
    action(
      "partial-toggle-mode",
      "[S]",
      "Alternar hunk/linha",
      "Muda a granularidade da seleção.",
      ["partial"],
    ),
    action(
      "partial-transfer",
      "[␠]",
      "Mover seleção",
      "Move o hunk ou linha atual entre os painéis.",
      ["partial"],
    ),
    action(
      "partial-apply",
      "[Enter]",
      "Aplicar stage parcial",
      "Aplica a seleção e volta ao diff.",
      ["partial"],
    ),
  ]
}

function navigationActions(state: GitBaseActionState): GitBaseAction[] {
  if (!state.navigation) return []
  return [
    action("tab-pr", "[2]", "Pull Requests", "Abre os pull requests do GitHub.", ["navigation"]),
    action("tab-issues", "[3]", "Issues", "Abre as issues do GitHub.", ["navigation"]),
    action("tab-inbox", "[4]", "Inbox", "Abre as notificações do GitHub.", ["navigation"]),
    action("compare", "[C]", "Comparar branches", "Compara dois branches sem checkout.", [
      "navigation",
    ]),
  ]
}

function appActions(state: GitBaseActionState): GitBaseAction[] {
  const actions = [
    action(
      "refresh",
      "[R]",
      "Atualizar repositório",
      "Relê o status, os arquivos e os commits.",
      ["app"],
      state.stagePending && "Operação Git em andamento",
    ),
  ]
  if (state.localConfiguration) {
    actions.push(
      action(
        "local-configuration",
        "[Ctrl+P]",
        "Escolher repositório local",
        "Troca o projeto exibido no Diffs.",
        ["app"],
      ),
    )
  }
  return actions
}

/**
 * Every Diffs action with its availability. The focused block comes first, then
 * other available actions, then unavailable ones with their reason.
 */
export function gitBaseActions(state: GitBaseActionState): GitBaseAction[] {
  if (!state.repository) {
    return orderActionPaletteActions([...navigationActions(state), ...appActions(state)])
  }
  const blocked = state.partialStage ? "Conclua o stage parcial" : null
  const regular = [
    ...fileActions(state),
    ...diffActions(state),
    ...historyActions(state),
    ...boxActions(state),
    ...navigationActions(state),
  ].map((candidate) =>
    blocked && !candidate.disabledReason ? { ...candidate, disabledReason: blocked } : candidate,
  )
  const actions = [
    ...(state.partialStage ? partialStageActions() : []),
    ...regular,
    ...appActions(state),
  ]
  const focused = state.partialStage ? "partial" : gitFocusedBlockTag(state)
  return orderActionPaletteActions([
    ...actions.filter((candidate) => candidate.tags[0] === focused),
    ...actions.filter((candidate) => candidate.tags[0] !== focused),
  ])
}
