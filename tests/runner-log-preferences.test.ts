import { expect, test } from "bun:test"
import {
  INITIAL_LOG_PREFERENCES,
  logPreferencesReducer,
} from "../packages/feature-runner/src/model/log-preferences"

test("log preferences transition independently without mutating previous state", () => {
  let state = logPreferencesReducer(INITIAL_LOG_PREFERENCES, { type: "filter", value: "error" })
  state = logPreferencesReducer(state, { type: "toggle-timestamps" })
  for (const stream of ["stdout", "stderr", "system", "all"] as const) {
    state = logPreferencesReducer(state, { type: "cycle-stream" })
    expect(state).toEqual({ filter: "error", stream, timestamps: true })
  }
  expect(INITIAL_LOG_PREFERENCES).toEqual({ filter: "", stream: "all", timestamps: false })
})
