import {
  type InputRenderable,
  type KeyEvent,
  RGBA,
  type ScrollBoxRenderable,
  StyledText,
} from "@opentui/core"
import { useMemo, useRef } from "react"
import { COLORS, focusedPanelBorder, LAYOUT } from "../../../../core/settings/theme"
import { translateUi } from "../../../../shared/i18n"
import { InlineButton } from "../../../../shared/ui/InlineButton"
import { ShortcutText } from "../../../../shared/ui/ShortcutText"
import type { GitCommandCompletion } from "../../model/git-command-autocomplete"
import type { GitCommandConsoleLine } from "../../model/git-command-console"
import { fitLine } from "../../rendering/diff"
import { GitCommandSuggestions } from "./GitCommandSuggestions"

const TONE_COLORS: Record<GitCommandConsoleLine["tone"], string> = {
  command: COLORS.git,
  output: COLORS.text,
  success: COLORS.success,
  error: COLORS.danger,
  muted: COLORS.muted,
}

const GIT_COMMAND_OUTPUT_ROWS = 7

function consumeKey(event: KeyEvent) {
  event.preventDefault()
  event.stopPropagation()
}

function autocompleteNavigationDelta(event: KeyEvent): -1 | 1 | null {
  if (!event.ctrl) return null
  if (event.name === "n") return 1
  if (event.name === "p") return -1
  return null
}

function outputScrollDelta(event: KeyEvent) {
  if (event.name === "up") return -1
  if (event.name === "down") return 1
  return 0
}

function movesInputCursor(event: KeyEvent) {
  return ["left", "right", "home", "end"].includes(event.name)
}

function commandConsoleDocument(lines: GitCommandConsoleLine[]) {
  const colors = new Map<string, RGBA>()
  const background = RGBA.fromHex(COLORS.panel)
  const color = (value: string) => {
    const cached = colors.get(value)
    if (cached) return cached
    const parsed = RGBA.fromHex(value)
    colors.set(value, parsed)
    return parsed
  }
  return new StyledText(
    lines.map((line, index) => ({
      __isChunk: true as const,
      text: `${line.text}${index === lines.length - 1 ? "" : "\n"}`,
      fg: color(TONE_COLORS[line.tone]),
      bg: background,
    })),
  )
}

export function gitCommandConsoleHeight(compact: boolean) {
  return compact ? GIT_COMMAND_OUTPUT_ROWS + 2 : GIT_COMMAND_OUTPUT_ROWS + 4
}

export function GitCommandConsole({
  width,
  focused,
  expanded,
  running,
  lines,
  value,
  autocomplete,
  onInput,
  onSubmit,
  onFocus,
  onNavigate,
  onToggleExpanded,
}: {
  width: number
  focused: boolean
  expanded: boolean
  running: boolean
  lines: GitCommandConsoleLine[]
  value: string
  autocomplete: {
    suggestions: readonly GitCommandCompletion[]
    selectedIndex: number
    open: boolean
    syncCursor: (cursorOffset: number) => void
    navigate: (delta: -1 | 1) => boolean
    apply: (index?: number, cursorOffset?: number) => number | null
    dismiss: () => boolean
  }
  onInput: (value: string, cursorOffset?: number) => void
  onSubmit: () => void
  onFocus: () => void
  onNavigate: (pane: "files" | "preview") => void
  onToggleExpanded: () => void
}) {
  const inputRef = useRef<InputRenderable | null>(null)
  const outputRef = useRef<ScrollBoxRenderable | null>(null)
  const focus = () => {
    onFocus()
    setTimeout(() => inputRef.current?.focus(), 0)
  }
  const syncCursorAfterKey = () => {
    setTimeout(() => autocomplete.syncCursor(inputRef.current?.cursorOffset ?? value.length), 0)
  }
  const applySuggestion = (index = autocomplete.selectedIndex) => {
    const nextCursor = autocomplete.apply(index, inputRef.current?.cursorOffset ?? value.length)
    if (nextCursor === null) return false
    setTimeout(() => {
      if (!inputRef.current) return
      inputRef.current.focus()
      inputRef.current.cursorOffset = nextCursor
    }, 0)
    return true
  }
  const handleAutocompleteKey = (event: KeyEvent) => {
    const delta = autocompleteNavigationDelta(event)
    if (delta && autocomplete.navigate(delta)) {
      consumeKey(event)
      return true
    }
    if (event.ctrl && event.name === "y" && applySuggestion()) {
      consumeKey(event)
      return true
    }
    if (event.name === "escape" && autocomplete.dismiss()) {
      consumeKey(event)
      return true
    }
    return false
  }
  const handleOutputKey = (event: KeyEvent) => {
    const delta = outputScrollDelta(event)
    if (!delta) return false
    consumeKey(event)
    outputRef.current?.scrollBy(delta)
    return true
  }
  const handlePanelKey = (event: KeyEvent) => {
    if (event.name === "f10") {
      consumeKey(event)
      onToggleExpanded()
      return
    }
    if (movesInputCursor(event)) {
      syncCursorAfterKey()
      return
    }
    if (event.name !== "tab" && event.name !== "escape") return
    consumeKey(event)
    onNavigate(event.name === "tab" ? "files" : "preview")
  }
  const handleInputKey = (event: KeyEvent) => {
    if (event.defaultPrevented || handleAutocompleteKey(event) || handleOutputKey(event)) return
    handlePanelKey(event)
  }
  const paletteKey = Object.values(TONE_COLORS).join("\0")
  const outputDocument = useMemo(() => {
    void paletteKey
    return commandConsoleDocument(lines)
  }, [lines, paletteKey])
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: the panel focuses its Git input.
    <box
      id="git-command-console"
      onMouseDown={(event) => {
        event.stopPropagation()
        focus()
      }}
      style={{
        ...(expanded
          ? {
              flexGrow: 1,
              flexShrink: 1,
            }
          : { height: gitCommandConsoleHeight(LAYOUT.compact), flexShrink: 0 }),
        width: "100%",
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
        <box style={{ flexDirection: "row", height: 1, flexShrink: 0 }}>
          {focused && lines.length > GIT_COMMAND_OUTPUT_ROWS ? (
            <ShortcutText
              content={` ${translateUi("[↑/↓] Rolar · mouse")} `}
              style={{ fg: COLORS.muted }}
            />
          ) : null}
          {/* biome-ignore lint/a11y/noStaticElementInteractions: F10 provides keyboard access to the same stable mouse target. */}
          <box
            id="git-command-console-expand"
            onMouseUp={(event) => {
              if (event.button !== 0) return
              event.stopPropagation()
              onToggleExpanded()
            }}
            style={{ height: 1, flexShrink: 0 }}
          >
            <ShortcutText
              content={` ${translateUi(expanded ? "[F10] Restaurar" : "[F10] Maximizar")} `}
              style={{
                fg: expanded ? COLORS.git : COLORS.muted,
                bg: expanded && !LAYOUT.compact ? COLORS.panelRaised : "transparent",
              }}
            />
          </box>
          <InlineButton label={translateUi("[T] Focar")} accent={COLORS.git} onPress={focus} />
        </box>
      </box>
      <scrollbox
        ref={outputRef}
        id="git-command-output"
        focusable={false}
        scrollY
        stickyScroll
        stickyStart="bottom"
        viewportCulling
        style={
          expanded
            ? { flexGrow: 1, flexShrink: 1, overflow: "hidden", justifyContent: "flex-end" }
            : { height: GIT_COMMAND_OUTPUT_ROWS, flexShrink: 0, overflow: "hidden" }
        }
        verticalScrollbarOptions={{
          trackOptions: {
            backgroundColor: COLORS.panel,
            foregroundColor: COLORS.border,
          },
        }}
      >
        {lines.length ? (
          <text
            content={outputDocument}
            wrapMode="none"
            style={{ width: "100%", height: lines.length, flexShrink: 0, bg: COLORS.panel }}
          />
        ) : (
          <text
            content={fitLine(
              translateUi("Os comandos das ações e suas saídas aparecem aqui."),
              Math.max(8, width - 5),
            )}
            style={{ fg: COLORS.muted }}
          />
        )}
      </scrollbox>
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
        <text content="git " style={{ width: 4, flexShrink: 0, fg: COLORS.git }} />
        <input
          ref={inputRef}
          id="git-command-input"
          value={value}
          maxLength={4_096}
          placeholder={translateUi("status --short")}
          onInput={(nextValue) =>
            onInput(nextValue, inputRef.current?.cursorOffset ?? nextValue.length)
          }
          onSubmit={onSubmit}
          onMouseDown={focus}
          onKeyDown={handleInputKey}
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
      {focused && autocomplete.open ? (
        <GitCommandSuggestions
          suggestions={autocomplete.suggestions}
          selectedIndex={autocomplete.selectedIndex}
          width={Math.max(8, width - 5)}
          onSelect={(index) => {
            applySuggestion(index)
          }}
        />
      ) : null}
    </box>
  )
}
