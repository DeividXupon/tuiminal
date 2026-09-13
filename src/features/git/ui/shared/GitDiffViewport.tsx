import { RenderableEvents, type ScrollBoxRenderable } from "@opentui/core"
import { useRenderer } from "@opentui/react"
import { type ReactNode, type Ref, useCallback, useEffect, useRef } from "react"
import { COLORS } from "../../../../core/settings/theme"
import { translateUi } from "../../../../shared/i18n"
import { InlineButton } from "../../../../shared/ui/InlineButton"
import { scrollGitDiffHorizontally, setGitDiffHorizontalOffset } from "../../rendering/diff-scroll"

export function GitDiffViewport({
  id,
  scrollRef,
  focused,
  onFocus,
  resetKey,
  children,
}: {
  id: string
  scrollRef: Ref<ScrollBoxRenderable>
  focused?: boolean
  onFocus?: () => void
  resetKey?: string
  children: ReactNode
}) {
  const renderer = useRenderer()
  const root = useRef<ScrollBoxRenderable | null>(null)
  const cleanup = useRef<(() => void) | null>(null)
  const reset = useCallback(() => setGitDiffHorizontalOffset(root.current, 0), [])
  const checkBlur = useCallback(() => {
    const blurred = root.current
    // Controls belong to the diff; focus in another pane resets its position.
    queueMicrotask(() => {
      if (root.current !== blurred) return
      let current = renderer.currentFocusedRenderable
      while (current) {
        if (current.id === `${id}-viewport`) return
        current = current.parent
      }
      reset()
    })
  }, [id, renderer, reset])
  const attach = useCallback(
    (next: ScrollBoxRenderable | null) => {
      cleanup.current?.()
      cleanup.current = null
      root.current = next
      if (typeof scrollRef === "function") scrollRef(next)
      else if (scrollRef) scrollRef.current = next
      if (!next) return
      next.on(RenderableEvents.BLURRED, checkBlur)
      cleanup.current = () => {
        next.off(RenderableEvents.BLURRED, checkBlur)
      }
    },
    [checkBlur, scrollRef],
  )
  useEffect(() => {
    if (focused === false) reset()
  }, [focused, reset])
  // A different document/layout starts at the left; background refreshes keep position.
  useEffect(() => {
    if (resetKey !== undefined) reset()
  }, [reset, resetKey])
  const move = (delta: number) => {
    scrollGitDiffHorizontally(root.current, delta)
    onFocus?.()
    root.current?.focus()
  }
  return (
    <box id={`${id}-viewport`} style={{ flexGrow: 1, minHeight: 0, minWidth: 0, width: "100%" }}>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: native TUI scroll surface. */}
      <scrollbox
        ref={attach}
        id={id}
        focusable
        scrollY
        scrollX={false}
        viewportCulling
        onMouseDown={() => {
          onFocus?.()
          root.current?.focus()
        }}
        onMouseScroll={(event) => {
          const direction = event.scroll?.direction
          if (direction !== "left" && direction !== "right") return
          scrollGitDiffHorizontally(
            root.current,
            (direction === "left" ? -1 : 1) * Math.max(1, event.scroll?.delta ?? 1),
          )
          event.preventDefault()
          event.stopPropagation()
        }}
        style={{ flexGrow: 1, flexShrink: 1, minHeight: 0, width: "100%" }}
        verticalScrollbarOptions={{
          trackOptions: { backgroundColor: COLORS.panel, foregroundColor: COLORS.border },
        }}
      >
        {children}
      </scrollbox>
      <box
        id={`${id}-scroll-controls`}
        style={{
          height: 1,
          flexShrink: 0,
          flexDirection: "row",
          justifyContent: "flex-end",
          overflow: "hidden",
          backgroundColor: COLORS.panel,
        }}
      >
        <InlineButton id={`${id}-scroll-left`} label="[Shift+H/←] −" onPress={() => move(-8)} />
        <text content={`${translateUi("Rolagem")} ↔ `} style={{ fg: COLORS.muted }} />
        <InlineButton id={`${id}-scroll-right`} label="[Shift+L/→] +" onPress={() => move(8)} />
      </box>
    </box>
  )
}
