import { directionalShortcutDirection } from "@xupon/tuiminal-core/ui/directional-shortcut"
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
  navigationView: "collection" | "environments",
): HttpKeyboardCommand | null {
  if (activePane !== "navigation" || navigationView !== "collection") return null
  if (key.name === "f") return { kind: "focus-collection-search" }
  if (!key.ctrl && !key.meta && !key.option && ["i", "r", "o", "n", "p", "d"].includes(key.name))
    return { kind: "ignore" }
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
  if (["options", "docs"].includes(requestMoreView)) return null
  if (key.name === "i") return { kind: "open-overlay", overlay: "curl-import" }
  return null
}

export function contextualRequestCommand(
  key: HttpKey,
  activePane: HttpPane,
  requestView: HttpRequestView,
  requestMoreView: HttpRequestMoreView,
): HttpKeyboardCommand | null {
  if (activePane !== "request") return null
  if (
    !key.ctrl &&
    !key.meta &&
    !key.option &&
    (requestView === "auth" || (requestView === "more" && requestMoreView !== "docs")) &&
    ["enter", "return"].includes(key.name)
  ) {
    return { kind: "focus-request-form" }
  }
  const nested = nestedRequestCommand(key, requestView)
  if (nested) return nested
  return requestView === "more" ? requestMoreCommand(key, requestMoreView) : null
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
