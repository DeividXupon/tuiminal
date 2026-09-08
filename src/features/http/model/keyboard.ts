import type {
  HttpJumpTarget,
  HttpPane,
  HttpRequestMoreView,
  HttpRequestView,
  HttpWorkspaceOverlay,
} from "./types"
import { resolveSpecialHttpOverlayCommand } from "./overlay-keyboard"

export function isHttpRequestJumpTarget(
  target: HttpJumpTarget,
): target is "params" | "headers" | "body" | "auth" {
  return target === "params" || target === "headers" || target === "body" || target === "auth"
}

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
        | "open-environment-manager"
        | "open-response-search"
        | "open-response"
        | "focus-collection-search"
        | "blur-navigation-control"
        | "duplicate-document"
        | "toggle-import-format"
        | "back-import-preview"
        | "cycle-runner-target"
        | "cycle-runner-concurrency"
        | "approve-runner-insecure-tls"
        | "add-automation-row"
        | "cycle-request-timeout"
        | "toggle-request-redirects"
        | "toggle-request-cookie-jar"
        | "toggle-request-tls-verification"
        | "toggle-request-no-log"
    }
  | {
      kind: "resolve-external-conflict"
      resolution: "reload" | "apply-local" | "save-copy"
    }
  | { kind: "toggle-maximize" }
  | { kind: "open-overlay"; overlay: Exclude<HttpWorkspaceOverlay, null> }
  | { kind: "close-overlay" }
  | { kind: "apply-overlay" }
  | { kind: "close-response-control"; control: "search" | "jsonpath" }
  | { kind: "jump"; target: HttpJumpTarget }
  | { kind: "resize-split"; direction: -1 | 1 }
  | { kind: "cycle-document" | "cycle-method"; direction: -1 | 1 }
  | { kind: "focus-url" }
  | { kind: "request-view"; view: HttpRequestView }
  | { kind: "request-more-view"; view: HttpRequestMoreView }
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
  e: { kind: "open-environment-manager" },
  v: { kind: "cycle-response" },
  f10: { kind: "toggle-maximize" },
  f1: { kind: "open-overlay", overlay: "help" },
  "?": { kind: "open-overlay", overlay: "help" },
}

const CTRL_COMMANDS: Partial<Record<string, HttpKeyboardCommand>> = {
  n: { kind: "add-document" },
  w: { kind: "close-document" },
  s: { kind: "save-document" },
  o: { kind: "open-overlay", overlay: "jump" },
  m: { kind: "open-overlay", overlay: "request-move" },
  delete: { kind: "open-overlay", overlay: "request-delete" },
}

function requestFileOverlayCommand(
  overlay: "request-move" | "request-delete",
  key: HttpKey,
  focusedId: string,
): HttpKeyboardCommand | null {
  if (overlay === "request-delete") {
    return key.name === "d" ? { kind: "apply-overlay" } : null
  }
  const apply = key.ctrl && (key.name === "enter" || key.name === "return")
  if (apply) return { kind: "apply-overlay" }
  if (focusedId === "http-request-move-input") {
    return key.name === "escape" ? { kind: "blur-editor" } : { kind: "ignore" }
  }
  return null
}

function standardOverlayCommand(
  overlay: Exclude<HttpWorkspaceOverlay, null>,
  key: HttpKey,
  focusedId: string,
): HttpKeyboardCommand {
  if (overlay === "discard-document" && key.name === "d") return { kind: "apply-overlay" }
  if (overlay === "curl-import" && focusedId === "http-curl-import-editor") {
    if (key.ctrl && (key.name === "enter" || key.name === "return")) {
      return { kind: "apply-overlay" }
    }
    if (key.name === "escape") return { kind: "blur-editor" }
    return { kind: "ignore" }
  }
  if (overlay === "request-move" || overlay === "request-delete") {
    const command = requestFileOverlayCommand(overlay, key, focusedId)
    if (command) return command
  }
  if (key.name === "escape" || key.name === "f1" || (key.ctrl && key.name === "o")) {
    return { kind: "close-overlay" }
  }
  if (overlay === "jump") {
    const target = JUMP_TARGETS[key.name]
    if (target) return { kind: "jump", target }
  }
  return { kind: "ignore" }
}

function overlayCommand(
  overlay: HttpWorkspaceOverlay,
  key: HttpKey,
  focusedId: string,
): HttpKeyboardCommand | null {
  if (!overlay) return null
  const special = resolveSpecialHttpOverlayCommand(overlay, key, focusedId)
  if (special) return special
  return standardOverlayCommand(overlay, key, focusedId)
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
  if (focusedId.startsWith("http-response-search-")) {
    return key.name === "escape"
      ? { kind: "close-response-control", control: "search" }
      : { kind: "ignore" }
  }
  if (focusedId === "http-collection-search") {
    return key.name === "escape" ? { kind: "blur-navigation-control" } : { kind: "ignore" }
  }
  if (focusedId.startsWith("http-response-jsonpath-")) {
    return key.name === "escape"
      ? { kind: "close-response-control", control: "jsonpath" }
      : { kind: "ignore" }
  }
  if (focusedId.startsWith("http-url-input")) return singleLineInputCommand(key, "blur-url")
  if (focusedId.startsWith("http-headers-editor-") || focusedId.startsWith("http-body-editor-")) {
    return editorCommand(key)
  }
  if (
    focusedId.startsWith("http-key-value-") ||
    focusedId.startsWith("http-auth-") ||
    focusedId.startsWith("http-automation-") ||
    focusedId.startsWith("http-custom-method-") ||
    focusedId.startsWith("http-request-name-") ||
    focusedId.startsWith("http-request-proxy-")
  ) {
    return singleLineInputCommand(key, "blur-control")
  }
  return null
}

function modifiedCommand(key: HttpKey): HttpKeyboardCommand | null {
  const ctrlCommand = key.ctrl ? CTRL_COMMANDS[key.name] : undefined
  if (ctrlCommand) return ctrlCommand
  if (key.ctrl && (key.name === "up" || key.name === "down")) {
    return { kind: "resize-split", direction: key.name === "up" ? 1 : -1 }
  }
  if (key.option && (key.name === "left" || key.name === "right")) {
    return { kind: "cycle-document", direction: key.name === "left" ? -1 : 1 }
  }
  return null
}

function contextualNavigationCommand(
  key: HttpKey,
  activePane: HttpPane,
  navigationView: "collection" | "history",
): HttpKeyboardCommand | null {
  if (activePane !== "navigation" || navigationView !== "collection") return null
  if (key.name === "f") return { kind: "focus-collection-search" }
  if (key.name === "i") return { kind: "open-overlay", overlay: "collection-import" }
  if (key.name === "r") return { kind: "open-overlay", overlay: "collection-runner" }
  return null
}

function contextualRequestCommand(
  key: HttpKey,
  activePane: HttpPane,
  requestView: HttpRequestView,
  requestMoreView: HttpRequestMoreView,
  running: boolean,
): HttpKeyboardCommand | null {
  if (activePane !== "request" || requestView !== "more") return null
  const moreView = (
    {
      "1": "options",
      "2": "assertions",
      "3": "chaining",
      "4": "preview",
    } as const
  )[key.name]
  if (moreView) return { kind: "request-more-view", view: moreView }
  if (key.name === "n" && ["assertions", "chaining"].includes(requestMoreView)) {
    return { kind: "add-automation-row" }
  }
  if (requestMoreView === "options" && key.name === "t") return { kind: "cycle-request-timeout" }
  if (requestMoreView === "options" && key.name === "r") {
    return { kind: "toggle-request-redirects" }
  }
  if (requestMoreView === "options" && key.name === "l") return { kind: "toggle-request-no-log" }
  if (requestMoreView === "options" && key.name === "c") {
    return { kind: "toggle-request-cookie-jar" }
  }
  if (requestMoreView === "options" && key.name === "v") {
    return { kind: "toggle-request-tls-verification" }
  }
  if (key.name === "i") return { kind: "open-overlay", overlay: "curl-import" }
  if (key.name === "x" && !running) return { kind: "open-overlay", overlay: "curl-export" }
  return key.name === "d" && requestMoreView === "options" ? { kind: "duplicate-document" } : null
}

function unfocusedCommand({
  key,
  navigationOpen,
  running,
  minimum,
  activePane,
  navigationView,
  requestView,
  requestMoreView,
}: {
  key: HttpKey
  navigationOpen: boolean
  running: boolean
  minimum: boolean
  activePane: HttpPane
  navigationView: "collection" | "history"
  requestView: HttpRequestView
  requestMoreView: HttpRequestMoreView
}): HttpKeyboardCommand {
  if (navigationOpen && key.name === "escape") return { kind: "close-navigation" }
  const modified = modifiedCommand(key)
  if (modified) return modified
  if (activePane === "response" && key.ctrl && key.name === "f") {
    return { kind: "open-response-search" }
  }
  if (activePane === "response" && key.name === "o") return { kind: "open-response" }
  const navigationCommand = contextualNavigationCommand(key, activePane, navigationView)
  if (navigationCommand) return navigationCommand
  const requestCommand = contextualRequestCommand(
    key,
    activePane,
    requestView,
    requestMoreView,
    running,
  )
  if (requestCommand) return requestCommand

  const requestedView = REQUEST_VIEWS[key.name]
  if (requestedView) return { kind: "request-view", view: requestedView }
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
  activePane = "request",
  overlay = null,
  navigationView = "collection",
  requestView = "params",
  requestMoreView = "options",
}: {
  key: HttpKey
  focusedId: string
  navigationOpen: boolean
  running: boolean
  minimum: boolean
  activePane?: HttpPane
  overlay?: HttpWorkspaceOverlay
  navigationView?: "collection" | "history"
  requestView?: HttpRequestView
  requestMoreView?: HttpRequestMoreView
}): HttpKeyboardCommand {
  return (
    overlayCommand(overlay, key, focusedId) ??
    focusedCommand(focusedId, key) ??
    unfocusedCommand({
      key,
      navigationOpen,
      running,
      minimum,
      activePane,
      navigationView,
      requestView,
      requestMoreView,
    })
  )
}
