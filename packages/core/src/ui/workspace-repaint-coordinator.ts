import { type CliRenderer, RGBA } from "@opentui/core"

const INVALID_FRAME = RGBA.fromValues(0, 0, 0, 0)
const coordinators = new WeakMap<CliRenderer, ReturnType<typeof createCoordinator>>()

function createCoordinator(renderer: CliRenderer) {
  let requested = 0
  let committed = 0
  let prepared = 0
  let repaired = 0
  let preparedFrame = -1
  let listening = false

  function detach() {
    renderer.removePostProcessFn(prepare)
    renderer.off("frame", commit)
    listening = false
  }

  function prepare() {
    prepared = requested
    preparedFrame = renderer.frameId
    repaired = 0
    if (committed !== requested) return
    // Invalidate the comparison cache only, after composition. The normal native
    // flush owns ANSI, cursor state and output ordering, including backpressure.
    renderer.currentRenderBuffer.clear(INVALID_FRAME)
    repaired = prepared
  }

  function commit({ frameId }: { frameId: number }) {
    // Only a successful native frame acknowledges a transition. Failed/skipped
    // attempts cannot consume its recovery; newer requests supersede old ones.
    if (frameId !== preparedFrame || prepared !== requested) return
    if (repaired === requested) {
      detach()
      return
    }
    committed = prepared
    renderer.requestRender()
  }

  function destroy() {
    detach()
    renderer.off("destroy", destroy)
    coordinators.delete(renderer)
  }
  renderer.once("destroy", destroy)

  return {
    request() {
      if (renderer.isDestroyed) return
      requested++
      if (!listening) {
        listening = true
        renderer.addPostProcessFn(prepare)
        renderer.on("frame", commit)
      }
      renderer.requestRender()
    },
  }
}

/** One recovery frame after the latest committed batch of visible transitions. */
export function requestWorkspaceRepaint(renderer: CliRenderer) {
  if (renderer.isDestroyed) return
  let coordinator = coordinators.get(renderer)
  if (!coordinator) {
    coordinator = createCoordinator(renderer)
    coordinators.set(renderer, coordinator)
  }
  coordinator.request()
}
