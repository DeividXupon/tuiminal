import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { ShortcutText } from "@xupon/tuiminal-core/ui/ShortcutText"

type Props = {
  items: { value: string; description: string; translateDescription: boolean }[]
  selectedIndex: number
  query: string
  anchor: { row: number; column: number }
  editorHeight: number
  editorWidth: number
  onSelect: (index: number) => void
}

export function RunnerYamlSuggestions({
  items,
  selectedIndex,
  query,
  anchor,
  editorHeight,
  editorWidth,
  onSelect,
}: Props) {
  if (!items.length) return null
  const height = Math.min(3, items.length) + 1
  const width = Math.min(editorWidth, 88)
  const listWidth = Math.min(39, Math.max(8, Math.floor(width * 0.48)))
  const top =
    anchor.row + height + 1 < editorHeight ? anchor.row + 1 : Math.max(0, anchor.row - height)
  const left = Math.max(0, Math.min(anchor.column, editorWidth - width))
  const matches = items.some((item) =>
    item.value.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  )
  const start = Math.max(0, selectedIndex - 2)
  const selected = items[selectedIndex] ?? items[0]!
  return (
    <box
      id="runner-config-suggestions"
      style={{
        position: "absolute",
        top,
        left,
        width,
        height,
        zIndex: 40,
        backgroundColor: COLORS.panelRaised,
        border: ["left", "right"],
        borderColor: COLORS.runner,
      }}
    >
      <box height={1} flexDirection="row">
        <text content={translateUi(matches ? "SUGESTÕES" : "RECOMENDAÇÕES")} fg={COLORS.runner} />
        <ShortcutText content=" [Ctrl+J/K]" style={{ fg: COLORS.muted }} />
      </box>
      <box height={height - 1} flexDirection="row">
        <box width={listWidth} height={height - 1}>
          {items.slice(start, start + 3).map((suggestion, index) => (
            // biome-ignore lint/a11y/noStaticElementInteractions: rows only select which read-only description is shown.
            <box
              key={suggestion.value}
              id={`runner-config-suggestion-${index}`}
              height={1}
              width="100%"
              flexDirection="row"
              backgroundColor={suggestion === selected ? COLORS.diffModifiedBg : COLORS.panelRaised}
              onMouseDown={(event) => {
                event.stopPropagation()
                onSelect(start + index)
              }}
            >
              <text content={` ${suggestion.value}`} fg={COLORS.text} truncate />
            </box>
          ))}
        </box>
        <box
          width={Math.max(1, width - listWidth - 2)}
          height={height - 1}
          border={["left"]}
          borderColor={COLORS.muted}
        >
          <text
            id="runner-config-suggestion-description"
            content={
              selected.translateDescription
                ? translateUi(selected.description)
                : selected.description
            }
            fg={COLORS.text}
            width="100%"
            height={height - 1}
          />
        </box>
      </box>
    </box>
  )
}
