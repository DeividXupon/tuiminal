import type { InputRenderable } from "@opentui/core"
import { useRef } from "react"
import { COLORS, focusedPanelBorder, LAYOUT } from "../../../../core/settings/theme"
import { translateUi } from "../../../../shared/i18n"
import { InlineButton } from "../../../../shared/ui/InlineButton"
import type { GitCommandConsoleLine } from "../../model/git-command-console"
import { fitLine } from "../../rendering/diff"

const TONE_COLORS: Record<GitCommandConsoleLine["tone"], string> = {
  command: COLORS.git,
  success: COLORS.success,
  error: COLORS.danger,
  muted: COLORS.muted,
}

export function gitCommandConsoleHeight(compact: boolean) {
  return compact ? 4 : 6
}

export function GitCommandConsole({
  width,
  focused,
  running,
  lines,
  value,
  onInput,
  onSubmit,
  onFocus,
  onNavigate,
}: {
  width: number
  focused: boolean
  running: boolean
  lines: GitCommandConsoleLine[]
  value: string
  onInput: (value: string) => void
  onSubmit: () => void
  onFocus: () => void
  onNavigate: (pane: "files" | "preview") => void
}) {
  const inputRef = useRef<InputRenderable | null>(null)
  const focus = () => {
    onFocus()
    setTimeout(() => inputRef.current?.focus(), 0)
  }
  const visibleLines = lines.slice(-2)
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: the panel focuses its Git input.
    <box
      id="git-command-console"
      onMouseDown={focus}
      style={{
        width: "100%",
        height: gitCommandConsoleHeight(LAYOUT.compact),
        flexShrink: 0,
        ...focusedPanelBorder(focused, COLORS.git),
        backgroundColor: COLORS.panel,
        paddingLeft: 1,
        paddingRight: 1,
      }}
    >
      <box
        style={{ height: 1, flexShrink: 0, flexDirection: "row", justifyContent: "space-between" }}
      >
        <text
          content={translateUi(running ? "TERMINAL GIT · EXECUTANDO…" : "TERMINAL GIT")}
          style={{ fg: running ? COLORS.warning : COLORS.git }}
        />
        <InlineButton label={translateUi("[T] Focar")} accent={COLORS.git} onPress={focus} />
      </box>
      <box style={{ height: 2, flexShrink: 0, overflow: "hidden" }}>
        {visibleLines.length ? (
          visibleLines.map((line) => (
            <text
              key={line.id}
              content={fitLine(line.text, Math.max(8, width - 5))}
              style={{ fg: TONE_COLORS[line.tone] }}
            />
          ))
        ) : (
          <text
            content={fitLine(
              translateUi("Os comandos das ações e suas saídas aparecem aqui."),
              Math.max(8, width - 5),
            )}
            style={{ fg: COLORS.muted }}
          />
        )}
      </box>
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
        <text content="git " style={{ width: 4, flexShrink: 0, fg: COLORS.git }} />
        <input
          ref={inputRef}
          id="git-command-input"
          value={value}
          maxLength={4_096}
          placeholder={translateUi("status --short")}
          onInput={onInput}
          onSubmit={onSubmit}
          onMouseDown={focus}
          onKeyDown={(event) => {
            if (event.name !== "tab" && event.name !== "escape") return
            event.preventDefault()
            event.stopPropagation()
            onNavigate(event.name === "tab" ? "files" : "preview")
          }}
          width={Math.max(8, width - 9)}
          style={{
            backgroundColor: COLORS.panelRaised,
            focusedBackgroundColor: COLORS.panelRaised,
            textColor: COLORS.text,
            focusedTextColor: COLORS.text,
            cursorColor: COLORS.git,
            placeholderColor: COLORS.muted,
          }}
        />
      </box>
    </box>
  )
}
