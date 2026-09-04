import type { HttpJumpTarget, HttpRequestView, HttpWorkspaceOverlay } from "./types"

type HttpKey = {
  name: string
  ctrl?: boolean
  shift?: boolean
  option?: boolean
}

export type HttpKeyboardCommand =
  | {
      kind: "none" | "ignore" | "blur-url" | "blur-editor" | "blur-control" | "send" | "cancel"
    }
  | {
      kind:
        | "add-document"
        | "close-document"
        | "cycle-response"
        | "close-navigation"
        | "save-document"
        | "cycle-environment"
    }
  | { kind: "toggle-maximize" }
  | { kind: "open-overlay"; overlay: Exclude<HttpWorkspaceOverlay, null> }
  | { kind: "close-overlay" }
  | { kind: "jump"; target: HttpJumpTarget }
  | { kind: "resize-split"; direction: -1 | 1 }
  | { kind: "cycle-document" | "cycle-method"; direction: -1 | 1 }
  | { kind: "focus-url" }
  | { kind: "request-view"; view: HttpRequestView }
  | { kind: "navigation"; view: "collection" | "history" }
  | { kind: "pane"; pane: "request" | "response" }

const REQUEST_VIEWS: Partial<Record<string, HttpRequestView>> = {
  p: "params",
  h: "headers",
  b: "body",
  a: "auth",
  o: "more",
}

const JUMP_TARGETS: Partial<Record<string, HttpJumpTarget>> = {
  u: "url",
  p: "params",
  h: "headers",
  b: "body",
  a: "auth",
  r: "response",
  c: "collection",
  y: "history",
}

const DIRECT_COMMANDS: Partial<Record<string, HttpKeyboardCommand>> = {
  "/": { kind: "focus-url" },
  e: { kind: "cycle-environment" },
  v: { kind: "cycle-response" },
  f10: { kind: "toggle-maximize" },
  f1: { kind: "open-overlay", overlay: "help" },
  "?": { kind: "open-overlay", overlay: "help" },
}

function overlayCommand(overlay: HttpWorkspaceOverlay, key: HttpKey): HttpKeyboardCommand | null {
  if (!overlay) return null
  if (key.name === "escape" || key.name === "f1" || (key.ctrl && key.name === "o")) {
    return { kind: "close-overlay" }
  }
  if (overlay === "jump") {
    const target = JUMP_TARGETS[key.name]
    if (target) return { kind: "jump", target }
  }
  return { kind: "ignore" }
}

function singleLineInputCommand(
  key: HttpKey,
  blurKind: "blur-url" | "blur-control",
): HttpKeyboardCommand {
  if (key.ctrl && key.name === "s") return { kind: "save-document" }
  return key.name === "escape" ? { kind: blurKind } : { kind: "ignore" }
}

function editorCommand(key: HttpKey): HttpKeyboardCommand {
  if (key.ctrl && key.name === "s") return { kind: "save-document" }
  if (key.ctrl && (key.name === "enter" || key.name === "return")) return { kind: "send" }
  return key.name === "escape" ? { kind: "blur-editor" } : { kind: "ignore" }
}

function focusedCommand(focusedId: string, key: HttpKey): HttpKeyboardCommand | null {
  if (focusedId.startsWith("http-url-input")) return singleLineInputCommand(key, "blur-url")
  if (focusedId.startsWith("http-headers-editor-") || focusedId.startsWith("http-body-editor-")) {
    return editorCommand(key)
  }
  if (focusedId.startsWith("http-key-value-") || focusedId.startsWith("http-auth-")) {
    return singleLineInputCommand(key, "blur-control")
  }
  return null
}

function modifiedCommand(key: HttpKey): HttpKeyboardCommand | null {
  if (key.ctrl && key.name === "n") return { kind: "add-document" }
  if (key.ctrl && key.name === "w") return { kind: "close-document" }
  if (key.ctrl && key.name === "s") return { kind: "save-document" }
  if (key.ctrl && key.name === "o") return { kind: "open-overlay", overlay: "jump" }
  if (key.ctrl && (key.name === "up" || key.name === "down")) {
    return { kind: "resize-split", direction: key.name === "up" ? 1 : -1 }
  }
  if (key.option && (key.name === "left" || key.name === "right")) {
    return { kind: "cycle-document", direction: key.name === "left" ? -1 : 1 }
  }
  return null
}

function unfocusedCommand({
  key,
  navigationOpen,
  running,
  minimum,
}: {
  key: HttpKey
  navigationOpen: boolean
  running: boolean
  minimum: boolean
}): HttpKeyboardCommand {
  if (navigationOpen && key.name === "escape") return { kind: "close-navigation" }
  const modified = modifiedCommand(key)
  if (modified) return modified

  const requestView = REQUEST_VIEWS[key.name]
  if (requestView) return { kind: "request-view", view: requestView }
  return primaryShortcutCommand(key, running, minimum)
}

function primaryShortcutCommand(
  key: HttpKey,
  running: boolean,
  minimum: boolean,
): HttpKeyboardCommand {
  const direct = DIRECT_COMMANDS[key.name]
  if (direct) return direct
  if (key.name === "s") return { kind: "send" }
  if (key.name === "x") return running ? { kind: "cancel" } : { kind: "none" }
  if (key.name === "m") return { kind: "cycle-method", direction: key.shift ? -1 : 1 }
  if (key.name === "c" || key.name === "y") {
    return { kind: "navigation", view: key.name === "c" ? "collection" : "history" }
  }
  if (minimum && (key.name === "1" || key.name === "2")) {
    return { kind: "pane", pane: key.name === "1" ? "request" : "response" }
  }
  return { kind: "none" }
}

export function resolveHttpKeyboardCommand({
  key,
  focusedId,
  navigationOpen,
  running,
  minimum,
  overlay = null,
}: {
  key: HttpKey
  focusedId: string
  navigationOpen: boolean
  running: boolean
  minimum: boolean
  overlay?: HttpWorkspaceOverlay
}): HttpKeyboardCommand {
  return (
    overlayCommand(overlay, key) ??
    focusedCommand(focusedId, key) ??
    unfocusedCommand({ key, navigationOpen, running, minimum })
  )
}
