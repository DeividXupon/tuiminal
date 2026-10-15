import type { BoxRenderable } from "@opentui/core"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { useEffect, useRef } from "react"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { ModalSurface } from "@xupon/tuiminal-core/ui/ModalSurface"
import { ShortcutText } from "@xupon/tuiminal-core/ui/ShortcutText"
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
    <ModalSurface
      id="git-inbox-action-modal"
      dialogRef={dialogRef}
      width={Math.max(42, Math.min(76, terminal.width - 4))}
      height={11}
      zIndex={970}
      borderColor={COLORS.warning}
      onBackdropPress={onClose}
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
    </ModalSurface>
  )
}
