import { displayWidth } from "@xupon/tuiminal-core/i18n/index"
import { cleanAgentTaskTitle } from "../model/agent-task-title"

export const TMUX_SCREEN_FORMAT =
  "#{pane_pid}\t#{pane_dead}\t#{pane_dead_status}\t#{pane_width}\t#{pane_height}\t#{cursor_x}\t#{cursor_y}\t#{cursor_flag}\t#{keypad_cursor_flag}\t#{keypad_flag}\t#{=512:pane_title}"

export function parseTmuxScreen(output: string) {
  const newline = output.indexOf("\n")
  const fields = output.slice(0, newline).split("\t")
  const [pid, dead, code, width, height, x, y, cursor, arrows, keypad, title] = fields
  if (newline < 0 || fields.length !== 11 || !Number(width) || !Number(height))
    throw new Error("Não foi possível ler o painel tmux.")
  return {
    pid: Number(pid),
    dead: dead === "1",
    code: code ? Number(code) : null,
    width: Number(width),
    height: Number(height),
    x: Number(x),
    y: Number(y),
    cursor: cursor === "1",
    arrows: arrows === "1",
    keypad: keypad === "1",
    title: cleanAgentTaskTitle(title!),
    lines: output
      .slice(newline + 1)
      .replace(/\n$/, "")
      .split("\n"),
  }
}

export type TmuxScreen = ReturnType<typeof parseTmuxScreen>
const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" })
const SGR_SEQUENCE = new RegExp(`(${String.fromCharCode(27)}\\[[0-9;:]*m)`, "g")

/** Preserve captured SGR state, including styles beyond the clipped edge. */
function cropLine(line: string, columns: number) {
  if (columns <= 0) return line.match(SGR_SEQUENCE)?.join("") ?? ""
  let width = 0
  let result = ""
  for (const token of line.split(SGR_SEQUENCE)) {
    if (token.startsWith("\x1b[")) {
      result += token
      continue
    }
    const text = token.replace(/[\p{Cc}]/gu, "")
    if (/^[\x20-\x7e]*$/.test(text)) {
      result += text.slice(0, Math.max(0, columns - width))
      width += text.length
      continue
    }
    const tokenWidth = displayWidth(text)
    if (width + tokenWidth <= columns) result += text
    else if (width < columns) {
      let used = width
      for (const { segment } of graphemes.segment(text)) {
        used += displayWidth(segment)
        if (used > columns) break
        result += segment
      }
    }
    width += tokenWidth
  }
  return result
}

function viewportTop(screen: TmuxScreen, rows: number) {
  return Math.max(0, Math.min(screen.height - rows, screen.y - rows + 1))
}

function firstChangedRow(screen: TmuxScreen, previous: TmuxScreen, end: number) {
  for (let index = 0; index < end; index++) {
    if (screen.lines[index] !== previous.lines[index]) return index
  }
  return end
}

/** Repaint only the changed tail, preserving attributes inherited from earlier rows. */
function renderLines(
  screen: TmuxScreen,
  columns: number,
  rows: number,
  top: number,
  first: number,
) {
  if (first >= top + rows) return ""
  let output = ""
  // Erase with default attributes before restoring captured colors. This also
  // removes deleted/shortened rows without clearing the rest of the terminal.
  for (let row = Math.max(top, first); row < top + rows; row++) {
    output += `\x1b[${row - top + 1};1H\x1b[2K`
  }
  for (let index = 0; index < Math.min(screen.lines.length, top + rows); index++) {
    const line = screen.lines[index]!
    if (index < top || index < first) output += cropLine(line, 0)
    else output += `\x1b[${index - top + 1};1H${cropLine(line, columns)}`
  }
  return output
}

/** Render a viewport without ever resizing or selecting the external pane.
 * Omit previous after a local viewport resize to force a complete repaint.
 */
export function renderTmuxScreen(
  screen: TmuxScreen,
  columns: number,
  rows: number,
  previous?: TmuxScreen,
) {
  const top = viewportTop(screen, rows)
  const full =
    !previous ||
    previous.width !== screen.width ||
    previous.height !== screen.height ||
    viewportTop(previous, rows) !== top
  const first = full ? top : firstChangedRow(screen, previous, top + rows)
  let output = "\x1b[?25l\x1b[0m"
  if (!previous || previous.title !== screen.title) {
    output += `\x1b]2;${cleanAgentTaskTitle(screen.title)}\x07`
  }
  if (full) output += "\x1b[2J\x1b[H"
  output += renderLines(screen, columns, rows, top, first)
  output += `\x1b[0m\x1b[?1${screen.arrows ? "h" : "l"}`
  output += screen.keypad ? "\x1b=" : "\x1b>"
  // Keep paste distinguishable from typing; tmux applies the source's paste mode.
  output += "\x1b[?2004h"
  const y = screen.y - top
  output += `\x1b[${Math.max(1, Math.min(rows, y + 1))};${Math.max(1, Math.min(columns, screen.x + 1))}H`
  if (screen.cursor && y >= 0 && y < rows && screen.x < columns) output += "\x1b[?25h"
  return output
}
