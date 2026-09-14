import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { groupHttpHistoryByRequest } from "../model/history"
import type { HttpHistoryEntry, HttpProjectRequestItem, HttpWorkspaceState } from "../model/types"
import { formatHttpDuration } from "./format"

function historyLine(entry: HttpHistoryEntry, width: number) {
  const result = entry.status ? String(entry.status) : "ERR"
  const duration = entry.durationMs === null ? "" : ` ${formatHttpDuration(entry.durationMs)}`
  return truncateDisplay(`${result} ${entry.method} ${entry.url}${duration}`, width)
}

export function HttpHistoryList({
  state,
  contentWidth,
  projectRequests,
  onToggle,
  onOpen,
}: {
  state: HttpWorkspaceState
  contentWidth: number
  projectRequests: HttpProjectRequestItem[]
  onToggle: (entryId: string) => void
  onOpen: (entry: HttpHistoryEntry) => void
}) {
  return (
    <>
      {groupHttpHistoryByRequest(state.history).map((group) => (
        <box key={group.requestId} style={{ flexShrink: 0 }}>
          <text
            content={truncateDisplay(
              `${group.requestName} · ${group.entries.length}`,
              contentWidth,
            )}
            style={{ fg: COLORS.muted }}
          />
          {group.entries.map((entry) => {
            const requestKnown =
              state.documents.some((document) => document.request.id === entry.requestId) ||
              projectRequests.some((item) => item.request.id === entry.requestId)
            const selected = state.historySelection.includes(entry.id)
            return (
              <box key={entry.id} style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
                <InlineButton
                  label={selected ? "[●]" : "[○]"}
                  accent={COLORS.http}
                  active={selected}
                  disabled={!entry.response?.body}
                  onPress={() => onToggle(entry.id)}
                />
                <InlineButton
                  id={`http-navigation-history-${entry.id}`}
                  label={historyLine(entry, contentWidth - 4)}
                  accent={entry.error ? COLORS.danger : COLORS.http}
                  disabled={!requestKnown || !entry.response?.body}
                  onPress={() => onOpen(entry)}
                />
              </box>
            )
          })}
        </box>
      ))}
    </>
  )
}
