import type { HttpPane, HttpWorkspaceOverlay } from "./types"

const modalContexts: Partial<Record<Exclude<HttpWorkspaceOverlay, null>, string>> = {
  "environment-manager": "environment-manager-modal",
  "collection-runner": "collection-runner-modal",
  "postman-browser": "postman-modal",
}

export function httpShortcutContext(pane: HttpPane, overlay: HttpWorkspaceOverlay) {
  return overlay ? (modalContexts[overlay] ?? `overlay-${overlay}`) : pane
}
