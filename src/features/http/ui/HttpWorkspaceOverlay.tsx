import type { ButtonRenderable } from "@tuiparts/core/button"
import { useEffect, useRef } from "react"
import { COLORS, panelBorder } from "../../../core/settings/theme"
import { translateUi } from "../../../shared/i18n/index"
import { InlineButton } from "../../../shared/ui/InlineButton"
import type { HttpDocumentState, HttpJumpTarget, HttpPane } from "../model/types"

const JUMP_ACTIONS: ReadonlyArray<{ target: HttpJumpTarget; label: string }> = [
  { target: "url", label: "[U] URL" },
  { target: "params", label: "[P] Parâmetros" },
  { target: "headers", label: "[H] Headers" },
  { target: "body", label: "[B] Body" },
  { target: "auth", label: "[A] Autenticação" },
  { target: "response", label: "[R] Resposta" },
  { target: "collection", label: "[C] Coleção" },
  { target: "history", label: "[Y] Histórico" },
]

function contextualHelp(document: HttpDocumentState, activePane: HttpPane) {
  if (activePane === "response") {
    return [
      "[V] Alternar Pretty, Raw, Headers, Timing e Mais",
      "[↑/↓] Rolar resposta · [F10] Maximizar",
      "[Ctrl+↑/↓] Ajustar divisão · [S] Enviar novamente",
    ]
  }
  if (activePane === "navigation") {
    return [
      "[C] Coleção · [Y] Histórico",
      "[Enter] Abrir item · [Esc] Fechar navegação",
      "[Ctrl+N/W] Criar ou fechar request scratch",
    ]
  }
  const editorHint =
    document.requestView === "body" || document.requestView === "headers"
      ? "[Esc] Sair primeiro do editor"
      : "[P/H/B/A/O] Alternar área da requisição"
  return [
    "[/] Focar URL · [M] Trocar método · [S] Enviar",
    editorHint,
    "[Ctrl+O] Ir para · [F10] Maximizar",
  ]
}

export function HttpWorkspaceOverlay({
  overlay,
  document,
  activePane,
  terminalWidth,
  terminalHeight,
  onJump,
  onClose,
}: {
  overlay: "jump" | "help"
  document: HttpDocumentState
  activePane: HttpPane
  terminalWidth: number
  terminalHeight: number
  onJump: (target: HttpJumpTarget) => void
  onClose: () => void
}) {
  const firstButtonRef = useRef<ButtonRenderable | null>(null)
  const width = Math.min(68, Math.max(36, terminalWidth - 6))
  const height = overlay === "jump" ? 13 : 10
  const left = Math.max(0, Math.floor((terminalWidth - width) / 2))
  const top = Math.max(1, Math.floor((terminalHeight - height) / 2) - 1)

  useEffect(() => {
    const timer = setTimeout(() => firstButtonRef.current?.focus(), 0)
    return () => clearTimeout(timer)
  }, [])

  return (
    <box
      id="http-overlay"
      style={{
        position: "absolute",
        left,
        top,
        width,
        height,
        zIndex: 100,
        ...panelBorder(COLORS.http),
        backgroundColor: COLORS.panelRaised,
        paddingLeft: 1,
        paddingRight: 1,
      }}
    >
      <box
        style={{ height: 1, flexShrink: 0, flexDirection: "row", justifyContent: "space-between" }}
      >
        <text
          content={translateUi(overlay === "jump" ? "IR PARA" : "AJUDA HTTP")}
          style={{ fg: COLORS.http }}
        />
        <InlineButton
          id="http-overlay-close"
          buttonRef={firstButtonRef}
          label="[Esc] Fechar"
          accent={COLORS.http}
          onPress={onClose}
        />
      </box>
      {overlay === "jump" ? (
        <>
          <text
            content={translateUi("Escolha uma área pelo teclado ou mouse.")}
            style={{ fg: COLORS.muted }}
          />
          <box style={{ flexGrow: 1, paddingTop: 1 }}>
            {JUMP_ACTIONS.map((action) => (
              <InlineButton
                key={action.target}
                id={`http-overlay-jump-${action.target}`}
                label={action.label}
                accent={COLORS.http}
                onPress={() => onJump(action.target)}
              />
            ))}
          </box>
        </>
      ) : (
        <>
          <text content={translateUi("ATALHOS DO CONTEXTO ATUAL")} style={{ fg: COLORS.muted }} />
          <box style={{ flexGrow: 1, paddingTop: 1 }}>
            {contextualHelp(document, activePane).map((line) => (
              <text key={line} content={translateUi(line)} style={{ fg: COLORS.text }} />
            ))}
          </box>
          <text
            content={translateUi(
              "Atalhos globais ficam suspensos enquanto esta ajuda está aberta.",
            )}
            style={{ fg: COLORS.muted }}
          />
        </>
      )}
    </box>
  )
}
