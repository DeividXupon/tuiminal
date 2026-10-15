import { runnerPlanTransitions, type RunnerNodeStatus, type RunnerPlan } from "../model/plan"
import type { RunnerCommand } from "../model/types"

export type RunnerLaunchOptions = {
  projectRoot?: string
  restartAttempt?: number
  signal?: AbortSignal
  onSettled?: (error?: unknown) => void
  onEvent?: (status: RunnerNodeStatus) => void
}
export type RunnerLaunch = (command: RunnerCommand, options: RunnerLaunchOptions) => void

/** Owns exactly the executions it starts, including their scheduled restarts. */
export class RunnerPlanRun {
  readonly states = new Map<string, RunnerNodeStatus>()
  private readonly controllers = new Map<string, AbortController>()
  private readonly completions = new Map<string, Promise<unknown>>()
  private activeLaunches = 0
  private queued = false
  private cancelled = false

  constructor(
    readonly plan: RunnerPlan,
    readonly root: string,
    private launch: RunnerLaunch,
    private changed: () => void = () => {},
  ) {
    for (const node of plan) this.states.set(node.command.id, "pending")
  }

  get active() {
    return this.activeLaunches > 0 || [...this.states.values()].some((state) => state === "pending")
  }

  start() {
    this.schedule()
  }

  private schedule() {
    if (this.queued || this.cancelled) return
    this.queued = true
    queueMicrotask(() => {
      this.queued = false
      this.advance()
    })
  }

  private event(id: string, status: RunnerNodeStatus) {
    const previous = this.states.get(id)!
    if (["failed", "blocked", "stopped", "success"].includes(previous)) return
    if (previous === "healthy" && status === "started") return
    this.states.set(id, status)
    this.changed()
    this.schedule()
  }

  private advance() {
    if (this.cancelled) return
    const { blocked, ready } = runnerPlanTransitions(this.plan, this.states)
    for (const id of blocked) this.event(id, "blocked")
    for (const id of ready) {
      if (this.cancelled) break
      // A synchronous launch failure can invalidate another ready node.
      if (!runnerPlanTransitions(this.plan, this.states).ready.includes(id)) continue
      const controller = new AbortController()
      this.controllers.set(id, controller)
      this.states.set(id, "starting")
      this.activeLaunches += 1
      let settled: (error?: unknown) => void = () => {}
      this.completions.set(
        id,
        new Promise<unknown>((resolve) => {
          let finished = false
          settled = (error) => {
            if (finished) return
            finished = true
            this.activeLaunches -= 1
            resolve(error)
            this.changed()
          }
        }),
      )
      try {
        this.launch(this.plan.find((node) => node.command.id === id)!.command, {
          projectRoot: this.root,
          signal: controller.signal,
          onSettled: settled,
          onEvent: (status) => this.event(id, status),
        })
      } catch {
        settled()
        this.event(id, "failed")
      }
    }
    this.changed()
  }

  async stopCommands(ids: string[]) {
    for (const id of ids) {
      const status = this.states.get(id)
      if (status && ["pending", "starting", "started", "healthy"].includes(status))
        this.states.set(id, "stopped")
      this.controllers.get(id)?.abort()
    }
    this.changed()
    this.schedule()
    const outcomes = await Promise.all(ids.map((id) => this.completions.get(id)))
    const failure = outcomes.find((outcome) => outcome !== undefined)
    if (failure) throw failure
  }

  stop() {
    this.cancelled = true
    return this.stopCommands([...this.states.keys()])
  }
}
