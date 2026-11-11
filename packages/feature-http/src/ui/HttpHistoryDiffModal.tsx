import { translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { createUiSyntaxStyle } from "@xupon/tuiminal-core/ui/syntax-style"
import { diffHttpHistoryEntries } from "../model/history"
import type { HttpHistoryEntry } from "../model/types"
import { HttpDialog } from "./HttpDialog"
import { HttpDialogSection } from "./HttpDialogDetails"

const DIFF_SYNTAX = createUiSyntaxStyle()

function diffContent(left: HttpHistoryEntry, right: HttpHistoryEntry) {
  const lines = diffHttpHistoryEntries(left, right)
  if (!lines) return translateUi("O corpo de uma das respostas não está mais disponível.")
  return lines
    .map((line) => `${line.kind === "add" ? "+" : line.kind === "remove" ? "-" : " "} ${line.text}`)
    .join("\n")
}

export function HttpHistoryDiffModal({
  entries,
  terminalWidth,
  terminalHeight,
  onClose,
}: {
  entries: [HttpHistoryEntry, HttpHistoryEntry]
  terminalWidth: number
  terminalHeight: number
  onClose: () => void
}) {
  const width = Math.max(1, Math.min(110, terminalWidth - 2))
  const content = diffContent(entries[0], entries[1])
  const height = Math.max(1, Math.min(30, terminalHeight - 2, 10 + content.split("\n").length))
  return (
    <HttpDialog
      id="http-history-diff-modal"
      title={"COMPARAR RESPOSTAS"}
      width={width}
      height={height}
      terminalWidth={terminalWidth}
      terminalHeight={terminalHeight}
      onClose={onClose}
      actions={[]}
    >
      <box
        style={{
          flexShrink: 0,
          flexDirection: width >= 70 ? "row" : "column",
          gap: width >= 70 ? 1 : 0,
        }}
      >
        {entries.map((entry, index) => (
          <box
            key={index === 0 ? "before" : "after"}
            style={{ flexGrow: 1, width: width >= 70 ? "50%" : "100%", minWidth: 0 }}
          >
            <HttpDialogSection accent={index === 0 ? COLORS.danger : COLORS.success}>
              <text
                content={truncateDisplay(
                  `${index === 0 ? "−" : "+"} ${entry.status ?? "ERR"} · ${entry.requestName}`,
                  (width >= 70 ? Math.floor((width - 5) / 2) : width - 4) - 2,
                )}
                wrapMode="none"
                style={{ height: 1, fg: COLORS.text }}
              />
            </HttpDialogSection>
          </box>
        ))}
      </box>
      <scrollbox
        scrollY
        scrollX
        viewportCulling
        style={{ flexGrow: 1, minHeight: 1, marginTop: 1, backgroundColor: COLORS.canvas }}
      >
        <code
          content={content}
          filetype="diff"
          syntaxStyle={DIFF_SYNTAX}
          bg={COLORS.canvas}
          wrapMode="none"
          style={{ width: "100%", height: Math.max(1, content.split("\n").length) }}
        />
      </scrollbox>
    </HttpDialog>
  )
}
