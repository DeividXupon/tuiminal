import { COLORS, LAYOUT } from "../../../../core/settings/theme"
import { InlineButton } from "../../../../shared/ui/InlineButton"
import type { NarrowGitPane } from "../../model/view"

export function GitPaneSwitcher({
  narrow,
  pane,
  onFocus,
}: {
  narrow: boolean
  pane: NarrowGitPane
  onFocus: (pane: NarrowGitPane) => void
}) {
  if (!narrow) return null
  return (
    <box
      style={{
        height: 1,
        flexShrink: 0,
        flexDirection: "row",
        backgroundColor: COLORS.panel,
        marginBottom: LAYOUT.headerSpacing,
      }}
    >
      <InlineButton
        label="[Tab] Arquivos"
        accent={COLORS.git}
        active={pane === "files"}
        onPress={() => onFocus("files")}
      />
      <InlineButton
        label="[Tab] Preview"
        accent={COLORS.git}
        active={pane === "preview"}
        onPress={() => onFocus("preview")}
      />
      <text content=" · um painel por vez" style={{ fg: COLORS.muted }} />
    </box>
  )
}
