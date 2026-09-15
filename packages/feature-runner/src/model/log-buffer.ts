import type { RunnerLogEntry } from "./log"

export const RUNNER_LOG_BUFFER_LIMIT = 1200
export const RUNNER_LOG_ENTRY_MAX_CHARS = 16_384
export const RUNNER_LOG_BUFFER_MAX_CHARS = 2_000_000
export const RUNNER_LOG_FLUSH_INTERVAL_MS = 80

/** Bounded process output. Append does not scan or copy the retained history. */
export class RunnerLogBuffer {
  private entries: Array<RunnerLogEntry | undefined> = new Array(RUNNER_LOG_BUFFER_LIMIT)
  private head = 0
  private length = 0
  private characters = 0

  constructor(initial: RunnerLogEntry[] = []) {
    for (const log of initial) this.append(log)
  }

  append(log: RunnerLogEntry) {
    const text = log.text
    const entry =
      text.length > RUNNER_LOG_ENTRY_MAX_CHARS
        ? { ...log, text: `${text.slice(0, RUNNER_LOG_ENTRY_MAX_CHARS - 24)}… [linha truncada]` }
        : log
    if (this.length === RUNNER_LOG_BUFFER_LIMIT) this.removeOldest()
    this.entries[(this.head + this.length) % RUNNER_LOG_BUFFER_LIMIT] = entry
    this.length += 1
    this.characters += entry.text.length
    while (this.characters > RUNNER_LOG_BUFFER_MAX_CHARS) this.removeOldest()
  }

  private removeOldest() {
    this.characters -= this.entries[this.head]?.text.length ?? 0
    this.entries[this.head] = undefined
    this.head = (this.head + 1) % RUNNER_LOG_BUFFER_LIMIT
    this.length -= 1
  }

  snapshot() {
    const logs: RunnerLogEntry[] = []
    for (let index = 0; index < this.length; index += 1) {
      const log = this.entries[(this.head + index) % RUNNER_LOG_BUFFER_LIMIT]
      if (log) logs.push(log)
    }
    return logs
  }

  clear() {
    this.entries.fill(undefined)
    this.head = 0
    this.length = 0
    this.characters = 0
  }
}
