import { InputRenderable, TextareaRenderable, type Renderable } from "@opentui/core"
import { focusHttpRequestForm } from "../ui/HttpRequestForm"
import { useKeyboard, useRenderer } from "@opentui/react"
import type { RefObject } from "react"
import { resolveHttpKeyboardCommand } from "../model/keyboard"
import type { HttpKey, HttpKeyboardCommand } from "../model/keyboard-types"
import type { HttpDocumentState, HttpWorkspaceState } from "../model/types"
import type { HttpCompletionKey } from "../model/variable-completion"
import type { HttpRequestTableKey } from "./use-http-request-tables"
import { handleHttpCollectionTreeKey } from "../ui/handle-collection-tree-key"
import { httpJsonTreeForDocument } from "../model/json-tree"

export function useHttpKeyboard({
  active,
  collectionSettingsActive = false,
  stateRef,
  minimum,
  chooseSource,
  runCommand,
  variableCompletionKeyRef,
  requestTableKeyRef,
  collectionTreeKeyRef,
}: {
  active: boolean
  collectionSettingsActive?: boolean
  stateRef: RefObject<HttpWorkspaceState>
  minimum: boolean
  chooseSource: () => void
  runCommand: (command: HttpKeyboardCommand) => void
  variableCompletionKeyRef: RefObject<((key: HttpCompletionKey) => boolean) | null>
  requestTableKeyRef: RefObject<((key: HttpRequestTableKey) => boolean) | null>
  collectionTreeKeyRef: RefObject<((key: HttpKey) => boolean) | null>
}) {
  const renderer = useRenderer()
  useKeyboard((key) => {
    if (!active || key.defaultPrevented) return
    const focusedId = renderer.currentFocusedRenderable?.id ?? ""
    if (
      /^http-(collection-(menu|action-|name-input)|environment-menu|chain-picker-)/.test(focusedId)
    )
      return
    const currentState = stateRef.current
    if (isSourcePickerShortcut(key, currentState.overlay)) {
      key.preventDefault()
      key.stopPropagation()
      chooseSource()
      return
    }
    const currentDocument = currentState.documents.find(
      (document) => document.request.id === currentState.activeDocumentId,
    )
    if (variableCompletionKeyRef.current?.(key)) return
    if (handleHttpCollectionTreeKey(key, currentState, focusedId, collectionTreeKeyRef)) return
    if (
      collectionSettingsOwnsKey(
        collectionSettingsActive,
        currentState,
        key,
        renderer.currentFocusedRenderable,
      )
    )
      return
    if (currentDocument && requestTableOwnsKey(currentState, requestTableKeyRef, key)) return
    const command = resolveHttpKeyboardCommand({
      key,
      focusedId,
      navigationOpen: currentState.navigationOpen,
      minimum,
      activePane: currentState.activePane,
      overlay: currentState.overlay,
      navigationView: currentState.navigationView,
      ...documentKeyboardContext(currentDocument),
    })
    if (command.kind === "none" || command.kind === "ignore") return
    key.preventDefault()
    key.stopPropagation()
    runCommandWithFormFocus(command, currentDocument, renderer.root, runCommand)
  })
}

function requestTableOwnsKey(
  state: HttpWorkspaceState,
  keyRef: RefObject<((key: HttpRequestTableKey) => boolean) | null>,
  key: HttpRequestTableKey,
) {
  return state.overlay === null && state.activePane === "request" && keyRef.current?.(key)
}

function runCommandWithFormFocus(
  command: HttpKeyboardCommand,
  document: HttpDocumentState | undefined,
  root: Renderable,
  runCommand: (command: HttpKeyboardCommand) => void,
) {
  if (command.kind === "focus-request-form") {
    if (!document) return
    const form = document.requestView === "auth" ? "auth" : document.requestMoreView
    focusHttpRequestForm(root, `${form}-${document.request.id}`)
  } else runCommand(command)
}

function isSourcePickerShortcut(key: HttpKey, overlay: HttpWorkspaceState["overlay"]) {
  return key.ctrl && key.name === "g" && overlay === null
}

function documentKeyboardContext(document: HttpDocumentState | undefined) {
  if (!document)
    return {
      running: false,
      requestView: "params" as const,
      requestMoreView: "options" as const,
      responseView: "pretty" as const,
      responseMoreView: "summary" as const,
      responseJsonTree: false,
    }
  return {
    running: document.execution.status === "running",
    requestView: document.requestView,
    requestMoreView: document.requestMoreView,
    responseView: document.responseView,
    responseMoreView: document.responsePresentation.moreView,
    responseJsonTree: httpJsonTreeForDocument(document) !== null,
  }
}

function collectionSettingsOwnsKey(
  active: boolean,
  state: HttpWorkspaceState,
  key: HttpKey,
  control: Renderable | null,
) {
  if (!active || state.activePane === "navigation" || key.ctrl || key.meta || key.option)
    return false
  return (
    control instanceof InputRenderable ||
    control instanceof TextareaRenderable ||
    ["a", "f", "z", "v", "n", "return", "enter", "escape"].includes(key.name)
  )
}
