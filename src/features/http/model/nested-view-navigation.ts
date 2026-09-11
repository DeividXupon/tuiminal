import { directionalShortcutDirection } from "../../../shared/ui/directional-shortcut"
import type { HttpAuth, HttpRequestMoreView, HttpResponseMoreView, HttpResponseView } from "./types"

export const HTTP_AUTH_KINDS: readonly HttpAuth["kind"][] = ["none", "bearer", "basic", "api-key"]
export const HTTP_REQUEST_MORE_VIEWS: readonly HttpRequestMoreView[] = [
  "options",
  "assertions",
  "chaining",
  "preview",
]
export const HTTP_RESPONSE_VIEWS: readonly HttpResponseView[] = [
  "pretty",
  "raw",
  "headers",
  "timing",
  "more",
]
export const HTTP_RESPONSE_MORE_VIEWS: readonly HttpResponseMoreView[] = [
  "summary",
  "cookies",
  "redirects",
  "assertions",
  "console",
]

function nextItem<Item>(items: readonly Item[], current: Item, direction: -1 | 1): Item {
  const index = items.indexOf(current)
  return items[(index + direction + items.length) % items.length] ?? items[0]!
}

export function nestedHttpViewCycleDirection(key: {
  name: string
  ctrl?: boolean
  shift?: boolean
  option?: boolean
  meta?: boolean
}) {
  return directionalShortcutDirection(key, "nested")
}

export function nextHttpAuthKind(current: HttpAuth["kind"], direction: -1 | 1) {
  return nextItem(HTTP_AUTH_KINDS, current, direction)
}

export function httpAuthForKind(kind: HttpAuth["kind"]): HttpAuth {
  if (kind === "bearer") return { kind, token: "" }
  if (kind === "basic") return { kind, username: "", password: "" }
  if (kind === "api-key") {
    return { kind, placement: "header", name: "X-API-Key", value: "" }
  }
  return { kind: "none" }
}

export function nextHttpRequestMoreView(current: HttpRequestMoreView, direction: -1 | 1) {
  return nextItem(HTTP_REQUEST_MORE_VIEWS, current, direction)
}

export function nextHttpResponseView(current: HttpResponseView, direction: -1 | 1) {
  return nextItem(HTTP_RESPONSE_VIEWS, current, direction)
}

export function nextHttpResponseMoreView(current: HttpResponseMoreView, direction: -1 | 1) {
  return nextItem(HTTP_RESPONSE_MORE_VIEWS, current, direction)
}
