import type { RunnerOutputStream } from "./types"

export type RunnerLogEntry = {
  id: number
  text: string
  stream: RunnerOutputStream | "system"
  at: number
}
export type RunnerLogStreamFilter = "all" | RunnerLogEntry["stream"]
