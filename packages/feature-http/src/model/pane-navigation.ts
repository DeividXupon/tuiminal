import type { HttpPane } from "./types"

export const HTTP_PANE_ORDER: readonly HttpPane[] = ["url", "navigation", "request", "response"]

export function nextHttpPane(activePane: HttpPane, direction: -1 | 1) {
  const current = HTTP_PANE_ORDER.indexOf(activePane)
  const next = (current + direction + HTTP_PANE_ORDER.length) % HTTP_PANE_ORDER.length
  return HTTP_PANE_ORDER[next] ?? "url"
}

export function httpPaneCycleDirection(
  key: { name: string; shift?: boolean },
  responseJsonTree: boolean,
): -1 | 1 | null {
  if (key.name === "tab") return key.shift ? -1 : 1
  if (!key.shift && key.name === "h") return -1
  if (!key.shift && key.name === "l") return 1
  if (!responseJsonTree && key.name === "left") return -1
  if (!responseJsonTree && key.name === "right") return 1
  return null
}
