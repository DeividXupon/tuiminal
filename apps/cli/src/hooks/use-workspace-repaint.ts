import { RGBA } from "@opentui/core"
import { useRenderer } from "@opentui/react"
import { useLayoutEffect } from "react"

const INVALID_FRAME = RGBA.fromValues(0, 0, 0, 0)

/** Repaint once for an explicit workspace transition, never for routine reflow. */
export function useWorkspaceRepaint(transition: string) {
  const renderer = useRenderer()
  // biome-ignore lint/correctness/useExhaustiveDependencies: Each explicit transition requests one repaint.
  useLayoutEffect(() => {
    const invalidate = () => {
      renderer.removePostProcessFn(invalidate)
      // All workspace surfaces are opaque. Invalidate only the comparison buffer;
      // the native renderer publishes the complete new frame in its normal flush.
      // Clearing stdout separately would leave its diff cache out of sync again.
      renderer.currentRenderBuffer.clear(INVALID_FRAME)
    }
    // Run after layout and painting, immediately before the native output flush.
    // Text edits, loading animations and cursor updates also cause layout-changed;
    // subscribing to that event would turn them all into full-screen writes.
    renderer.addPostProcessFn(invalidate)
    renderer.requestRender()
    return () => {
      renderer.removePostProcessFn(invalidate)
    }
  }, [renderer, transition])
}
