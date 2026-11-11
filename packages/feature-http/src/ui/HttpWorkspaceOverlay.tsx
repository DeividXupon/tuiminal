import type { ButtonRenderable } from "@tuiparts/core/button"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { ShortcutText } from "@xupon/tuiminal-core/ui/ShortcutText"
import { useEffect, useRef } from "react"
import type { HttpDocumentState, HttpJumpTarget, HttpPane } from "../model/types"
import { HttpDialog } from "./HttpDialog"
import { HttpDialogSection } from "./HttpDialogDetails"

const JUMP_ACTIONS: ReadonlyArray<{ target: HttpJumpTarget; label: string }> = [
  { target: "url", label: "[U] URL" },
  { target: "response", label: "[R] Resposta" },
  { target: "collection", label: "[C] Coleção" },
  { target: "environments", label: "[E] Ambientes" },
]

function contextualHelp(document: HttpDocumentState, activePane: HttpPane) {
  if (activePane === "response") {
    const jsonNavigation =
      document.execution.status === "success" &&
      document.execution.response.bodyKind === "json" &&
      document.responseView === "pretty"
    return [
      "[A←]/[F→] Alternar Pretty, Raw, Headers, Timing e Mais",
      jsonNavigation
        ? "[↑/↓] Blocos JSON · [←/→/Enter] recolher ou expandir"
        : "[↑/↓] Rolar resposta · [F10] Maximizar",
      "[Tab/Shift+Tab/H/L] Alternar painéis",
    ]
  }
  if (activePane === "navigation") {
    return [
      "[C] Coleção · [E] Ambientes",
      "[Enter] Abrir item · [Esc] Fechar navegação",
      "[Tab/Shift+Tab/H/L] Alternar painéis",
    ]
  }
  return [
    "[/] Focar URL · [Shift+M] Trocar método · [S] Enviar",
    "[A←]/[F→] Alternar Params, Headers, Body, Auth e Mais",
    ...(document.request.source.kind === "file" &&
    document.request.source.path.replaceAll("\\", "/").startsWith("postman/")
      ? ["[Ctrl+S] Salvar no Postman · [Ctrl+P] Reenviar"]
      : []),
    "[Tab/Shift+Tab/H/L] Alternar painéis",
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
  const width = Math.max(1, Math.min(76, terminalWidth - 2))

  useEffect(() => {
    const timer = setTimeout(() => firstButtonRef.current?.focus(), 0)
    return () => clearTimeout(timer)
  }, [])

  return (
    <HttpDialog
      fitContent
      scrollContent
      id="http-overlay"
      title={overlay === "jump" ? "IR PARA" : "AJUDA HTTP"}
      width={width}
      height={Math.min(18, terminalHeight - 2)}
      terminalWidth={terminalWidth}
      terminalHeight={terminalHeight}
      onClose={onClose}
      closeRef={firstButtonRef}
      closeId="http-overlay-close"
      actions={[]}
    >
      {overlay === "jump" ? (
        <>
          <text
            content={translateUi("Escolha uma área pelo teclado ou mouse.")}
            style={{ fg: COLORS.muted }}
          />
          <box style={{ flexShrink: 0, marginTop: 1 }}>
            <HttpDialogSection>
              {JUMP_ACTIONS.map((action) => (
                <InlineButton
                  key={action.target}
                  id={`http-overlay-jump-${action.target}`}
                  label={action.label}
                  accent={COLORS.http}
                  onPress={() => onJump(action.target)}
                />
              ))}
            </HttpDialogSection>
          </box>
        </>
      ) : (
        <>
          <HttpDialogSection title="ATALHOS DO CONTEXTO ATUAL">
            {contextualHelp(document, activePane).map((line) => (
              <ShortcutText key={line} content={line} style={{ fg: COLORS.text, flexShrink: 0 }} />
            ))}
          </HttpDialogSection>
          <text
            content={translateUi(
              "Atalhos globais ficam suspensos enquanto esta ajuda está aberta.",
            )}
            style={{ fg: COLORS.muted, flexShrink: 0, marginTop: 1 }}
          />
        </>
      )}
    </HttpDialog>
  )
}
