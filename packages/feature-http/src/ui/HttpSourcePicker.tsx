import { TextAttributes } from "@opentui/core"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { useEffect, useState } from "react"
import { COLORS, LAYOUT } from "@xupon/tuiminal-core/settings/theme"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import type { HttpSourceMode } from "../model/source-mode"
import { HttpSourceCard } from "./HttpSourceCard"

export function HttpSourcePicker({
  active,
  loading = false,
  error = "",
  onSelect,
}: {
  active: boolean
  loading?: boolean
  error?: string
  onSelect: (source: HttpSourceMode) => void
}) {
  const renderer = useRenderer()
  const terminal = useTerminalDimensions()
  const [selected, setSelected] = useState<HttpSourceMode>("local")
  useEffect(() => {
    if (!active) return
    const timer = setTimeout(
      () => renderer.root.findDescendantById(`http-source-${selected}-card`)?.focus(),
      0,
    )
    return () => clearTimeout(timer)
  }, [active, renderer, selected])
  useKeyboard((key) => {
    if (!active) return
    if (key.name === "l" || key.name === "p") {
      key.preventDefault()
      key.stopPropagation()
      onSelect(key.name === "l" ? "local" : "postman")
    } else if (["left", "right", "up", "down", "tab"].includes(key.name)) {
      key.preventDefault()
      key.stopPropagation()
      setSelected((current) => (current === "local" ? "postman" : "local"))
    }
  })
  const horizontal = terminal.width >= 80
  const width = Math.min(horizontal ? 42 : 64, Math.max(20, terminal.width - 8))
  const cardWidth = horizontal ? Math.min(width, Math.floor((terminal.width - 10) / 2)) : width
  const compact = terminal.height < (horizontal ? 26 : 34)
  return (
    <box
      id="http-source-picker"
      flexGrow={1}
      backgroundColor={LAYOUT.workspaceBackground}
      padding={LAYOUT.outerPadding}
      justifyContent="center"
      alignItems="center"
    >
      <box width={horizontal ? cardWidth * 2 + 2 : cardWidth} flexShrink={0}>
        <text content="HTTP" fg={COLORS.http} height={1} />
        <text
          content={translateUi("ESCOLHA A ORIGEM HTTP")}
          fg={COLORS.text}
          height={1}
          attributes={TextAttributes.BOLD}
        />
        {!compact ? (
          <text
            content={translateUi("Selecione onde suas coleções e requests serão salvas.")}
            fg={COLORS.muted}
            marginTop={1}
          />
        ) : null}
        <box height={1} flexShrink={0} />
        <box flexDirection={horizontal ? "row" : "column"} gap={horizontal ? 2 : 1} flexShrink={0}>
          <HttpSourceCard
            source="local"
            width={cardWidth}
            compact={compact}
            selected={selected === "local"}
            onHighlight={() => setSelected("local")}
            onSelect={() => onSelect("local")}
          />
          <HttpSourceCard
            source="postman"
            width={cardWidth}
            compact={compact}
            selected={selected === "postman"}
            loading={loading}
            onHighlight={() => setSelected("postman")}
            onSelect={() => onSelect("postman")}
          />
        </box>
        {error ? (
          <text
            id="http-source-error"
            content={translateUi(error)}
            fg={COLORS.danger}
            marginTop={1}
          />
        ) : null}
      </box>
    </box>
  )
}
