import { HTTP_DOCUMENT_LIMIT } from "./workspace"

// OpenTUI registers one renderer `selection` listener for every mounted scrollbox.
// HTTP intentionally retains up to six document editor trees, plus shared chrome and overlays.
export const HTTP_RENDERER_LISTENER_BUDGET = HTTP_DOCUMENT_LIMIT * 8 + 16

export function ensureHttpRendererListenerBudget(renderer: {
  getMaxListeners: () => number
  setMaxListeners: (maxListeners: number) => unknown
}) {
  if (renderer.getMaxListeners() < HTTP_RENDERER_LISTENER_BUDGET) {
    renderer.setMaxListeners(HTTP_RENDERER_LISTENER_BUDGET)
  }
}
