import { Button } from "@tuiparts/react/button"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { ShortcutText } from "@xupon/tuiminal-core/ui/ShortcutText"
import type {
  GitCommandCompletion,
  GitCommandCompletionKind,
} from "../../model/git-command-autocomplete"

const COMPLETION_KIND_LABELS: Record<GitCommandCompletionKind, string> = {
  command: "comando Git",
  option: "opção",
  subcommand: "subcomando",
  currentBranch: "branch atual",
  localBranch: "branch local",
  remoteBranch: "branch remota",
  tag: "tag",
  remote: "remote",
  path: "arquivo alterado",
}

export function GitCommandSuggestions({
  suggestions,
  selectedIndex,
  width,
  onSelect,
}: {
  suggestions: readonly GitCommandCompletion[]
  selectedIndex: number
  width: number
  onSelect: (index: number) => void
}) {
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: keeps popup clicks from refocusing the underlying input before Button release.
    <box
      id="git-command-suggestions"
      onMouseDown={(event) => event.stopPropagation()}
      style={{
        position: "absolute",
        left: 4,
        right: 0,
        bottom: 1,
        height: suggestions.length + 1,
        zIndex: 50,
        flexShrink: 0,
        backgroundColor: COLORS.panelRaised,
        paddingLeft: 1,
        paddingRight: 1,
      }}
    >
      <ShortcutText
        content={truncateDisplay(
          translateUi("AUTOCOMPLETE GIT · [Ctrl+N/P] Navegar · [Ctrl+Y] Aplicar · [Esc] Fechar"),
          Math.max(8, width - 2),
        )}
        style={{ fg: COLORS.muted }}
      />
      {suggestions.map((suggestion, index) => (
        <Button
          key={`${suggestion.kind}:${suggestion.value}`}
          id={`git-command-suggestion-${index}`}
          height={1}
          width="100%"
          onPress={() => onSelect(index)}
        >
          <text
            content={truncateDisplay(
              `${index === selectedIndex ? "▶" : " "} ${suggestion.value} · ${translateUi(COMPLETION_KIND_LABELS[suggestion.kind])}`,
              Math.max(8, width - 2),
            )}
            style={{ fg: index === selectedIndex ? COLORS.git : COLORS.muted }}
          />
        </Button>
      ))}
    </box>
  )
}
