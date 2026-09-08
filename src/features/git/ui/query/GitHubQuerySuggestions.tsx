import { Button } from "@tuiparts/react/button"
import { COLORS } from "../../../../core/settings/theme"
import { translateUi, truncateDisplay } from "../../../../shared/i18n"
import type { GitHubQuerySuggestion } from "../../model/query-autocomplete"

export function GitHubQuerySuggestions({
  suggestions,
  selectedIndex,
  width,
  onSelect,
}: {
  suggestions: readonly GitHubQuerySuggestion[]
  selectedIndex: number
  width: number
  onSelect: (index: number) => void
}) {
  return (
    <box style={{ height: 4, flexShrink: 0, marginTop: 1 }}>
      <text
        content={translateUi("AUTOCOMPLETE GITHUB · [Ctrl+N/P] navegar · [Ctrl+Y] aplicar")}
        style={{ fg: COLORS.muted }}
      />
      {suggestions.length ? (
        suggestions.slice(0, 3).map((suggestion, index) => (
          <Button
            key={suggestion.value}
            id={`git-query-suggestion-${index}`}
            height={1}
            width="100%"
            onPress={() => onSelect(index)}
          >
            <text
              content={truncateDisplay(
                `${index === selectedIndex ? "▶" : " "} ${suggestion.value} · ${translateUi(suggestion.description)}`,
                width,
              )}
              style={{ fg: index === selectedIndex ? COLORS.git : COLORS.muted }}
            />
          </Button>
        ))
      ) : (
        <text
          content={translateUi("Continue digitando para filtrar as sugestões.")}
          style={{ fg: COLORS.muted }}
        />
      )}
    </box>
  )
}
