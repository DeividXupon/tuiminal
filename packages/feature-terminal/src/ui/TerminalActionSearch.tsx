import type { InputRenderable } from "@opentui/core"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import type { RefObject } from "react"

export function TerminalActionSearch({
  input,
  query,
  onInput,
  onSearch,
}: {
  input: RefObject<InputRenderable | null>
  query: string
  onInput: (value: string) => void
  onSearch: () => void
}) {
  return (
    <box
      style={{
        height: 1,
        flexShrink: 0,
        flexDirection: "row",
        backgroundColor: COLORS.panelRaised,
      }}
    >
      <input
        ref={input}
        id="terminal-action-search"
        value={query}
        placeholder={translateUi("Pesquisar ações e agentes…")}
        onInput={onInput}
        onMouseDown={() => input.current?.focus()}
        style={{
          flexGrow: 1,
          flexShrink: 1,
          minWidth: 1,
          backgroundColor: COLORS.panelRaised,
          textColor: COLORS.text,
          focusedBackgroundColor: COLORS.panelRaised,
          focusedTextColor: COLORS.text,
        }}
      />
      {query.trim() && (
        <InlineButton
          id="terminal-action-search-submit"
          label="[Enter] Pesquisar agente"
          compact
          backgroundColor={COLORS.panelRaised}
          onPress={onSearch}
        />
      )}
    </box>
  )
}
