import { expect, mock, test } from "bun:test"
import { EventEmitter } from "node:events"
import type { CliRenderer } from "@opentui/core"
import { requestWorkspaceRepaint } from "../packages/core/src/ui/workspace-repaint-coordinator"

// Protocol-level coverage for frames the native backend does not acknowledge.
// Real native stdout, Unicode and input are covered by the output/TUI suites.
function rendererProtocol() {
  const postprocess = new Set<() => void>()
  const renderer = Object.assign(new EventEmitter(), {
    isDestroyed: false,
    frameId: 0,
    requestRender: mock(() => {}),
    currentRenderBuffer: { clear: mock(() => {}) },
    addPostProcessFn: (callback: () => void) => postprocess.add(callback),
    removePostProcessFn: (callback: () => void) => postprocess.delete(callback),
  })
  return {
    renderer,
    postprocess,
    request: () => requestWorkspaceRepaint(renderer as unknown as CliRenderer),
    prepare() {
      renderer.frameId++
      for (const callback of postprocess) callback()
    },
    acknowledge: () => renderer.emit("frame", { frameId: renderer.frameId }),
    destroy() {
      renderer.isDestroyed = true
      renderer.emit("destroy")
    },
  }
}

test("skipped output cannot consume recovery and a newer transition supersedes pending work", () => {
  const protocol = rendererProtocol()
  const { renderer } = protocol
  try {
    protocol.request()
    protocol.request()
    protocol.prepare()
    // A blocked/skipped native flush emits no frame event.
    protocol.prepare()
    expect(renderer.currentRenderBuffer.clear).not.toHaveBeenCalled()
    protocol.acknowledge()
    protocol.prepare()
    expect(renderer.currentRenderBuffer.clear).toHaveBeenCalledTimes(1)
    // This recovery was also blocked. It remains pending until acknowledged.
    protocol.prepare()
    expect(renderer.currentRenderBuffer.clear).toHaveBeenCalledTimes(2)
    protocol.request()
    protocol.acknowledge()
    expect(protocol.postprocess.size).toBe(1)
    protocol.prepare()
    expect(renderer.currentRenderBuffer.clear).toHaveBeenCalledTimes(2)
    protocol.acknowledge()
    protocol.prepare()
    expect(renderer.currentRenderBuffer.clear).toHaveBeenCalledTimes(3)
    protocol.acknowledge()
    expect(protocol.postprocess.size).toBe(0)
    expect(renderer.listenerCount("frame")).toBe(0)
    protocol.prepare()
    protocol.acknowledge()
    expect(renderer.currentRenderBuffer.clear).toHaveBeenCalledTimes(3)
  } finally {
    protocol.destroy()
  }
})

test("renderers own independent recovery and destruction retires pending work", () => {
  const first = rendererProtocol()
  const second = rendererProtocol()
  try {
    first.request()
    second.request()
    first.prepare()
    first.acknowledge()
    first.prepare()
    first.acknowledge()
    expect(first.renderer.currentRenderBuffer.clear).toHaveBeenCalledTimes(1)
    expect(second.renderer.currentRenderBuffer.clear).not.toHaveBeenCalled()
    expect(second.postprocess.size).toBe(1)
    second.destroy()
    second.request()
    expect(second.postprocess.size).toBe(0)
    expect(second.renderer.listenerCount("frame")).toBe(0)
    expect(second.renderer.listenerCount("destroy")).toBe(0)
    expect(second.renderer.requestRender).toHaveBeenCalledTimes(1)
  } finally {
    first.destroy()
    second.destroy()
  }
})
