import type { InputRenderable } from "@opentui/core"
import { useRef } from "react"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"

export function HttpCollectionSearch({
  compact,
  query,
  onChange,
  onFocus,
  register,
}: {
  compact: boolean
  query: string
  onChange: (query: string) => void
  onFocus: () => void
  register: (input: InputRenderable | null) => void
}) {
  const ref = useRef<InputRenderable | null>(null)
  return (
    <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
      <InlineButton
        id="http-collection-search-button"
        label={compact ? "[F]" : "[F] Buscar"}
        accent={COLORS.http}
        active={Boolean(query)}
        onPress={() => {
          onFocus()
          ref.current?.focus()
        }}
      />
      <input
        ref={(input) => {
          ref.current = input
          register(input)
        }}
        id="http-collection-search"
        value={query}
        placeholder={compact ? "…" : translateUi("Buscar coleção")}
        onInput={onChange}
        onMouseDown={() => {
          onFocus()
          ref.current?.focus()
        }}
        style={{
          flexGrow: 1,
          backgroundColor: COLORS.canvas,
          focusedBackgroundColor: COLORS.panelRaised,
        }}
      />
      {query ? (
        <InlineButton
          id="http-collection-search-clear"
          label="[×]"
          accent={COLORS.danger}
          onPress={() => onChange("")}
        />
      ) : null}
    </box>
  )
}
