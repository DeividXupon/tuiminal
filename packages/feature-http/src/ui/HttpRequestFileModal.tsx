import type { InputRenderable } from "@opentui/core"
import type { ButtonRenderable } from "@tuiparts/core/button"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { useEffect, useRef } from "react"
import { HttpDialog } from "./HttpDialog"
import { HttpDialogNotice, HttpDialogSection } from "./HttpDialogDetails"

export function HttpRequestFileModal({
  mode,
  requestName,
  currentPath,
  targetPath,
  terminalWidth,
  terminalHeight,
  onTargetPathChange,
  onApply,
  onClose,
}: {
  mode: "request-move" | "request-delete"
  requestName: string
  currentPath: string
  targetPath: string
  terminalWidth: number
  terminalHeight: number
  onTargetPathChange: (path: string) => void
  onApply: () => void
  onClose: () => void
}) {
  const inputRef = useRef<InputRenderable | null>(null)
  const confirmRef = useRef<ButtonRenderable | null>(null)
  const moving = mode === "request-move"
  const width = Math.max(1, Math.min(80, terminalWidth - 2))
  useEffect(() => {
    const timer = setTimeout(() =>
      moving ? inputRef.current?.focus() : confirmRef.current?.focus(),
    )
    return () => clearTimeout(timer)
  }, [moving])

  return (
    <HttpDialog
      fitContent
      scrollContent
      id="http-request-file-modal"
      title={moving ? "MOVER REQUEST" : "EXCLUIR REQUEST"}
      width={width}
      height={terminalHeight - 2}
      terminalWidth={terminalWidth}
      terminalHeight={terminalHeight}
      onClose={onClose}
      accent={moving ? COLORS.http : COLORS.danger}
      actions={[
        moving
          ? {
              id: "http-request-move-apply",
              label: "[Ctrl+Enter] Mover",
              onPress: onApply,
              disabled: !targetPath.trim() || targetPath === currentPath,
            }
          : {
              id: "http-request-delete-confirm",
              label: "[D] Excluir agora",
              buttonRef: confirmRef,
              accent: COLORS.danger,
              onPress: onApply,
            },
      ]}
    >
      <HttpDialogSection title="ARQUIVO ATUAL" accent={moving ? COLORS.http : COLORS.danger}>
        <text content={requestName} wrapMode="word" style={{ fg: COLORS.text, flexShrink: 0 }} />
        <text content={currentPath} wrapMode="word" style={{ fg: COLORS.muted, flexShrink: 0 }} />
      </HttpDialogSection>
      {moving ? (
        <box style={{ flexShrink: 0, marginTop: 1 }}>
          <text
            content={translateUi("ARQUIVO DE DESTINO NA BIBLIOTECA HTTP")}
            style={{ fg: COLORS.muted }}
          />
          <input
            ref={inputRef}
            id="http-request-move-input"
            value={targetPath}
            placeholder="api/users.http"
            onInput={onTargetPathChange}
            onMouseDown={() => inputRef.current?.focus()}
            style={{ backgroundColor: COLORS.canvas, focusedBackgroundColor: COLORS.canvas }}
          />
          <text
            content={translateUi("O request será anexado se o arquivo de destino já existir.")}
            style={{ fg: COLORS.muted }}
          />
        </box>
      ) : (
        <box style={{ flexShrink: 0, marginTop: 1 }}>
          <HttpDialogNotice text="Esta ação remove somente este request; um arquivo vazio também será removido." />
          <HttpDialogNotice text="Alterações não salvas neste request serão perdidas." warning />
        </box>
      )}
    </HttpDialog>
  )
}
