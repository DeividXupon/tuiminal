import type { BoxRenderable } from "@opentui/core"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { Button } from "@tuiparts/react/button"
import { useEffect, useRef } from "react"
import { COLORS } from "../../../../core/settings/theme"
import { translateUi, truncateDisplay } from "../../../../shared/i18n"
import { InlineButton } from "../../../../shared/ui/InlineButton"
import { ShortcutText } from "../../../../shared/ui/ShortcutText"

export function GitDiscardChangesModal({
  target,
  fileCount,
  onClose,
  onConfirm,
}: {
  target: string
  fileCount: number
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
    } else if (key.name === "d") {
      key.preventDefault()
      key.stopPropagation()
      onConfirm()
    }
  })
  const width = Math.max(42, Math.min(76, terminal.width - 4))
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
          id="git-discard-changes-modal"
          focusable
          style={{
            width,
            height: 10,
            border: true,
            borderStyle: "rounded",
            borderColor: COLORS.danger,
            backgroundColor: COLORS.canvas,
            paddingLeft: 1,
            paddingRight: 1,
          }}
        >
          <text
            content={translateUi("◆ DESCARTAR ALTERAÇÕES DO GIT?")}
            style={{ fg: COLORS.danger }}
          />
          <text content={truncateDisplay(target, width - 4)} style={{ fg: COLORS.text }} />
          <text
            content={`${fileCount} ${translateUi(fileCount === 1 ? "arquivo será afetado" : "arquivos serão afetados")}`}
            style={{ fg: COLORS.warning }}
          />
          <text
            content={translateUi(
              "Arquivos rastreados serão restaurados e arquivos novos serão removidos. Esta ação não pode ser desfeita.",
            )}
            style={{ fg: COLORS.muted, marginTop: 1 }}
          />
          <box style={{ flexGrow: 1 }} />
          <box style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <ShortcutText content={translateUi("[Esc] Cancelar")} style={{ fg: COLORS.muted }} />
            <InlineButton
              id="git-confirm-discard"
              label={translateUi("[D] Confirmar descarte")}
              accent={COLORS.danger}
              onPress={onConfirm}
            />
          </box>
        </box>
      </box>
    </>
  )
}
