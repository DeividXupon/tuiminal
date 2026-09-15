import type { HttpRequestView } from "./types"
import { directionalShortcutDirection } from "@xupon/tuiminal-core/ui/directional-shortcut"

const HTTP_REQUEST_VIEWS: readonly HttpRequestView[] = ["params", "headers", "body", "auth", "more"]

export function httpRequestViewCycleDirection(key: {
  name: string
  ctrl?: boolean
  shift?: boolean
  option?: boolean
  meta?: boolean
}): -1 | 1 | null {
  return directionalShortcutDirection(key)
}

export function nextHttpRequestView(current: HttpRequestView, direction: -1 | 1) {
  const index = HTTP_REQUEST_VIEWS.indexOf(current)
  const next = (index + direction + HTTP_REQUEST_VIEWS.length) % HTTP_REQUEST_VIEWS.length
  return HTTP_REQUEST_VIEWS[next] ?? "params"
}

export function cycledHttpRequestView(
  current: HttpRequestView,
  key: { name: string; ctrl?: boolean; shift?: boolean; option?: boolean; meta?: boolean },
) {
  const direction = httpRequestViewCycleDirection(key)
  return direction ? nextHttpRequestView(current, direction) : null
}
