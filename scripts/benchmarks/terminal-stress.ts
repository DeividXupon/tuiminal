import {
  publishTerminalSidebar,
  resetPinnedTerminalSidebarForTests,
  subscribeTerminalSidebar,
  terminalSidebarSnapshot,
} from "../../packages/feature-terminal/src/model/pinned-sidebar"
import { AgentMonitor } from "../../packages/feature-terminal/src/services/agent-monitor"
import { type BenchmarkCase, defineBenchmark } from "./harness"

export type TerminalStressOptions = {
  outputChunks: number
  monitoredChunks: number
  observedChunks: number
  observationInterval: number
  resizeCycles: number
  sidebarPublications: number
}

export const DEFAULT_TERMINAL_STRESS_OPTIONS: TerminalStressOptions = {
  outputChunks: 20_000,
  monitoredChunks: 5_000,
  observedChunks: 10_000,
  observationInterval: 250,
  resizeCycles: 100,
  sidebarPublications: 100_000,
}

const encoder = new TextEncoder()
const plainChunk = encoder.encode(
  `${"resultado de comando com texto unicode 日本語 e valores 0123456789 ".repeat(4)}\r\n`,
)
const ansiChunk = encoder.encode(
  `\u001b[38;2;120;180;255m${"linha colorida de build 0123456789 ".repeat(4)}\u001b[0m\r\n`,
)
const sidebarView = {
  sessions: [],
  folders: [],
  collapsedFolderIds: [],
  selectedFolder: "default",
  activeSessionId: null,
  width: 24,
  height: 30,
  masterKey: "Ctrl+B" as const,
  recentThreads: [],
  onSelectFolder: () => undefined,
  onToggleFolder: () => undefined,
  onActivate: () => undefined,
  onActions: () => undefined,
  onNew: () => undefined,
  onCommand: () => undefined,
  onFolder: () => undefined,
}

function positiveCount(value: number, name: string) {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`Invalid ${name}`)
  return value
}

function validatedOptions(options: TerminalStressOptions): TerminalStressOptions {
  return {
    outputChunks: positiveCount(options.outputChunks, "output chunk count"),
    monitoredChunks: positiveCount(options.monitoredChunks, "monitored chunk count"),
    observedChunks: positiveCount(options.observedChunks, "observed chunk count"),
    observationInterval: positiveCount(options.observationInterval, "observation interval"),
    resizeCycles: positiveCount(options.resizeCycles, "resize cycle count"),
    sidebarPublications: positiveCount(options.sidebarPublications, "sidebar publication count"),
  }
}

function processOutput(chunk: Uint8Array, chunks: number, captureScreen: boolean) {
  const monitor = new AgentMonitor(120, 30)
  try {
    for (let index = 0; index < chunks; index += 1) monitor.write(chunk)
    return { revision: monitor.revision, screen: captureScreen ? monitor.screen() : "" }
  } finally {
    monitor.dispose()
  }
}

function processObservedOutput(chunks: number, interval: number) {
  const monitor = new AgentMonitor(120, 30)
  let snapshots = 0
  let screen = ""
  try {
    for (let index = 0; index < chunks; index += 1) {
      monitor.write(index % 2 === 0 ? plainChunk : ansiChunk)
      if ((index + 1) % interval === 0 || index + 1 === chunks) {
        screen = monitor.screen()
        snapshots += 1
      }
    }
    return { revision: monitor.revision, screen, snapshots }
  } finally {
    monitor.dispose()
  }
}

function processResizeCycles(cycles: number) {
  const monitor = new AgentMonitor(120, 30)
  let screen = ""
  try {
    for (let index = 0; index < cycles; index += 1) {
      monitor.write(ansiChunk)
      monitor.resize(index % 2 === 0 ? 100 : 140, index % 2 === 0 ? 24 : 36)
      screen = monitor.screen()
    }
    return { revision: monitor.revision, screen }
  } finally {
    monitor.dispose()
  }
}

function publishUnchangedSidebar(publications: number) {
  const owner = {}
  publishTerminalSidebar(owner, sidebarView)
  let notifications = 0
  const unsubscribe = subscribeTerminalSidebar(() => {
    notifications += 1
  })
  try {
    for (let index = 0; index < publications; index += 1) {
      publishTerminalSidebar(owner, sidebarView)
    }
    return {
      notifications,
      retainedView: terminalSidebarSnapshot().view === sidebarView,
    }
  } finally {
    unsubscribe()
  }
}

export function terminalStressBenchmarks(
  requested: TerminalStressOptions = DEFAULT_TERMINAL_STRESS_OPTIONS,
): BenchmarkCase[] {
  const options = validatedOptions(requested)
  const collectGarbage = () => Bun.gc(true)
  return [
    defineBenchmark({
      id: "terminal.stress_output_plain",
      tool: "terminal",
      description: `Process ${options.outputChunks.toLocaleString("en-US")} sustained plain PTY chunks`,
      operationsPerSample: options.outputChunks,
      beforeEach: collectGarbage,
      run: () => processOutput(plainChunk, options.outputChunks, false),
      verify: ({ revision }) => {
        if (revision !== options.outputChunks)
          throw new Error("Sustained plain output dropped chunks")
      },
    }),
    defineBenchmark({
      id: "terminal.stress_output_ansi",
      tool: "terminal",
      description: `Process ${options.outputChunks.toLocaleString("en-US")} sustained ANSI PTY chunks`,
      operationsPerSample: options.outputChunks,
      beforeEach: collectGarbage,
      run: () => processOutput(ansiChunk, options.outputChunks, false),
      verify: ({ revision }) => {
        if (revision !== options.outputChunks)
          throw new Error("Sustained ANSI output dropped chunks")
      },
    }),
    defineBenchmark({
      id: "terminal.stress_output_screen",
      tool: "terminal",
      description: `Process ${options.monitoredChunks.toLocaleString("en-US")} ANSI chunks and compose the agent screen`,
      operationsPerSample: options.monitoredChunks,
      beforeEach: collectGarbage,
      run: () => processOutput(ansiChunk, options.monitoredChunks, true),
      verify: ({ revision, screen }) => {
        if (revision !== options.monitoredChunks || !screen.includes("linha colorida")) {
          throw new Error("Final agent screen did not retain sustained output")
        }
      },
    }),
    defineBenchmark({
      id: "terminal.stress_output_observed",
      tool: "terminal",
      description: `Process ${options.observedChunks.toLocaleString("en-US")} mixed chunks with periodic screen observation`,
      operationsPerSample: options.observedChunks,
      beforeEach: collectGarbage,
      run: () => processObservedOutput(options.observedChunks, options.observationInterval),
      verify: ({ revision, screen, snapshots }) => {
        const expectedSnapshots = Math.ceil(options.observedChunks / options.observationInterval)
        if (
          revision !== options.observedChunks ||
          snapshots !== expectedSnapshots ||
          !(screen.includes("resultado de comando") || screen.includes("linha colorida"))
        ) {
          throw new Error("Periodic agent observation lost output or snapshots")
        }
      },
    }),
    defineBenchmark({
      id: "terminal.stress_output_resize",
      tool: "terminal",
      description: `Process output through ${options.resizeCycles.toLocaleString("en-US")} alternating screen resizes`,
      operationsPerSample: options.resizeCycles,
      beforeEach: collectGarbage,
      run: () => processResizeCycles(options.resizeCycles),
      verify: ({ revision, screen }) => {
        if (revision !== options.resizeCycles * 2 || !screen.includes("linha colorida")) {
          throw new Error("Observed Terminal resize lost output or revisions")
        }
      },
    }),
    defineBenchmark({
      id: "terminal.stress_sidebar_unchanged",
      tool: "terminal",
      description: `Suppress ${options.sidebarPublications.toLocaleString("en-US")} unchanged sidebar publications`,
      operationsPerSample: options.sidebarPublications,
      beforeEach: () => {
        collectGarbage()
        resetPinnedTerminalSidebarForTests()
      },
      afterEach: resetPinnedTerminalSidebarForTests,
      run: () => publishUnchangedSidebar(options.sidebarPublications),
      verify: ({ notifications, retainedView }) => {
        if (notifications !== 0 || !retainedView) {
          throw new Error("Unchanged sidebar publications were not suppressed")
        }
      },
    }),
  ]
}
