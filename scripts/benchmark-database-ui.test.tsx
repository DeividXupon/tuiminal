import "../tests/tui/setup"
import { Database } from "bun:sqlite"
import { test } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ScrollBoxRenderable, TextareaRenderable, TextRenderable } from "@opentui/core"
import { testRender } from "@opentui/react/test-utils"
import { act, createElement } from "react"
import { getUiSettings, updateUiSettings } from "../packages/core/src/settings/theme"
import { DatabaseViewer } from "../packages/feature-database/src/DatabaseWorkspace"
import {
  addDatabaseConnection,
  getDefaultDatabaseConnectionId,
  removeDatabaseConnection,
  setDefaultDatabaseConnection,
} from "../packages/feature-database/src/services/database"
import { defineBenchmark, measureBenchmark } from "./benchmarks/harness"

function benchmarkCounts() {
  const samples = Number(process.env.BENCHMARK_SAMPLES ?? 20)
  const warmup = Number(process.env.BENCHMARK_WARMUP ?? 3)
  if (!Number.isSafeInteger(samples) || samples < 1) throw new Error("Invalid BENCHMARK_SAMPLES")
  if (!Number.isSafeInteger(warmup) || warmup < 0) throw new Error("Invalid BENCHMARK_WARMUP")
  return { samples, warmup }
}

test("Database catalog, grid and SQL latency in the native interface", async () => {
  if (!process.env.XDG_CONFIG_HOME || !process.env.TUIMINAL_WORKDIR) {
    throw new Error("Missing isolated Database TUI fixture")
  }
  const { samples, warmup } = benchmarkCounts()
  const root = mkdtempSync(join(tmpdir(), "tuiminal-benchmark-database-ui-"))
  const filename = join(root, "fixture.sqlite")
  const previousSettings = getUiSettings()
  const previousDefault = getDefaultDatabaseConnectionId()
  let connectionId = ""
  let tui: Awaited<ReturnType<typeof testRender>> | undefined

  function summary() {
    const value = tui?.renderer.root.findDescendantById("database-table-summary")
    return value instanceof TextRenderable
      ? value.content.chunks.map((chunk) => chunk.text).join("")
      : ""
  }
  async function waitFor(condition: () => boolean, label: string) {
    for (let attempt = 0; attempt < 150; attempt += 1) {
      await act(async () => {
        await Bun.sleep(10)
        await tui?.renderOnce()
      })
      if (condition()) return tui?.captureCharFrame() ?? ""
    }
    throw new Error(`Database UI did not show ${label}:\n${tui?.captureCharFrame()}`)
  }
  async function press(key: string, options: { ctrl?: boolean } = {}) {
    await act(async () => tui?.mockInput.pressKey(key, options))
    await tui?.renderOnce()
  }
  async function openTable() {
    await press("ARROW_DOWN")
    await press("RETURN")
    await waitFor(() => summary().includes("1–50 ↓"), "first table window")
  }
  async function reset(mode: "catalog" | "grid" | "query" | "query-window") {
    if (tui) {
      act(() => tui?.renderer.destroy())
      tui = undefined
    }
    tui = await act(async () =>
      testRender(createElement(DatabaseViewer, { active: true }), { width: 140, height: 36 }),
    )
    await waitFor(() => (tui?.captureCharFrame() ?? "").includes("▦ demo"), "catalog table")
    if (mode === "catalog") return
    if (mode === "grid") {
      await openTable()
      return
    }
    await press("w")
    await waitFor(
      () =>
        tui?.renderer.root.findDescendantById("database-query-sql-1-editor") instanceof
        TextareaRenderable,
      "SQL editor",
    )
    await act(async () =>
      tui?.mockInput.typeText(
        mode === "query-window"
          ? "SELECT id, name FROM demo ORDER BY id"
          : "SELECT id, name FROM demo WHERE id = 160",
      ),
    )
    await press("ARROW_LEFT")
    if (mode === "query-window") {
      await press("a", { ctrl: true })
      await waitFor(
        () =>
          tui?.renderer.root.findDescendantById("database-query-sql-1-result-row-49") !== undefined,
        "first SQL result window",
      )
      const results = tui?.renderer.root.findDescendantById("database-query-sql-1-results")
      if (!(results instanceof ScrollBoxRenderable)) throw new Error("Missing SQL result grid")
      await act(async () => results.focus())
      await waitFor(
        () => tui?.renderer.currentFocusedRenderable?.id === "database-query-sql-1-results",
        "focused SQL result grid",
      )
    }
  }

  try {
    const database = new Database(filename, { create: true })
    try {
      database.exec("CREATE TABLE demo (id INTEGER PRIMARY KEY, name TEXT)")
      const insert = database.prepare("INSERT INTO demo VALUES (?, ?)")
      database.transaction(() => {
        for (let id = 1; id <= 160; id += 1) insert.run(id, `row ${id}`)
      })()
    } finally {
      database.close()
    }
    const { profile } = await addDatabaseConnection(
      { name: "Benchmark", driver: "sqlite", filename, ssl: false, writeEnabled: false },
      "",
      false,
    )
    connectionId = profile.id
    setDefaultDatabaseConnection(connectionId)
    updateUiSettings({ layout: "compact", language: "pt-BR" })
    const cases = [
      defineBenchmark({
        id: "ui.database_catalog_open",
        tool: "database",
        description: "Open a catalog table by keyboard to its rendered 50-row grid",
        beforeEach: () => reset("catalog"),
        run: async () => {
          await openTable()
          return { frame: tui?.captureCharFrame() ?? "", summary: summary() }
        },
        verify: ({ frame, summary }) => {
          if (!summary.includes("1–50 ↓") || !frame.includes("row 1")) {
            throw new Error("Catalog table did not render its first grid window")
          }
        },
      }),
      defineBenchmark({
        id: "ui.database_catalog_filter_open",
        tool: "database",
        description: "Filter the catalog and open its matching table to a rendered grid",
        beforeEach: () => reset("catalog"),
        run: async () => {
          await press("/")
          await act(async () => tui?.mockInput.typeText("demo"))
          await press("RETURN")
          await press("RETURN")
          return waitFor(() => summary().includes("1–50 ↓"), "filtered table grid")
        },
        verify: (frame) => {
          if (!frame.includes("row 1") || !summary().includes("1–50 ↓")) {
            throw new Error("Filtered catalog did not open its table")
          }
        },
      }),
      defineBenchmark({
        id: "ui.database_grid_window",
        tool: "database",
        description: "Navigate 50 rows and load the next 40-row grid window",
        beforeEach: () => reset("grid"),
        run: async () => {
          await act(async () => {
            for (let index = 0; index < 49; index += 1) tui?.mockInput.pressKey("ARROW_DOWN")
          })
          await press("ARROW_DOWN")
          const frame = await waitFor(() => summary().includes("41–90 ↑↓"), "next grid window")
          return { frame, summary: summary() }
        },
        verify: ({ frame, summary }) => {
          if (
            !summary.includes("41–90 ↑↓") ||
            !frame.includes("row 50") ||
            !tui?.renderer.root.findDescendantById("database-row-49")
          ) {
            throw new Error("Grid did not render the next sliding window")
          }
        },
      }),
      defineBenchmark({
        id: "ui.database_grid_search",
        tool: "database",
        description: "Search all grid columns from the table modal to a rendered matching row",
        beforeEach: () => reset("grid"),
        run: async () => {
          await press("s")
          await waitFor(
            () => tui?.renderer.currentFocusedRenderable?.id === "database-table-search-value",
            "focused table search",
          )
          await act(async () => tui?.mockInput.typeText("row 160"))
          await press("RETURN")
          return waitFor(
            () => (tui?.captureCharFrame() ?? "").includes("row 160") && summary().includes("1–1"),
            "filtered grid result",
          )
        },
        verify: (frame) => {
          if (!frame.includes("row 160") || !summary().includes("1–1")) {
            throw new Error("Grid search did not render its matching row")
          }
        },
      }),
      defineBenchmark({
        id: "ui.database_grid_sort",
        tool: "database",
        description: "Cycle the grid sort to descending order and render the highest row",
        beforeEach: () => reset("grid"),
        run: async () => {
          await press("o")
          await waitFor(() => (tui?.captureCharFrame() ?? "").includes("[O]↑"), "ascending sort")
          await press("o")
          return waitFor(
            () =>
              (tui?.captureCharFrame() ?? "").includes("[O]↓") &&
              (tui?.captureCharFrame() ?? "").includes("row 160"),
            "descending grid result",
          )
        },
        verify: (frame) => {
          if (!frame.includes("[O]↓") || !frame.includes("row 160")) {
            throw new Error("Grid did not render descending order")
          }
        },
      }),
      defineBenchmark({
        id: "ui.database_sql_execute",
        tool: "database",
        description: "Execute a SQLite editor query by keyboard to its rendered result",
        beforeEach: () => reset("query"),
        run: async () => {
          await press("a", { ctrl: true })
          return waitFor(
            () => (tui?.captureCharFrame() ?? "").includes("row 160"),
            "SQL query result",
          )
        },
        verify: (frame) => {
          if (!frame.includes("row 160")) throw new Error("SQL result was not rendered")
        },
      }),
      defineBenchmark({
        id: "ui.database_sql_window",
        tool: "database",
        description: "Navigate 50 SQL result rows and render the next 40-row window",
        beforeEach: () => reset("query-window"),
        run: async () => {
          for (let index = 0; index < 49; index += 1) await press("ARROW_DOWN")
          await press("ARROW_DOWN")
          return waitFor(
            () => (tui?.captureCharFrame() ?? "").includes("41–90 linhas ↑↓"),
            "next SQL result window",
          )
        },
        verify: (frame) => {
          if (
            !frame.includes("41–90 linhas ↑↓") ||
            !tui?.renderer.root.findDescendantById("database-query-sql-1-result-row-49")
          ) {
            throw new Error("SQL result did not render its next sliding window")
          }
        },
      }),
    ]
    const results = []
    for (const benchmark of cases) {
      const result = await measureBenchmark(benchmark, samples, warmup)
      results.push(result)
      console.log(
        `${result.id.padEnd(36)} p50 ${result.p50Ms.toFixed(3)} ms  p95 ${result.p95Ms.toFixed(3)} ms`,
      )
    }
    if (process.env.BENCHMARK_OUTPUT) {
      writeFileSync(
        process.env.BENCHMARK_OUTPUT,
        `${JSON.stringify(
          {
            schemaVersion: 1,
            createdAt: new Date().toISOString(),
            runtime: { bun: Bun.version, platform: process.platform, arch: process.arch },
            configuration: { samples, warmup },
            results,
          },
          null,
          2,
        )}\n`,
      )
    }
  } finally {
    if (tui) act(() => tui?.renderer.destroy())
    if (connectionId) await removeDatabaseConnection(connectionId)
    if (previousDefault) setDefaultDatabaseConnection(previousDefault)
    updateUiSettings(previousSettings)
    rmSync(root, { recursive: true, force: true })
  }
}, 300_000)
