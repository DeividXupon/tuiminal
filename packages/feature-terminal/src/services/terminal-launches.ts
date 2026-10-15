import { trackTerminalLaunch } from "./terminal-resources"

export type TerminalLaunch = { signal: AbortSignal; isCurrent: () => boolean }

/** Serializes replacements, including a detached session whose client is not ready yet. */
export class TerminalLaunches {
  private generations = new Map<string, AbortController>()
  private pending = new Map<string, Promise<void>>()

  has(id: string) {
    return this.generations.has(id)
  }

  run(id: string, start: (launch: TerminalLaunch) => Promise<void>) {
    this.generations.get(id)?.abort()
    const controller = new AbortController()
    const previous = this.pending.get(id)
    this.generations.set(id, controller)
    const isCurrent = () => this.generations.get(id) === controller && !controller.signal.aborted
    const task = (async () => {
      if (previous) await previous.catch(() => undefined)
      if (isCurrent()) await start({ signal: controller.signal, isCurrent })
    })()
    this.pending.set(id, task)
    void task
      .finally(() => {
        if (this.pending.get(id) === task) this.pending.delete(id)
      })
      .catch(() => undefined)
    return trackTerminalLaunch(task)
  }

  cancel(id: string) {
    this.generations.get(id)?.abort()
    this.generations.delete(id)
  }

  dispose() {
    for (const id of this.generations.keys()) this.cancel(id)
  }
}
