import { RGBA, StyledText, type TextChunk } from "@opentui/core"
import { translateUi, truncateDisplay } from "../../../shared/i18n/index"
import type { RunnerLogEntry, RunnerLogStreamFilter } from "../model/log"
export type { RunnerLogEntry, RunnerLogStreamFilter } from "../model/log"

export const RUNNER_LOG_BUFFER_LIMIT = 1200
export const RUNNER_LOG_ENTRY_MAX_CHARS = 16_384
export const RUNNER_LOG_BUFFER_MAX_CHARS = 2_000_000
export const RUNNER_LOG_FLUSH_INTERVAL_MS = 80
export const RUNNER_LOG_TRIM_HEADROOM = 200

type RunnerLogPalette = {
  canvas: string
  danger: string
  runner: string
  success: string
  text: string
  warning: string
}

export function appendRunnerLogToBuffer(logs: RunnerLogEntry[], log: RunnerLogEntry) {
  const boundedLog =
    log.text.length > RUNNER_LOG_ENTRY_MAX_CHARS
      ? {
          ...log,
          text: `${log.text.slice(0, RUNNER_LOG_ENTRY_MAX_CHARS - 24)}… [linha truncada]`,
        }
      : log
  logs.push(boundedLog)
  if (logs.length > RUNNER_LOG_BUFFER_LIMIT + RUNNER_LOG_TRIM_HEADROOM) {
    logs.splice(0, logs.length - RUNNER_LOG_BUFFER_LIMIT)
  }
  let characters = logs.reduce((total, entry) => total + entry.text.length, 0)
  while (logs.length > 1 && characters > RUNNER_LOG_BUFFER_MAX_CHARS) {
    characters -= logs.shift()?.text.length ?? 0
  }
  return logs
}

function isErrorLog(log: RunnerLogEntry) {
  return /\b(error|failed|failure|fatal)\b|[×✗]/i.test(log.text)
}

function logPrefix(log: RunnerLogEntry) {
  if (log.stream === "system") return "›"
  if (log.stream === "stderr") return "·"
  return " "
}

export function runnerLogPresentation(log: RunnerLogEntry, palette: RunnerLogPalette) {
  if (isErrorLog(log)) {
    return { color: palette.danger, prefix: "!" }
  }
  if (/\b(success|passed|ready|done)\b|[✓✔]/i.test(log.text)) {
    return { color: palette.success, prefix: logPrefix(log) }
  }
  if (log.stream === "system") {
    return { color: palette.runner, prefix: logPrefix(log) }
  }
  if (log.stream === "stderr") {
    return { color: palette.warning, prefix: logPrefix(log) }
  }
  return { color: palette.text, prefix: logPrefix(log) }
}

export function filterRunnerLogs(
  logs: RunnerLogEntry[],
  stream: RunnerLogStreamFilter,
  query: string,
) {
  const normalizedQuery = query.trim().toLocaleLowerCase()
  if (stream === "all" && !normalizedQuery) return logs
  return logs.filter(
    (log) =>
      (stream === "all" || log.stream === stream) &&
      (!normalizedQuery || log.text.toLocaleLowerCase().includes(normalizedQuery)),
  )
}

function logTimestamp(at: number) {
  return new Date(at).toLocaleTimeString("pt-BR", { hour12: false })
}

function formatRunnerLogLine(
  log: RunnerLogEntry,
  width: number,
  showTimestamps: boolean,
  prefix: string,
) {
  const timestamp = showTimestamps ? `${logTimestamp(log.at)} ` : ""
  const clean = translateUi(`${timestamp}${prefix} ${log.text}`)
    .replace(/\t/g, "  ")
    .replace(/[\r\n]/g, "")
  if (clean.length <= width && /^[\x20-\x7e]*$/.test(clean)) return clean
  return truncateDisplay(clean, width)
}

export function buildRunnerLogDocument(
  logs: RunnerLogEntry[],
  options: {
    width: number
    showTimestamps: boolean
    palette: RunnerLogPalette
  },
) {
  const chunks: TextChunk[] = []
  const colors = new Map<string, RGBA>()
  const background = RGBA.fromHex(options.palette.canvas)
  let previousColor = ""

  for (let index = 0; index < logs.length; index += 1) {
    const log = logs[index]
    if (!log) continue
    const presentation = runnerLogPresentation(log, options.palette)
    const line = formatRunnerLogLine(
      log,
      options.width,
      options.showTimestamps,
      presentation.prefix,
    )
    const text = `${line}${index === logs.length - 1 ? "" : "\n"}`
    const previous = chunks[chunks.length - 1]
    if (previous && previousColor === presentation.color) {
      previous.text += text
      continue
    }
    let foreground = colors.get(presentation.color)
    if (!foreground) {
      foreground = RGBA.fromHex(presentation.color)
      colors.set(presentation.color, foreground)
    }
    chunks.push({
      __isChunk: true,
      text,
      fg: foreground,
      bg: background,
    })
    previousColor = presentation.color
  }

  return new StyledText(chunks)
}

export function serializeRunnerLogs(logs: RunnerLogEntry[]) {
  return logs
    .map((log) => `${new Date(log.at).toISOString()} [${log.stream}] ${log.text}`)
    .join("\n")
}
