import {
  publishTerminalSidebar,
  resetPinnedTerminalSidebarForTests,
  subscribeTerminalSidebar,
} from "../packages/feature-terminal/src/model/pinned-sidebar"
import { AgentMonitor } from "../packages/feature-terminal/src/services/agent-monitor"

type Measurement = {
  name: string
  samples: number[]
  p50: number
  p95: number
}

const encoder = new TextEncoder()
const plainChunk = encoder.encode(
  `${"resultado de comando com texto unicode 日本語 e valores 0123456789 ".repeat(4)}\r\n`,
)
const ansiChunk = encoder.encode(
  `\u001b[38;2;120;180;255m${"linha colorida de build 0123456789 ".repeat(4)}\u001b[0m\r\n`,
)

function percentile(values: number[], fraction: number) {
  const ordered = [...values].sort((left, right) => left - right)
  return ordered[Math.min(ordered.length - 1, Math.floor(ordered.length * fraction))] ?? 0
}

function measure(name: string, operation: () => void): Measurement {
  operation()
  const samples = Array.from({ length: 7 }, () => {
    Bun.gc(true)
    const startedAt = performance.now()
    operation()
    return performance.now() - startedAt
  })
  return {
    name,
    samples,
    p50: percentile(samples, 0.5),
    p95: percentile(samples, 0.95),
  }
}

function writeBurst(chunk: Uint8Array, chunks: number, inspectScreen: boolean) {
  const monitor = new AgentMonitor(120, 30)
  for (let index = 0; index < chunks; index += 1) monitor.write(chunk)
  if (inspectScreen) monitor.screen()
  monitor.dispose()
}

const sidebarOwner = {}
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

function publishUnchangedSidebar(iterations: number) {
  resetPinnedTerminalSidebarForTests()
  publishTerminalSidebar(sidebarOwner, sidebarView)
  let notifications = 0
  const unsubscribe = subscribeTerminalSidebar(() => notifications++)
  for (let index = 0; index < iterations; index += 1) {
    publishTerminalSidebar(sidebarOwner, sidebarView)
  }
  unsubscribe()
  if (notifications) throw new Error(`A sidebar publicou ${notifications} atualizações idênticas.`)
}

const results = [
  measure("shell comum: 20 mil chunks sem inspeção de agente", () => {
    writeBurst(plainChunk, 20_000, false)
  }),
  measure("shell ANSI: 20 mil chunks sem inspeção de agente", () => {
    writeBurst(ansiChunk, 20_000, false)
  }),
  measure("agente monitorado: 5 mil chunks + captura da tela", () => {
    writeBurst(ansiChunk, 5_000, true)
  }),
  measure("sidebar: 100 mil publicações idênticas", () => {
    publishUnchangedSidebar(100_000)
  }),
]

console.log("Benchmark Free Terminal local (7 amostras após aquecimento; sem rede)")
for (const result of results) {
  console.log(`${result.name}: p50=${result.p50.toFixed(2)}ms p95=${result.p95.toFixed(2)}ms`)
}
