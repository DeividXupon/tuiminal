import type { RunnerConfiguredCommand, RunnerHealthCheck, RunnerRestartPolicy } from "./config"

import type { RunnerDependency } from "./config"

export type RunnerCommandCategory =
  | "package"
  | "composer"
  | "php"
  | "python"
  | "go"
  | "rust"
  | "ruby"
  | "java"
  | "dotnet"
  | "deno"
  | "task"
  | "make"
  | "just"
  | "docker"
  | "custom"

export type RunnerCommand = {
  id: string
  label: string
  category: RunnerCommandCategory
  description: string
  program: string
  args: string[]
  displayCommand: string
  source?: RunnerConfiguredCommand["source"] | "detected"
  dependsOn?: RunnerDependency[]
  profile?: string
  workingDirectory?: string
  env?: Record<string, string>
  envFile?: string
  interactive?: boolean
  autostart?: boolean
  restartPolicy?: RunnerRestartPolicy
  restartDelayMs?: number
  maxRestarts?: number
  persistLogs?: boolean
  healthCheck?: RunnerHealthCheck
}

export type RunnerOutputStream = "stdout" | "stderr"

export type RunnerProcessExit = {
  code: number | null
  signal: NodeJS.Signals | null
  stopped: boolean
}

export type RunnerProcessHandle = {
  pid: number | null
  interactive: boolean
  write: (data: string | Uint8Array) => void
  stop: () => Promise<void>
}

export type RunnerListeningPort = {
  groupId: number
  pid: number
  processName: string
  host: string
  port: number
}

export type RunnerProject = {
  path: string
  name: string
  displayPath: string
}

export type RunnerDirectoryEntry = {
  path: string
  name: string
  git: boolean
}

export type RunnerProcessCallbacks = {
  onLine: (line: string, stream: RunnerOutputStream) => void
  onExit: (result: RunnerProcessExit) => void
}
