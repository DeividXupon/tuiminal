export type RunnerRestartPolicy = "never" | "on-failure" | "always"

export type RunnerHealthCheck =
  | {
      type: "port"
      host: string
      port: number
      timeoutMs: number
    }
  | {
      type: "http"
      url: string
      timeoutMs: number
    }
  | {
      type: "log"
      pattern: string
      timeoutMs: number
    }

export type RunnerConfiguredCommand = {
  id: string
  label: string
  command: string
  description: string
  source: "tuiminal" | "mprocs" | "procfile" | "saved"
  cwd?: string
  env?: Record<string, string>
  envFile?: string
  interactive: boolean
  autostart: boolean
  restartPolicy: RunnerRestartPolicy
  restartDelayMs: number
  maxRestarts: number
  persistLogs: boolean
  healthCheck?: RunnerHealthCheck
}

export type RunnerEnvironmentProfile = {
  id: string
  label: string
  envFile?: string
  env?: Record<string, string>
}

export type RunnerPersistedLog = {
  text: string
  stream: "stdout" | "stderr" | "system"
  at: number
}

export type RunnerPersistedExecution = {
  id: string
  commandId: string
  label: string
  displayCommand: string
  projectRoot: string
  projectName: string
  status: "success" | "failed" | "stopped"
  pid: null
  startedAt: number
  endedAt: number
  exitCode: number | null
  logs: RunnerPersistedLog[]
}

export type RunnerSessionState = {
  openedProjects: string[]
  activeProject: string | null
  viewMode: "single" | "multi"
  environmentProfiles: Record<string, string>
}
