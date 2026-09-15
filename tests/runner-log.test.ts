import { describe, expect, test } from "bun:test"
import type { ChildProcess } from "node:child_process"
import { PassThrough } from "node:stream"
import {
  buildRunnerLogDocument,
  filterRunnerLogs,
  type RunnerLogEntry,
  runnerLogPresentation,
  serializeRunnerLogs,
} from "../packages/feature-runner/src/rendering/log-document"
import {
  RunnerLogBuffer,
  RUNNER_LOG_BUFFER_LIMIT,
  RUNNER_LOG_BUFFER_MAX_CHARS,
  RUNNER_LOG_ENTRY_MAX_CHARS,
  RUNNER_LOG_FLUSH_INTERVAL_MS,
} from "../packages/feature-runner/src/model/log-buffer"
import { pipeLines } from "../packages/feature-runner/src/services/process"
import { getLanguage, setLanguage } from "../packages/core/src/i18n"

const palette = {
  canvas: "#000000",
  danger: "#ff0000",
  runner: "#00ffff",
  success: "#00ff00",
  text: "#ffffff",
  warning: "#ffff00",
}

function runnerLog(
  id: number,
  text: string,
  stream: RunnerLogEntry["stream"] = "stdout",
): RunnerLogEntry {
  return { id, text, stream, at: 1_700_000_000_000 + id }
}

describe("Runner log rendering", () => {
  test("changing UI language never translates child-process output", () => {
    const previous = getLanguage()
    try {
      setLanguage("en")
      const document = buildRunnerLogDocument([runnerLog(1, "Nenhum processo ativo.")], {
        width: 80,
        showTimestamps: false,
        palette,
      })
      expect(document.chunks[0]?.text).toBe("  Nenhum processo ativo.")
    } finally {
      setLanguage(previous)
    }
  })

  test("collapses a full same-style buffer into one native text chunk", () => {
    const logs = Array.from({ length: RUNNER_LOG_BUFFER_LIMIT }, (_, index) =>
      runnerLog(index, `linha ${index}`),
    )

    const document = buildRunnerLogDocument(logs, {
      width: 30,
      showTimestamps: false,
      palette,
    })

    expect(document.chunks).toHaveLength(1)
    expect(document.chunks[0]?.text.split("\n")).toHaveLength(RUNNER_LOG_BUFFER_LIMIT)
    expect(document.chunks[0]?.text.endsWith("\n")).toBe(false)
  })

  test("retains stream prefixes and semantic color boundaries", () => {
    const logs = [
      runnerLog(1, "regular"),
      runnerLog(2, "warning", "stderr"),
      runnerLog(3, "ready", "system"),
      runnerLog(4, "fatal failure", "system"),
    ]
    const document = buildRunnerLogDocument(logs, {
      width: 30,
      showTimestamps: false,
      palette,
    })

    expect(document.chunks).toHaveLength(4)
    expect(document.chunks.map((chunk) => chunk.text).join("")).toBe(
      "  regular\n· warning\n› ready\n! fatal failure",
    )
    expect(runnerLogPresentation(logs[1] as RunnerLogEntry, palette)).toEqual({
      color: palette.warning,
      prefix: "·",
    })
  })

  test("filters only when needed and serializes lazily usable output", () => {
    const logs: [RunnerLogEntry, RunnerLogEntry] = [
      runnerLog(1, "server ready"),
      runnerLog(2, "fatal failure", "stderr"),
    ]

    expect(filterRunnerLogs(logs, "all", "")).toBe(logs)
    expect(filterRunnerLogs(logs, "stderr", "FAIL")).toEqual([logs[1]])
    expect(serializeRunnerLogs(logs)).toContain("[stderr] fatal failure")
    expect(RUNNER_LOG_FLUSH_INTERVAL_MS).toBeGreaterThanOrEqual(50)
  })

  test("retains ordered snapshots across multiple ring wraps without rescanning old text", () => {
    const buffer = new RunnerLogBuffer()
    let reads = 0
    const total = RUNNER_LOG_BUFFER_LIMIT * 5
    for (let index = 0; index < total; index += 1) {
      buffer.append({
        ...runnerLog(index, ""),
        get text() {
          reads += 1
          return `linha ${index}`
        },
      })
    }
    expect(reads).toBeLessThan(total * 4)
    const previous = buffer.snapshot()
    expect(previous.map((entry) => entry.id)).toEqual(
      Array.from(
        { length: RUNNER_LOG_BUFFER_LIMIT },
        (_, index) => total - RUNNER_LOG_BUFFER_LIMIT + index,
      ),
    )
    buffer.append(runnerLog(total, "last"))
    expect(buffer.snapshot()[0]?.id).toBe(total - RUNNER_LOG_BUFFER_LIMIT + 1)
    expect(previous.at(-1)?.id).toBe(total - 1)
    buffer.clear()
    expect(buffer.snapshot()).toEqual([])
    buffer.append(runnerLog(total + 1, "after clear"))
    expect(buffer.snapshot()).toEqual([runnerLog(total + 1, "after clear")])
  })

  test("bounds individual and aggregate logs even without line breaks", () => {
    const buffer = new RunnerLogBuffer()
    for (let index = 0; index < 300; index += 1) {
      buffer.append(runnerLog(index, "x".repeat(RUNNER_LOG_ENTRY_MAX_CHARS * 2)))
    }
    const logs = buffer.snapshot()
    expect(Math.max(...logs.map((entry) => entry.text.length))).toBeLessThanOrEqual(
      RUNNER_LOG_ENTRY_MAX_CHARS,
    )
    expect(logs.reduce((total, entry) => total + entry.text.length, 0)).toBeLessThanOrEqual(
      RUNNER_LOG_BUFFER_MAX_CHARS,
    )
    expect(logs.at(-1)?.text).toContain("truncada")
    expect(logs.at(-1)?.id).toBe(299)
    buffer.clear()
    buffer.append(runnerLog(300, "next"))
    expect(buffer.snapshot()).toEqual([runnerLog(300, "next")])
  })

  test("bounds seeded history with the same limits as live output", () => {
    const initial = Array.from({ length: 3_000 }, (_, id) => runnerLog(id, "line"))
    const buffer = new RunnerLogBuffer(initial)
    expect(buffer.snapshot()).toEqual(initial.slice(-RUNNER_LOG_BUFFER_LIMIT))
    expect(initial).toHaveLength(3_000)
  })

  test("flushes a continuous process stream in bounded fragments", async () => {
    const stdout = new PassThrough()
    const lines: string[] = []
    pipeLines({ stdout } as unknown as ChildProcess, "stdout", (line) => lines.push(line))
    stdout.end("x".repeat(2_000_000))
    await new Promise((resolve) => stdout.once("close", resolve))
    expect(lines.length).toBeGreaterThan(100)
    expect(Math.max(...lines.map((line) => line.length))).toBeLessThanOrEqual(
      RUNNER_LOG_ENTRY_MAX_CHARS,
    )
    expect(lines.at(-1)?.length).toBeGreaterThan(0)
  })

  test("keeps wide Unicode log lines inside the terminal width", () => {
    const document = buildRunnerLogDocument([runnerLog(1, "界界界")], {
      width: 5,
      showTimestamps: false,
      palette,
    })

    expect(document.chunks[0]?.text).toBe("  界…")
  })
})
