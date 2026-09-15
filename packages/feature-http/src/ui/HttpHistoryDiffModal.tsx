import { COLORS, panelBorder } from "@xupon/tuiminal-core/settings/theme"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { createUiSyntaxStyle } from "@xupon/tuiminal-core/ui/syntax-style"
import { diffHttpHistoryEntries } from "../model/history"
import type { HttpHistoryEntry } from "../model/types"

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
  const width = Math.max(40, Math.min(110, terminalWidth - 6))
  const height = Math.max(10, Math.min(30, terminalHeight - 4))
  const content = diffContent(entries[0], entries[1])
  return (
    <box
      style={{
        position: "absolute",
        left: Math.max(0, Math.floor((terminalWidth - width) / 2)),
        top: Math.max(0, Math.floor((terminalHeight - height) / 2)),
        width,
        height,
        zIndex: 100,
        ...panelBorder(COLORS.http),
        backgroundColor: COLORS.panel,
        paddingLeft: 1,
        paddingRight: 1,
      }}
    >
      <box
        style={{ height: 1, flexShrink: 0, flexDirection: "row", justifyContent: "space-between" }}
      >
        <text content={translateUi("COMPARAR RESPOSTAS")} style={{ fg: COLORS.http }} />
        <InlineButton label="[Esc] Fechar" accent={COLORS.http} onPress={onClose} />
      </box>
      <text
        content={`${entries[0].status ?? "ERR"} ${entries[0].requestName}  ↔  ${entries[1].status ?? "ERR"} ${entries[1].requestName}`}
        style={{ height: 1, flexShrink: 0, fg: COLORS.muted }}
      />
      <scrollbox
        scrollY
        scrollX
        viewportCulling
        style={{ flexGrow: 1, backgroundColor: COLORS.canvas }}
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
    </box>
  )
}
