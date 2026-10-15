import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import type { DatabaseSqlTab } from "../model/workspace"
import { SQL_TAB_LIMIT } from "../rendering/constants"
import { shorten } from "../rendering/workspace-shared"

type Props = {
  tabs: DatabaseSqlTab[]
  activeTabId: string
  availableWidth: number
  onSelectTab: (tabId: string) => void
  onSwitchTab: (direction: -1 | 1) => void
  onNewTab: () => void
  onCloseTab: (tabId: string) => void
}
export function DatabaseQueryTabs({
  tabs,
  activeTabId,
  availableWidth,
  onSelectTab,
  onSwitchTab,
  onNewTab,
  onCloseTab,
}: Props) {
  return (
    <box
      style={{
        height: 1,
        flexShrink: 0,
        flexDirection: "row",
        border: ["bottom"],
        borderColor: COLORS.border,
        backgroundColor: COLORS.panel,
      }}
    >
      {tabs.map((tab, index) => (
        <InlineButton
          key={tab.id}
          id={`database-query-tab-${tab.id}`}
          label={`[${index + 1}] ${shorten(tab.title, Math.max(5, Math.floor((availableWidth - 24) / tabs.length) - 4))}`}
          accent={COLORS.database}
          active={tab.id === activeTabId}
          onPress={() => onSelectTab(tab.id)}
        />
      ))}
      {tabs.length > 1 ? (
        <>
          <InlineButton label="[Alt+←]" accent={COLORS.database} onPress={() => onSwitchTab(-1)} />
          <InlineButton label="[Alt+→]" accent={COLORS.database} onPress={() => onSwitchTab(1)} />
        </>
      ) : null}
      <InlineButton
        label="[Ctrl+N] +"
        accent={COLORS.success}
        disabled={tabs.length >= SQL_TAB_LIMIT}
        onPress={onNewTab}
      />
      <InlineButton
        label="[Ctrl+W] ×"
        accent={COLORS.danger}
        onPress={() => onCloseTab(activeTabId)}
      />
    </box>
  )
}
