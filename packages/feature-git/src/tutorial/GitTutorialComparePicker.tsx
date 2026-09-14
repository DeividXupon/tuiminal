import { useTerminalDimensions } from "@opentui/react"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { ShortcutText } from "@xupon/tuiminal-core/ui/ShortcutText"

export function TutorialCompareBranchPicker({
  side,
  onPress,
}: {
  side: "base" | "compared"
  onPress: () => void
}) {
  const terminal = useTerminalDimensions()
  const width = Math.max(44, Math.min(78, terminal.width - 6))
  const height = Math.max(14, Math.min(22, terminal.height - 4))
  const base = side === "base"
  return (
    <>
      <box
        position="absolute"
        top={0}
        left={0}
        width="100%"
        height="100%"
        zIndex={700}
        backgroundColor="#030509"
        opacity={0.92}
      />
      <box
        position="absolute"
        top={0}
        left={0}
        width="100%"
        height="100%"
        zIndex={701}
        alignItems="center"
        justifyContent="center"
      >
        <box
          style={{
            width,
            height,
            border: true,
            borderStyle: "rounded",
            borderColor: COLORS.git,
            backgroundColor: COLORS.canvas,
            paddingLeft: 1,
            paddingRight: 1,
          }}
        >
          <box
            style={{
              height: 2,
              flexShrink: 0,
              flexDirection: "row",
              justifyContent: "space-between",
              border: ["bottom"],
              borderColor: COLORS.border,
            }}
          >
            <box
              id={base ? "tutorial-git-compare-base" : "tutorial-git-compare-compared"}
              style={{ width: base ? 30 : 39, height: 1, flexShrink: 0 }}
            >
              <text
                content={translateUi(
                  base ? "◆ ESCOLHER BRANCH BASE" : "◆ ESCOLHER BRANCH COMPARADA",
                )}
                style={{ fg: COLORS.git }}
              />
            </box>
            <InlineButton
              label={translateUi("[Esc] Voltar")}
              accent={COLORS.git}
              onPress={onPress}
            />
          </box>
          <box
            style={{
              height: 1,
              flexShrink: 0,
              marginTop: 1,
              marginBottom: 1,
              backgroundColor: COLORS.panelRaised,
              paddingLeft: 1,
            }}
          >
            <text content={translateUi("⌕ Filtrar branch…")} style={{ fg: COLORS.muted }} />
          </box>
          <box style={{ flexGrow: 1, backgroundColor: COLORS.panel }}>
            <box
              style={{
                height: 2,
                flexShrink: 0,
                backgroundColor: base ? COLORS.panelRaised : COLORS.panel,
              }}
            >
              <box style={{ width: 28, height: 2, flexShrink: 0 }}>
                <text
                  content={`${base ? "▶ ●" : "  ◇"} main`}
                  style={{ fg: base ? COLORS.git : COLORS.text }}
                />
                <text content={`    ${translateUi("BRANCH ATUAL")}`} style={{ fg: COLORS.muted }} />
              </box>
            </box>
            <box
              style={{
                height: 2,
                flexShrink: 0,
                backgroundColor: base ? COLORS.panel : COLORS.panelRaised,
              }}
            >
              <box style={{ width: 34, height: 2, flexShrink: 0 }}>
                <text
                  content={`${base ? "  ◇" : "▶ ●"} feature/tutorial`}
                  style={{ fg: base ? COLORS.text : COLORS.git }}
                />
                <text content={`    ${translateUi("BRANCH LOCAL")}`} style={{ fg: COLORS.muted }} />
              </box>
            </box>
            <text content="  ◇ origin/main" style={{ fg: COLORS.text }} />
            <text content={`    ${translateUi("UPSTREAM ATUAL")}`} style={{ fg: COLORS.muted }} />
            <text content="  ◇ origin/feature/review" style={{ fg: COLORS.text }} />
            <text content={`    ${translateUi("BRANCH REMOTA")}`} style={{ fg: COLORS.muted }} />
          </box>
          <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
            <text
              content={`${translateUi(base ? "BRANCH BASE" : "BRANCH COMPARADA")}: `}
              style={{ fg: COLORS.muted }}
            />
            <text content={base ? "main" : "feature/tutorial"} style={{ fg: COLORS.git }} />
          </box>
          <ShortcutText
            content={translateUi("[/] Filtrar  [↑/↓] Navegar  [Enter] Selecionar")}
            style={{ height: 1, flexShrink: 0, fg: COLORS.muted }}
          />
        </box>
      </box>
    </>
  )
}
