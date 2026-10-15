import "../tests/tui/setup"
import { test } from "bun:test"
import { writeFileSync } from "node:fs"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act, type ReactNode, useState } from "react"
import type { RemoteProjectSyncReview } from "../packages/feature-terminal/src/model/remote-project-sync"
import { RemoteCodexCompatibilityModal } from "../packages/feature-terminal/src/ui/RemoteCodexCompatibilityModal"
import { RemoteProjectSyncDialog } from "../packages/feature-terminal/src/ui/RemoteProjectSyncDialog"
import { RemoteProjectSyncPreviewDialog } from "../packages/feature-terminal/src/ui/RemoteProjectSyncPreviewDialog"
import { RemoteProjectSyncProgressDialog } from "../packages/feature-terminal/src/ui/RemoteProjectSyncProgressDialog"
import { type BenchmarkCase, defineBenchmark, measureBenchmark } from "./benchmarks/harness"

function benchmarkCounts() {
  const samples = Number(process.env.BENCHMARK_SAMPLES ?? 20)
  const warmup = Number(process.env.BENCHMARK_WARMUP ?? 3)
  if (!Number.isSafeInteger(samples) || samples < 1) throw new Error("Invalid BENCHMARK_SAMPLES")
  if (!Number.isSafeInteger(warmup) || warmup < 0) throw new Error("Invalid BENCHMARK_WARMUP")
  return { samples, warmup }
}

const review: RemoteProjectSyncReview = {
  jobId: "benchmark-review",
  localPath: "/local/project-sync",
  changeCount: 400,
  counts: { add: 67, update: 266, delete: 47, conflict: 20 },
  hasLocalChanges: true,
  legacyLocalChanges: false,
  difference: "both",
  indicator: { changeCount: 400, difference: "both" },
  offset: 0,
  pageSize: 200,
  changes: Array.from({ length: 200 }, (_, index) => ({
    path: `src/feature-${index}/benchmark-${index}.ts`,
    action:
      index % 3 === 0
        ? ("add" as const)
        : index % 7 === 0
          ? ("delete" as const)
          : ("update" as const),
    localChanged: index % 10 === 0,
    remoteChanged: true,
    transferBytes: 1_024 + index,
  })),
}

let tui: TestRendererSetup | undefined
let reveal: (() => void) | undefined

function HiddenModal({ content }: { content: ReactNode }) {
  const [visible, setVisible] = useState(false)
  reveal = () => setVisible(true)
  return visible ? content : <text content="READY" />
}

async function prepareModal(content: ReactNode, width: number, height: number) {
  if (tui) throw new Error("A previous Terminal remote modal benchmark is still mounted")
  tui = await act(async () => testRender(<HiddenModal content={content} />, { width, height }))
  await tui.renderOnce()
}

async function revealModal(id: string) {
  const show = reveal
  const mounted = tui
  if (!show || !mounted) throw new Error(`Terminal remote modal ${id} was not prepared`)
  await act(async () => show())
  for (let attempt = 0; attempt < 100; attempt += 1) {
    await act(async () => mounted.renderOnce())
    if (mounted.renderer.root.findDescendantById(id)) return mounted.captureCharFrame()
    await act(async () => Bun.sleep(5))
  }
  throw new Error(`Terminal remote modal ${id} did not render`)
}

function closeModal() {
  const mounted = tui
  tui = undefined
  reveal = undefined
  act(() => mounted?.renderer.destroy())
}

test("Terminal remote dialog latency in the native renderer", async () => {
  const { samples, warmup } = benchmarkCounts()
  const cases: BenchmarkCase[] = [
    defineBenchmark({
      id: "ui.terminal_remote_compatibility",
      tool: "terminal",
      description: "Open a remote provider compatibility modal to its rendered update actions",
      beforeEach: () =>
        prepareModal(
          <RemoteCodexCompatibilityModal
            report={{
              providerId: "codex",
              compatible: false,
              reason: "versionMismatch",
              localVersion: "0.157.1",
              remoteVersion: "0.156.0",
              daemonAvailable: true,
              proxyAvailable: true,
            }}
            profileName="benchmark-server"
            onCancel={() => undefined}
            onOpenGuide={() => undefined}
          />,
          90,
          18,
        ),
      afterEach: closeModal,
      run: () => revealModal("remote-codex-compatibility-modal"),
      verify: (frame) => {
        if (
          !frame.includes("benchmark-server") ||
          !tui?.renderer.root.findDescendantById("remote-codex-compatibility-guide")
        )
          throw new Error("Remote compatibility modal omitted its profile or update action")
      },
    }),
    defineBenchmark({
      id: "ui.terminal_project_sync_preview",
      tool: "terminal",
      description: "Open a 200-row remote project synchronization review",
      beforeEach: () =>
        prepareModal(
          <RemoteProjectSyncPreviewDialog
            review={review}
            automatic
            onToggleAutomatic={() => undefined}
            onPage={() => undefined}
            onConfirm={() => undefined}
            onClose={() => undefined}
          />,
          100,
          28,
        ),
      afterEach: closeModal,
      run: () => revealModal("terminal-project-sync-preview"),
      verify: () => {
        if (
          !tui?.renderer.root.findDescendantById("terminal-project-sync-change-0") ||
          !tui.renderer.root.findDescendantById("terminal-project-sync-next-page") ||
          !tui.renderer.root.findDescendantById("terminal-project-sync-confirm-changes")
        )
          throw new Error("Project synchronization review omitted its rows or actions")
      },
    }),
    defineBenchmark({
      id: "ui.terminal_project_sync_progress",
      tool: "terminal",
      description: "Open remote project synchronization transfer progress",
      beforeEach: () =>
        prepareModal(
          <RemoteProjectSyncProgressDialog
            localPath="/local/project-sync"
            status={{
              kind: "syncing",
              localPath: "/local/project-sync",
              phase: "transferring",
              progress: 0.5,
            }}
            automatic={false}
            onToggleAutomatic={() => undefined}
            onCancel={() => undefined}
          />,
          90,
          18,
        ),
      afterEach: closeModal,
      run: () => revealModal("terminal-project-sync-progress"),
      verify: (frame) => {
        if (
          !frame.includes("50%") ||
          !tui?.renderer.root.findDescendantById("terminal-project-sync-cancel-progress")
        )
          throw new Error("Project synchronization progress omitted its state or cancel action")
      },
    }),
    defineBenchmark({
      id: "ui.terminal_project_sync_confirmation",
      tool: "terminal",
      description: "Open destructive remote project synchronization confirmation",
      beforeEach: () =>
        prepareModal(
          <RemoteProjectSyncDialog
            kind="replace"
            localPath="/local/project-sync"
            onConfirm={() => undefined}
            onClose={() => undefined}
          />,
          90,
          18,
        ),
      afterEach: closeModal,
      run: () => revealModal("terminal-project-sync-confirm"),
      verify: () => {
        if (
          !tui?.renderer.root.findDescendantById("terminal-project-sync-confirm-action") ||
          !tui.renderer.root.findDescendantById("terminal-project-sync-cancel-confirm")
        )
          throw new Error("Project synchronization confirmation omitted an action")
      },
    }),
  ]
  const results = []
  try {
    for (const benchmark of cases) {
      const result = await measureBenchmark(benchmark, samples, warmup)
      results.push(result)
      console.log(
        `${result.id.padEnd(42)} p50 ${result.p50Ms.toFixed(3)} ms  p95 ${result.p95Ms.toFixed(3)} ms`,
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
    closeModal()
  }
}, 120_000)
