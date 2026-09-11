import { directionalShortcutDirection } from "../../../shared/ui/directional-shortcut"
import { httpBodyKindCycleDirection } from "./body-kind-navigation"
import type { HttpKey, HttpKeyboardCommand } from "./keyboard-types"
import { httpJsonTreeActionForKey } from "./json-tree"
import {
  nestedHttpViewCycleDirection,
  nextHttpRequestMoreView,
  nextHttpResponseMoreView,
} from "./nested-view-navigation"
import type {
  HttpPane,
  HttpRequestMoreView,
  HttpRequestView,
  HttpResponseMoreView,
  HttpResponseView,
} from "./types"

export function contextualNavigationCommand(
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

function nestedRequestCommand(key: HttpKey, requestView: HttpRequestView) {
  if (requestView === "body") {
    const direction = httpBodyKindCycleDirection(key)
    return direction ? ({ kind: "cycle-body-kind", direction } as const) : null
  }
  if (requestView === "auth") {
    const direction = nestedHttpViewCycleDirection(key)
    return direction ? ({ kind: "cycle-auth-kind", direction } as const) : null
  }
  return null
}

function requestMoreCommand(
  key: HttpKey,
  requestMoreView: HttpRequestMoreView,
  running: boolean,
): HttpKeyboardCommand | null {
  const direction = nestedHttpViewCycleDirection(key)
  if (direction) {
    return {
      kind: "request-more-view",
      view: nextHttpRequestMoreView(requestMoreView, direction),
    }
  }
  if (key.name === "n" && ["assertions", "chaining"].includes(requestMoreView)) {
    return { kind: "add-automation-row" }
  }
  if (requestMoreView === "options" && key.name === "t") return { kind: "cycle-request-timeout" }
  if (requestMoreView === "options" && key.name === "r") {
    return { kind: "toggle-request-redirects" }
  }
  if (requestMoreView === "options" && key.shift && key.name === "l") {
    return { kind: "toggle-request-no-log" }
  }
  if (requestMoreView === "options" && key.name === "c") {
    return { kind: "toggle-request-cookie-jar" }
  }
  if (requestMoreView === "options" && key.shift && key.name === "v") {
    return { kind: "toggle-request-tls-verification" }
  }
  if (key.name === "i") return { kind: "open-overlay", overlay: "curl-import" }
  if (key.name === "x" && !running) return { kind: "open-overlay", overlay: "curl-export" }
  return key.name === "d" && requestMoreView === "options" ? { kind: "duplicate-document" } : null
}

export function contextualRequestCommand(
  key: HttpKey,
  activePane: HttpPane,
  requestView: HttpRequestView,
  requestMoreView: HttpRequestMoreView,
  running: boolean,
): HttpKeyboardCommand | null {
  if (activePane !== "request") return null
  const nested = nestedRequestCommand(key, requestView)
  if (nested) return nested
  return requestView === "more" ? requestMoreCommand(key, requestMoreView, running) : null
}

export function contextualResponseCommand(
  key: HttpKey,
  activePane: HttpPane,
  responseView: HttpResponseView,
  responseMoreView: HttpResponseMoreView,
  responseJsonTree: boolean,
): HttpKeyboardCommand | null {
  if (activePane !== "response") return null
  if (key.ctrl && key.name === "f") return { kind: "open-response-search" }
  if (key.name === "o") return { kind: "open-response" }
  if (responseView === "more") {
    const direction = nestedHttpViewCycleDirection(key)
    if (direction) {
      return {
        kind: "response-more-view",
        view: nextHttpResponseMoreView(responseMoreView, direction),
      }
    }
  }
  const direction = directionalShortcutDirection(key)
  if (direction) return { kind: "cycle-response", direction }
  const action = responseJsonTree ? httpJsonTreeActionForKey(key.name) : null
  return action ? { kind: "response-json", action } : null
}
