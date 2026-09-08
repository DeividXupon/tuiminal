import type { BoxRenderable } from "@opentui/core"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { Button } from "@tuiparts/react/button"
import { useEffect, useRef } from "react"
import { COLORS } from "../../../../core/settings/theme"
import { translateUi } from "../../../../shared/i18n"
import { InlineButton } from "../../../../shared/ui/InlineButton"
import { ShortcutText } from "../../../../shared/ui/ShortcutText"
import type { InboxNotification } from "../../model/inbox/types"

export type InboxDestructiveAction = "done" | "unsubscribe"

export function InboxActionModal({
  action,
  item,
  busy,
  onClose,
  onConfirm,
}: {
  action: InboxDestructiveAction
  item: InboxNotification
  busy: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  const renderer = useRenderer()
  const terminal = useTerminalDimensions()
  const dialogRef = useRef<BoxRenderable | null>(null)

  useEffect(() => {
    renderer.currentFocusedRenderable?.blur()
    const timer = setTimeout(() => dialogRef.current?.focus(), 0)
    return () => clearTimeout(timer)
  }, [renderer])

  useKeyboard((key) => {
    if (key.name === "escape") {
      key.preventDefault()
      key.stopPropagation()
      onClose()
    } else if (key.ctrl && key.name === "s" && !busy) {
      key.preventDefault()
      key.stopPropagation()
      onConfirm()
    }
  })

  const title = action === "done" ? "◆ CONCLUIR NOTIFICAÇÃO" : "◆ PARAR DE ACOMPANHAR"
  const detail =
    action === "done"
      ? "A notificação será removida da caixa de entrada do GitHub."
      : "O GitHub deixará de enviar atualizações desta conversa."
  return (
    <>
      <Button
        onPress={onClose}
        position="absolute"
        top={0}
        left={0}
        width="100%"
        height="100%"
        zIndex={970}
        backgroundColor="#030509"
        opacity={0.92}
      />
      <box
        position="absolute"
        top={0}
        left={0}
        width="100%"
        height="100%"
        zIndex={971}
        alignItems="center"
        justifyContent="center"
      >
        <box
          ref={dialogRef}
          id="git-inbox-action-modal"
          focusable
          style={{
            width: Math.max(42, Math.min(76, terminal.width - 4)),
            height: 11,
            border: true,
            borderStyle: "rounded",
            borderColor: COLORS.warning,
            backgroundColor: COLORS.canvas,
            paddingLeft: 1,
            paddingRight: 1,
          }}
        >
          <text content={translateUi(title)} style={{ fg: COLORS.warning }} />
          <text content={item.title} style={{ fg: COLORS.text, marginTop: 1 }} />
          <text content={item.repository} style={{ fg: COLORS.muted }} />
          <text content={translateUi(detail)} style={{ fg: COLORS.muted, marginTop: 1 }} />
          <box
            style={{
              height: 1,
              flexShrink: 0,
              flexDirection: "row",
              justifyContent: "space-between",
              marginTop: 1,
            }}
          >
            <ShortcutText content="[Esc] Cancelar" style={{ fg: COLORS.muted }} />
            <InlineButton
              id="git-inbox-confirm-action"
              label={busy ? "[Ctrl+S] Executando…" : "[Ctrl+S] Confirmar"}
              accent={COLORS.warning}
              disabled={busy}
              onPress={onConfirm}
            />
          </box>
        </box>
      </box>
    </>
  )
}
