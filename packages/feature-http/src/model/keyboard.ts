import type {
  HttpJumpTarget,
  HttpPane,
  HttpRequestMoreView,
  HttpRequestView,
  HttpResponseMoreView,
  HttpResponseView,
  HttpWorkspaceOverlay,
} from "./types"
import {
  contextualNavigationCommand,
  contextualRequestCommand,
  contextualResponseCommand,
} from "./keyboard-context"
import type { HttpKey, HttpKeyboardCommand } from "./keyboard-types"
import { resolveSpecialHttpOverlayCommand } from "./overlay-keyboard"
import { httpJsonTreeActionForKey } from "./json-tree"
import { httpPaneCycleDirection } from "./pane-navigation"
import { cycledHttpRequestView } from "./request-view-navigation"
import { httpKeyValueTextInputOwnsKeyboard } from "./key-value"

export type { HttpKey, HttpKeyboardCommand } from "./keyboard-types"

const JUMP_TARGETS: Partial<Record<string, HttpJumpTarget>> = {
  u: "url",
  r: "response",
  c: "collection",
  y: "history",
}
const DIRECT_COMMANDS: Partial<Record<string, HttpKeyboardCommand>> = {
  "/": { kind: "focus-url" },
  e: { kind: "open-environment-manager" },
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

function focusedCommand(
  focusedId: string,
  key: HttpKey,
  responseJsonTree: boolean,
): HttpKeyboardCommand | null {
  if (focusedId === "http-collection-name-input") return { kind: "ignore" }
  if (key.name === "tab") return { kind: "cycle-pane", direction: key.shift ? -1 : 1 }
  if (
    responseJsonTree &&
    focusedId.startsWith("http-response-scroll-") &&
    httpJsonTreeActionForKey(key.name)
  ) {
    return { kind: "ignore" }
  }
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
    httpKeyValueTextInputOwnsKeyboard(focusedId) ||
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

function unfocusedCommand({
  key,
  navigationOpen,
  running,
  minimum,
  activePane,
  navigationView,
  requestView,
  requestMoreView,
  responseView,
  responseMoreView,
  responseJsonTree,
}: {
  key: HttpKey
  navigationOpen: boolean
  running: boolean
  minimum: boolean
  activePane: HttpPane
  navigationView: "collection" | "history"
  requestView: HttpRequestView
  requestMoreView: HttpRequestMoreView
  responseView: HttpResponseView
  responseMoreView: HttpResponseMoreView
  responseJsonTree: boolean
}): HttpKeyboardCommand {
  if (navigationOpen && key.name === "escape") return { kind: "close-navigation" }
  const modified = modifiedCommand(key)
  if (modified) return modified
  const responseCommand = contextualResponseCommand(
    key,
    activePane,
    responseView,
    responseMoreView,
    responseJsonTree,
  )
  if (responseCommand) return responseCommand
  const paneDirection = httpPaneCycleDirection(key, responseJsonTree)
  if (paneDirection) return { kind: "cycle-pane", direction: paneDirection }
  const cycledView = activePane === "request" ? cycledHttpRequestView(requestView, key) : null
  if (cycledView) return { kind: "request-view", view: cycledView }
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
  responseView = "pretty",
  responseMoreView = "summary",
  responseJsonTree = false,
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
  responseView?: HttpResponseView
  responseMoreView?: HttpResponseMoreView
  responseJsonTree?: boolean
}): HttpKeyboardCommand {
  return (
    overlayCommand(overlay, key, focusedId) ??
    focusedCommand(focusedId, key, responseJsonTree) ??
    unfocusedCommand({
      key,
      navigationOpen,
      running,
      minimum,
      activePane,
      navigationView,
      requestView,
      requestMoreView,
      responseView,
      responseMoreView,
      responseJsonTree,
    })
  )
}
