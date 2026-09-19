import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { useEffect } from "react"
import { COLORS, LAYOUT } from "@xupon/tuiminal-core/settings/theme"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import type { HttpSourceMode } from "../model/source-mode"

export function HttpSourcePicker({
  active,
  onSelect,
}: {
  active: boolean
  onSelect: (source: HttpSourceMode) => void
}) {
  const renderer = useRenderer()
  const terminal = useTerminalDimensions()
  useEffect(() => {
    if (!active) return
    const timer = setTimeout(
      () => renderer.root.findDescendantById("http-source-local")?.focus(),
      0,
    )
    return () => clearTimeout(timer)
  }, [active, renderer])
  useKeyboard((key) => {
    if (!active || (key.name !== "l" && key.name !== "p")) return
    key.preventDefault()
    key.stopPropagation()
    onSelect(key.name === "l" ? "local" : "postman")
  })
  const horizontal = terminal.width >= 70
  return (
    <box
      id="http-source-picker"
      style={{
        flexGrow: 1,
        backgroundColor: COLORS.canvas,
        padding: LAYOUT.outerPadding,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <text content={translateUi("ESCOLHA A ORIGEM HTTP")} style={{ fg: COLORS.http }} />
      <text
        content={translateUi("Selecione onde suas coleções e requests serão salvas.")}
        style={{ fg: COLORS.muted }}
      />
      <box style={{ height: 1 }} />
      <box style={{ flexDirection: horizontal ? "row" : "column", gap: 1 }}>
        {/* biome-ignore lint/a11y/noStaticElementInteractions: each source card also has a keyboard-operated button. */}
        <box
          id="http-source-local-card"
          onMouseDown={() => onSelect("local")}
          style={{
            width: horizontal ? 29 : Math.min(62, Math.max(24, terminal.width - 4)),
            height: 7,
            border: true,
            borderStyle: "rounded",
            borderColor: COLORS.http,
            backgroundColor: COLORS.panel,
            paddingLeft: 1,
          }}
        >
          <text content={translateUi("HTTP LOCAL")} style={{ fg: COLORS.http }} />
          <text content={translateUi("Coleções da biblioteca local")} style={{ fg: COLORS.text }} />
          <text content={translateUi("Salvas neste computador")} style={{ fg: COLORS.muted }} />
          <InlineButton
            id="http-source-local"
            label="[L] Abrir local"
            accent={COLORS.http}
            onPress={() => onSelect("local")}
          />
        </box>
        {/* biome-ignore lint/a11y/noStaticElementInteractions: each source card also has a keyboard-operated button. */}
        <box
          id="http-source-postman-card"
          onMouseDown={() => onSelect("postman")}
          style={{
            width: horizontal ? 29 : Math.min(62, Math.max(24, terminal.width - 4)),
            height: 7,
            border: true,
            borderStyle: "rounded",
            borderColor: COLORS.http,
            backgroundColor: COLORS.panel,
            paddingLeft: 1,
          }}
        >
          <text content={translateUi("POSTMAN")} style={{ fg: COLORS.http }} />
          <text content={translateUi("Coleções da conta conectada")} style={{ fg: COLORS.text }} />
          <text
            content={translateUi("Mudanças enviadas ao Postman")}
            style={{ fg: COLORS.muted }}
          />
          <InlineButton
            id="http-source-postman"
            label="[P] Abrir Postman"
            accent={COLORS.http}
            onPress={() => onSelect("postman")}
          />
        </box>
      </box>
    </box>
  )
}
