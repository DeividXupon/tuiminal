import { isActionPaletteKey } from "@xupon/tuiminal-core/ui/action-palette"
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
  e: "environments",
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

function documentShortcut(key: HttpKey): HttpKeyboardCommand | null {
  if (key.ctrl || key.meta || key.option) return null
  if (key.name === "x") return { kind: "close-document" }
  if (key.name === "w") return { kind: "open-overlay", overlay: "curl-export" }
  return null
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
  if (key.ctrl && key.name === "p") return { kind: "push-postman-document" }
  if (key.ctrl && key.name === "s") return { kind: "save-document" }
  return key.name === "escape" ? { kind: blurKind } : { kind: "ignore" }
}

function editorCommand(key: HttpKey): HttpKeyboardCommand {
  if (key.ctrl && key.name === "p") return { kind: "push-postman-document" }
  if (key.ctrl && key.name === "s") return { kind: "save-document" }
  if (key.ctrl && (key.name === "enter" || key.name === "return")) return { kind: "send" }
  return key.name === "escape" ? { kind: "blur-editor" } : { kind: "ignore" }
}

function requestControlCommand(focusedId: string, key: HttpKey): HttpKeyboardCommand | null {
  if (focusedId.startsWith("http-script-editor-"))
    return key.name === "escape" ? { kind: "ignore" } : editorCommand(key)
  if (focusedId.startsWith("http-docs-editor-")) {
    return key.name === "escape" ? { kind: "ignore" } : singleLineInputCommand(key, "blur-control")
  }
  if (focusedId.startsWith("http-body-editor-")) return editorCommand(key)
  if (!focusedId.startsWith("http-body-file-")) return null
  const command = editorCommand(key)
  if (command.kind !== "ignore") return command
  return ["tab", "enter", "return", "backspace"].includes(key.name) ? command : null
}

function scopedControlCommand(focusedId: string, key: HttpKey): HttpKeyboardCommand | null {
  if (focusedId.startsWith("http-environment-menu")) return { kind: "ignore" }
  if (/^http-collection-(menu|action-|name-input)/.test(focusedId)) return { kind: "ignore" }
  if (environmentOwnsKey(focusedId, key)) return { kind: "ignore" }
  if (/^http-environment-/.test(focusedId)) {
    if (key.ctrl && key.name === "s") return { kind: "save-document" }
    if (key.ctrl && key.name === "w") return { kind: "close-document" }
    if ((key.meta || key.option) && ["left", "right"].includes(key.name))
      return { kind: "cycle-document", direction: key.name === "left" ? -1 : 1 }
    if (/^http-environment-(cell-|name$)/.test(focusedId)) return { kind: "ignore" }
  }
  return null
}

function environmentOwnsKey(focusedId: string, key: HttpKey) {
  if (key.ctrl || key.meta || key.option) return false
  const pane =
    /^http-environment-(cell-|name$|pane$|save$|activate$|delete$|retry$|row-delete-)/.test(
      focusedId,
    )
  const list =
    /^http-(environment-(entry-|actions-|new$|refresh$|none$)|navigation-environments$)/.test(
      focusedId,
    )
  if (key.name === "escape") return pane
  return (
    (pane || list) &&
    [
      "tab",
      "enter",
      "return",
      "up",
      "down",
      "left",
      "right",
      "h",
      "j",
      "k",
      "l",
      "n",
      "r",
      "home",
      "end",
      "delete",
    ].includes(key.name)
  )
}

function focusedCommand(
  focusedId: string,
  key: HttpKey,
  responseJsonTree: boolean,
): HttpKeyboardCommand | null {
  const environment = scopedControlCommand(focusedId, key)
  if (environment) return environment
  if (
    /^(http-auth-(token|username|password|key-name|key-value|oauth2-field)-|http-automation-|http-custom-method-|http-request-(name|proxy)-)/.test(
      focusedId,
    )
  ) {
    return singleLineInputCommand(key, "blur-control")
  }
  const controlCommand = requestControlCommand(focusedId, key)
  if (controlCommand) return controlCommand
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
  if (focusedId.startsWith("http-headers-editor-")) {
    return editorCommand(key)
  }
  if (httpKeyValueTextInputOwnsKeyboard(focusedId))
    return singleLineInputCommand(key, "blur-control")
  return null
}

function modifiedCommand(key: HttpKey): HttpKeyboardCommand | null {
  if (key.ctrl && key.name === "p") return { kind: "push-postman-document" }
  const ctrlCommand = key.ctrl ? CTRL_COMMANDS[key.name] : undefined
  if (ctrlCommand) return ctrlCommand
  if (!key.ctrl && !key.meta && !key.option && ["+", "-"].includes(key.name)) {
    return { kind: "resize-split", direction: key.name === "+" ? 1 : -1 }
  }
  if ((key.option || key.meta) && (key.name === "left" || key.name === "right")) {
    return { kind: "cycle-document", direction: key.name === "left" ? -1 : 1 }
  }
  return null
}

function unfocusedCommand({
  key,
  navigationOpen,
  running,
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
  navigationView: "collection" | "environments"
  requestView: HttpRequestView
  requestMoreView: HttpRequestMoreView
  responseView: HttpResponseView
  responseMoreView: HttpResponseMoreView
  responseJsonTree: boolean
}): HttpKeyboardCommand {
  if (navigationOpen && key.name === "escape") return { kind: "close-navigation" }
  if (key.name === "escape" && running) return { kind: "cancel" }
  const modified = documentShortcut(key) ?? modifiedCommand(key)
  if (modified) return modified
  if (key.name === "r" && !key.ctrl && !key.meta && !key.option)
    return { kind: "pane", pane: key.shift ? "response" : "request" }
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
  const requestCommand = contextualRequestCommand(key, activePane, requestView, requestMoreView)
  if (requestCommand) return requestCommand

  return primaryShortcutCommand(key)
}

function primaryShortcutCommand(key: HttpKey): HttpKeyboardCommand {
  if (isActionPaletteKey(key)) return { kind: "open-overlay", overlay: "help" }
  const direct = DIRECT_COMMANDS[key.name]
  if (direct) return direct
  if (key.name === "s") return { kind: "send" }
  if (key.name === "m" && !key.ctrl && !key.meta && !key.option) {
    return key.shift ? { kind: "cycle-method", direction: 1 } : { kind: "choose-box" }
  }
  if (key.name === "c" || key.name === "e") {
    return { kind: "navigation", view: key.name === "c" ? "collection" : "environments" }
  }
  if (!key.ctrl && !key.meta && !key.option && !key.shift && /^[1-9]$/.test(key.name)) {
    return { kind: "select-document", index: Number(key.name) - 1 }
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
  navigationView?: "collection" | "environments"
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
