import { useTerminalDimensions } from "@opentui/react"
import { displayWidth, translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { COLORS, LAYOUT } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import type { GitWorkspaceTab } from "../model/workspace"
import type { GitHubNavigationIdentity } from "./GitNavigationContext"

export function GitNavigationHeader({
  localRoot,
  identity,
  selected,
  localMode,
  onSelect,
  onToggleMode,
  id = "git-navigation-header",
  localActionsId = "git-local-actions",
  compareButtonId = "git-mode-compare",
}: {
  localRoot: string
  identity: GitHubNavigationIdentity | null
  selected: GitWorkspaceTab
  localMode: "diffs" | "compare"
  onSelect: (tab: GitWorkspaceTab) => void
  onToggleMode: () => void
  id?: string
  localActionsId?: string
  compareButtonId?: string
}) {
  const terminal = useTerminalDimensions()
  const width = Math.max(1, terminal.width - LAYOUT.outerPadding * 2)
  const diffs = translateUi("[C] DIFFS")
  const compare = translateUi("[C] COMPARAR")
  const remote = [
    ["pr", translateUi("[2] PR")],
    ["issues", translateUi("[3] ISSUES")],
    ["inbox", translateUi("[4] INBOX")],
  ] as const
  const localMinimum = 7 + Math.max(displayWidth(diffs), displayWidth(compare))
  const remoteMinimum = remote.reduce((total, [, label]) => total + displayWidth(label) + 2, 0)
  const stacked = width < localMinimum + remoteMinimum + 3
  const localWidth = stacked
    ? width
    : Math.min(
        width - remoteMinimum - 3,
        Math.max(localMinimum, Math.min(40, Math.floor(width * 0.4))),
      )
  const remoteWidth = stacked ? width : width - localWidth - 3
  const path = localRoot.replaceAll("\\", "/").replace(/\/+$/, "")
  const project = path ? `…/${path.split("/").at(-1)}` : "/"
  const account = identity
    ? `@${identity.viewerLogin}${identity.host === "github.com" ? "" : ` · ${identity.host}`}`
    : "—"
  return (
    <box
      id={id}
      style={{
        flexShrink: 0,
        flexDirection: stacked ? "column" : "row",
        backgroundColor: COLORS.panel,
        paddingLeft: LAYOUT.outerPadding,
        paddingRight: LAYOUT.outerPadding,
      }}
    >
      <box id="git-navigation-local" style={{ width: localWidth, flexShrink: 0 }}>
        <text
          id="git-navigation-local-context"
          content={truncateDisplay(`${translateUi("LOCAL")} · ${project}`, localWidth)}
          style={{ height: 1, fg: selected === "base" ? COLORS.git : COLORS.muted }}
        />
        <box id={localActionsId} style={{ flexDirection: "row", flexWrap: "wrap" }}>
          <InlineButton
            id="git-tab-base"
            label="[1]"
            accent={COLORS.git}
            active={selected === "base"}
            onPress={() => onSelect("base")}
          />
          <InlineButton
            id={compareButtonId}
            label={localMode === "diffs" ? diffs : compare}
            accent={COLORS.git}
            active={selected === "base"}
            onPress={onToggleMode}
          />
        </box>
      </box>
      {!stacked && <text content={" │ \n │ "} style={{ width: 3, height: 2, fg: COLORS.border }} />}
      <box id="git-navigation-github" style={{ width: remoteWidth, flexShrink: 0 }}>
        <text
          id="git-navigation-github-context"
          content={truncateDisplay(`GITHUB · ${account}`, remoteWidth)}
          style={{ height: 1, fg: selected === "base" ? COLORS.muted : COLORS.git }}
        />
        <box style={{ flexDirection: "row", flexWrap: "wrap" }}>
          {remote.map(([tab, label]) => (
            <InlineButton
              key={tab}
              id={`git-tab-${tab}`}
              label={label}
              accent={COLORS.git}
              active={selected === tab}
              onPress={() => onSelect(tab)}
            />
          ))}
        </box>
      </box>
    </box>
  )
}
