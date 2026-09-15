import type { RunnerLogStreamFilter } from "./log"

export type LogPreferences = {
  filter: string
  stream: RunnerLogStreamFilter
  timestamps: boolean
}
type LogPreferencesAction =
  | { type: "filter"; value: string }
  | { type: "cycle-stream" }
  | { type: "toggle-timestamps" }

export const INITIAL_LOG_PREFERENCES: LogPreferences = {
  filter: "",
  stream: "all",
  timestamps: false,
}
const STREAMS = ["all", "stdout", "stderr", "system"] as const

export function logPreferencesReducer(
  state: LogPreferences,
  action: LogPreferencesAction,
): LogPreferences {
  switch (action.type) {
    case "filter":
      return { ...state, filter: action.value }
    case "cycle-stream":
      return {
        ...state,
        stream: STREAMS[(STREAMS.indexOf(state.stream) + 1) % STREAMS.length] ?? "all",
      }
    case "toggle-timestamps":
      return { ...state, timestamps: !state.timestamps }
  }
}
