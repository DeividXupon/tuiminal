import { RGBA, type BoxRenderable } from "@opentui/core"
import { createPortal, useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { useEffect, useRef, useState } from "react"
import { translateUi, truncateDisplay } from "../i18n/index"
import { COLORS } from "../settings/theme"
import { InlineButton } from "../ui/InlineButton"
import { blendTextColor } from "../ui/text-shimmer"
import { useWorkspaceRepaint } from "../ui/workspace-repaint"

/** A caller-owned decision: no expiry, outside dismissal, or notification-stack eviction. */
export function ConfirmationNotification({
  id,
  title,
  target,
  message,
  confirmLabel = "[Enter] Confirmar",
  confirmId = `${id}-confirm`,
  cancelId = `${id}-cancel`,
  returnFocusId,
  onConfirm,
  onCancel,
}: {
  id: string
  title: string
  target: string
  message: string
  confirmLabel?: string
  confirmId?: string
  cancelId?: string
  returnFocusId?: string
  onConfirm: () => void | Promise<void>
  onCancel: () => void
}) {
  const renderer = useRenderer()
  const terminal = useTerminalDimensions()
  const ref = useRef<BoxRenderable | null>(null)
  const decided = useRef(false)
  const mounted = useRef(false)
  const [busy, setBusy] = useState(false)
  const [frame, setFrame] = useState(0)
  const [cancelSelected, setCancelSelected] = useState(false)
  const width = Math.max(1, Math.min(64, terminal.width - 2))
  const height = Math.max(1, Math.min(9, terminal.height - 2))
  const glow = blendTextColor(
    RGBA.fromHex(COLORS.warning),
    RGBA.fromHex(COLORS.text),
    (1 - Math.cos((frame / 32) * Math.PI * 2)) * 0.3,
  )
  useWorkspaceRepaint(id)
  useEffect(() => {
    mounted.current = true
    const previous = renderer.currentFocusedRenderable
    ref.current?.focus()
    const animation = setInterval(() => setFrame((value) => (value + 1) % 32), 50)
    return () => {
      mounted.current = false
      clearInterval(animation)
      // Native row destruction can finish after React's effect cleanup.
      queueMicrotask(() => {
        if (renderer.isDestroyed) return
        const focused = renderer.currentFocusedRenderable
        if (focused && ![id, confirmId, cancelId].includes(focused.id)) return
        if (previous && !previous.isDestroyed) previous.focus()
        else if (returnFocusId) renderer.root.findDescendantById(returnFocusId)?.focus()
      })
    }
  }, [cancelId, confirmId, id, renderer, returnFocusId])
  const decide = async (confirm: boolean) => {
    if (decided.current) return
    decided.current = true
    if (!confirm) return onCancel()
    setBusy(true)
    try {
      await onConfirm()
    } finally {
      if (mounted.current) {
        decided.current = false
        setBusy(false)
      }
    }
  }
  useKeyboard((key) => {
    if (key.defaultPrevented) return
    key.preventDefault()
    key.stopPropagation()
    if (key.name === "escape") void decide(false)
    else if (key.name === "return" || key.name === "enter") void decide(!cancelSelected)
    else if (["tab", "left", "right", "h", "l"].includes(key.name))
      setCancelSelected((value) => !value)
  })
  return createPortal(
    // biome-ignore lint/a11y/noStaticElementInteractions: The decision owns keyboard focus and consumes pointer events outside its controls.
    <box
      id={`${id}-layer`}
      position="absolute"
      left={0}
      top={0}
      width="100%"
      height="100%"
      zIndex={1000}
      onMouseDown={(event) => {
        event.preventDefault()
        event.stopPropagation()
        if (event.target?.id === `${id}-layer`) ref.current?.focus()
      }}
    >
      <box
        id={id}
        ref={ref}
        focusable
        position="absolute"
        right={Math.min(1, Math.max(0, terminal.width - width))}
        top={Math.min(1, Math.max(0, terminal.height - height))}
        width={width}
        height={height}
        border
        borderStyle="rounded"
        borderColor={glow}
        backgroundColor={COLORS.panelRaised}
        paddingLeft={1}
        paddingRight={1}
      >
        <text
          content={`◆ ${truncateDisplay(translateUi(title), Math.max(1, width - 6))}`}
          fg={glow}
          height={1}
          flexShrink={0}
        />
        <scrollbox flexGrow={1} minHeight={0} scrollY viewportCulling={false}>
          <text content={target} fg={COLORS.text} wrapMode="word" />
          <text content={translateUi(message)} fg={COLORS.muted} wrapMode="word" />
        </scrollbox>
        <box flexDirection="row" flexWrap="wrap" flexShrink={0}>
          <InlineButton
            id={confirmId}
            label={confirmLabel}
            selected={!cancelSelected}
            accent={COLORS.warning}
            disabled={busy}
            onPress={() => void decide(true)}
          />
          <InlineButton
            id={cancelId}
            label="[Esc] Recusar"
            selected={cancelSelected}
            accent={COLORS.warning}
            disabled={busy}
            onPress={() => void decide(false)}
          />
        </box>
      </box>
    </box>,
    renderer.root,
    null,
    id,
  )
}
