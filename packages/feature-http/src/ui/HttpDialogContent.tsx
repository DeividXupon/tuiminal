import type { BoxRenderable, ScrollBoxRenderable } from "@opentui/core"
import { useRenderer } from "@opentui/react"
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react"

/** Measure the natural body, then let Yoga shrink its viewport before the fixed footer. */
export function HttpDialogContent({
  id,
  fitContent,
  height,
  children,
}: {
  id: string
  fitContent: boolean
  height: number
  children: ReactNode
}) {
  const renderer = useRenderer()
  const scroll = useRef<ScrollBoxRenderable | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [contentHeight, setContentHeight] = useState(1)
  const measure = useCallback(function (this: BoxRenderable) {
    setContentHeight(this.height)
  }, [])
  const reveal = useCallback(() => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const focused = renderer.currentFocusedRenderable
      if (focused) scroll.current?.scrollChildIntoView(focused.id)
    }, 0)
  }, [renderer])
  useEffect(() => {
    renderer.on("focused_renderable", reveal)
    reveal()
    return () => {
      clearTimeout(timer.current)
      renderer.off("focused_renderable", reveal)
    }
  }, [renderer, reveal])
  return (
    <scrollbox
      id={`${id}-content`}
      ref={scroll}
      scrollY
      onSizeChange={reveal}
      contentOptions={{ minHeight: 0 }}
      style={{
        height: fitContent ? Math.min(contentHeight, height) : height,
        flexGrow: fitContent ? 0 : 1,
        flexShrink: 1,
        minHeight: 0,
      }}
    >
      <box onSizeChange={measure} style={{ flexShrink: 0 }}>
        {children}
      </box>
    </scrollbox>
  )
}
