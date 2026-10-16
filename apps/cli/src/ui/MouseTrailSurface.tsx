import { type OptimizedBuffer, RGBA, type StdinEvent, StdinParser } from "@opentui/core"
import { useRenderer } from "@opentui/react"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { type ComponentType, createElement, type ReactNode, useEffect } from "react"
import { MouseTrail } from "./mouse-trail"
import { type MousePoint, paintMouseBlock, paintMouseTrail } from "./mouse-trail-paint"

export function MouseTrailSurface({ children }: { children: ReactNode }) {
  const renderer = useRenderer()

  useEffect(() => {
    const trail = new MouseTrail()
    let pointer: MousePoint | null = null
    let live = false
    let colorHex = COLORS.muted
    let color = RGBA.fromHex(colorHex)
    let pointerHex = COLORS.text
    let pointerColor = RGBA.fromHex(pointerHex)
    let width = renderer.width
    let height = renderer.height

    function stop() {
      if (!live) return
      live = false
      renderer.dropLive()
    }

    function clear() {
      const wasVisible = live || pointer !== null
      trail.clear()
      pointer = null
      stop()
      if (wasVisible && !renderer.isDestroyed) renderer.requestRender()
    }

    function paint(buffer: OptimizedBuffer) {
      // Observe resize in the existing paint pass without another global listener.
      if (buffer.width !== width || buffer.height !== height) {
        width = buffer.width
        height = buffer.height
        clear()
        return
      }
      if (!trail.active && !pointer) return
      const cells = trail.frame(performance.now())
      if (colorHex !== COLORS.muted) {
        colorHex = COLORS.muted
        color = RGBA.fromHex(colorHex)
      }
      paintMouseTrail(buffer, cells, color)
      if (pointerHex !== COLORS.text) {
        pointerHex = COLORS.text
        pointerColor = RGBA.fromHex(pointerHex)
      }
      if (pointer) paintMouseBlock(buffer, pointer, pointerColor)
      if (!trail.active) stop()
    }

    function movePointer({ x, y }: MousePoint) {
      if (x < 0 || y < 0 || x >= renderer.width || y >= renderer.height) {
        clear()
        return
      }
      const moved = pointer?.x !== x || pointer?.y !== y
      pointer = { x, y }
      trail.move(x, y, performance.now())
      if (trail.active && !live) {
        live = true
        renderer.requestLive()
      }
      if (moved) renderer.requestRender()
    }

    function observe(event: StdinEvent) {
      if (event.type === "key" || event.type === "paste") {
        clear()
        return
      }
      if (event.type !== "mouse") return
      if (!renderer.useMouse || renderer.currentControlState === "explicit_suspended") return
      movePointer(event.event)
    }

    // Observe the native stream without consuming it: buttons and embedded terminals
    // can stop bubbling, and notifications live outside this component's subtree.
    // The native parser handles fragmented packets and ignores mouse-like pasted text.
    const parser = new StdinParser({ onTimeoutFlush: () => parser.drain(observe) })
    function onData(data: Uint8Array | string) {
      parser.push(typeof data === "string" ? Buffer.from(data) : data)
      parser.drain(observe)
    }

    renderer.stdin.on("data", onData)
    renderer.addPostProcessFn(paint)
    renderer.on("blur", clear)
    return () => {
      renderer.stdin.off("data", onData)
      parser.destroy()
      renderer.removePostProcessFn(paint)
      renderer.off("blur", clear)
      clear()
    }
  }, [renderer])

  return <box style={{ flexGrow: 1 }}>{children}</box>
}

export function withMouseTrail(Component: ComponentType) {
  return function MouseTrailApplication() {
    return <MouseTrailSurface>{createElement(Component)}</MouseTrailSurface>
  }
}
