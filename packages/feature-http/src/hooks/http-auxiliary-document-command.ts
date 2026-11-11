import { httpWorkspaceTabs } from "../model/environment-documents"
import type { HttpKeyboardCommand } from "../model/keyboard-types"
import type { HttpWorkspaceState } from "../model/types"
import type { HttpWorkspaceAction } from "../model/workspace"
import type { HttpEnvironmentTabs } from "./use-http-environment-tabs"
import type { HttpCollectionSettings } from "./use-http-collection-settings"

export function applyHttpAuxiliaryDocumentCommand(
  command: HttpKeyboardCommand,
  state: HttpWorkspaceState,
  editor: HttpEnvironmentTabs | HttpCollectionSettings,
  blur: () => void,
  dispatch: (action: HttpWorkspaceAction) => void,
) {
  if (command.kind === "cycle-pane") {
    blur()
    dispatch({
      type: "select-pane",
      pane: state.activePane === "navigation" ? "request" : "navigation",
    })
  }
  if (command.kind === "save-document") void editor.save(state.activeDocumentId)
  if (command.kind === "close-document") editor.close(state.activeDocumentId)
}

export function selectHttpWorkspaceTab(
  command: HttpKeyboardCommand,
  state: HttpWorkspaceState,
  select: (id: string, focusUrl: boolean) => void,
) {
  if (command.kind !== "select-document" && command.kind !== "cycle-document") return false
  const tabs = httpWorkspaceTabs(state)
  const index =
    command.kind === "select-document"
      ? command.index
      : (tabs.findIndex((tab) => tab.id === state.activeDocumentId) +
          command.direction +
          tabs.length) %
        tabs.length
  const tab = tabs[index]
  if (tab) select(tab.id, false)
  return true
}

export function blurHttpWorkspaceControl(
  command: HttpKeyboardCommand,
  blur: () => void,
  blurDocument: () => void,
  dispatch: (action: HttpWorkspaceAction) => void,
) {
  if (!["blur-editor", "blur-control", "blur-navigation-control"].includes(command.kind))
    return false
  blur()
  if (command.kind === "blur-editor") blurDocument()
  dispatch({
    type: "select-pane",
    pane: command.kind === "blur-navigation-control" ? "navigation" : "request",
  })
  return true
}
