import type { InputRenderable } from "@opentui/core"
import type { ButtonRenderable } from "@tuiparts/core/button"
import { useEffect, useRef } from "react"
import { COLORS, panelBorder } from "../../../core/settings/theme"
import { translateUi } from "../../../shared/i18n/index"
import { InlineButton } from "../../../shared/ui/InlineButton"

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
  const width = Math.min(76, Math.max(38, terminalWidth - 6))
  const height = moving ? 10 : 9
  useEffect(() => {
    const timer = setTimeout(() =>
      moving ? inputRef.current?.focus() : confirmRef.current?.focus(),
    )
    return () => clearTimeout(timer)
  }, [moving])

  return (
    <box
      id="http-request-file-modal"
      style={{
        position: "absolute",
        left: Math.max(0, Math.floor((terminalWidth - width) / 2)),
        top: Math.max(1, Math.floor((terminalHeight - height) / 2) - 1),
        width,
        height,
        zIndex: 100,
        ...panelBorder(moving ? COLORS.http : COLORS.danger),
        backgroundColor: COLORS.panelRaised,
        paddingLeft: 1,
        paddingRight: 1,
      }}
    >
      <box
        style={{ height: 1, flexShrink: 0, flexDirection: "row", justifyContent: "space-between" }}
      >
        <text
          content={translateUi(moving ? "MOVER REQUEST" : "EXCLUIR REQUEST")}
          style={{ fg: moving ? COLORS.http : COLORS.danger }}
        />
        <InlineButton label="[Esc] Fechar" accent={COLORS.http} onPress={onClose} />
      </box>
      <text content={requestName} style={{ fg: COLORS.text }} />
      <text
        content={`${translateUi("ARQUIVO ATUAL")}  ${currentPath}`}
        style={{ fg: COLORS.muted }}
      />
      {moving ? (
        <>
          <text
            content={translateUi("ARQUIVO DE DESTINO NO PROJETO")}
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
          <InlineButton
            label="[Ctrl+Enter] Mover"
            accent={COLORS.http}
            disabled={!targetPath.trim() || targetPath === currentPath}
            onPress={onApply}
          />
        </>
      ) : (
        <>
          <text
            content={translateUi(
              "Esta ação remove somente este request; um arquivo vazio também será removido.",
            )}
            style={{ fg: COLORS.warning }}
          />
          <text
            content={translateUi("Alterações não salvas neste request serão perdidas.")}
            style={{ fg: COLORS.danger }}
          />
          <InlineButton
            id="http-request-delete-confirm"
            buttonRef={confirmRef}
            label="[D] Excluir agora"
            accent={COLORS.danger}
            onPress={onApply}
          />
        </>
      )}
    </box>
  )
}
