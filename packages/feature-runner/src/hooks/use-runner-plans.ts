import { useCallback, useEffect, useRef, useState } from "react"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { createRunnerPlan, type RunnerFlow } from "../model/plan"
import type { RunnerCommand } from "../model/types"
import { RunnerPlanRun, type RunnerLaunch } from "../services/plan-run"

type Options = {
  projectRoot: string
  commands: RunnerCommand[]
  launchCommand: RunnerLaunch
  notify: (notice: { source: "Runner"; kind: "error"; message: string }) => void
}
export function useRunnerPlans({ projectRoot, commands, launchCommand, notify }: Options) {
  const runs = useRef(new Set<RunnerPlanRun>())
  const flows = useRef(new Map<string, RunnerPlanRun>())
  const operations = useRef(new Map<string, number>())
  const mounted = useRef(true)
  const [, render] = useState(0)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      for (const run of runs.current) void run.stop().catch(() => undefined)
    }
  }, [])
  const start = useCallback(
    (targets: RunnerCommand[], flow?: RunnerFlow) => {
      try {
        for (const previous of runs.current) if (!previous.active) runs.current.delete(previous)
        const catalog = [
          ...commands,
          ...targets.filter((target) => !commands.some((command) => command.id === target.id)),
        ]
        const plan = createRunnerPlan(
          catalog,
          targets.map((command) => command.id),
          flow,
        )
        const run = new RunnerPlanRun(plan, projectRoot, launchCommand, () => {
          if (mounted.current) render((value) => value + 1)
        })
        runs.current.add(run)
        run.start()
        return run
      } catch (error) {
        notify({
          source: "Runner",
          kind: "error",
          message: translateUi(error instanceof Error ? error.message : "Configuração inválida."),
        })
        return undefined
      }
    },
    [commands, launchCommand, notify, projectRoot],
  )
  const runCommand = useCallback(
    (command?: RunnerCommand) => {
      if (command) start([command])
    },
    [start],
  )
  const runTargets = useCallback(
    (targets: RunnerCommand[]) => {
      if (targets.length) start(targets)
    },
    [start],
  )
  const stopTargets = useCallback(
    async (targets: RunnerCommand[]) => {
      const ids = targets.map((command) => command.id)
      await Promise.all(
        [...runs.current]
          .filter((run) => run.root === projectRoot)
          .map((run) => run.stopCommands(ids)),
      )
    },
    [projectRoot],
  )
  const runFlow = useCallback(
    (flow: RunnerFlow) => {
      const key = `${projectRoot}\n${flow.id}`
      const existing = flows.current.get(key)
      if (existing?.active) return
      const run = start([], flow)
      if (run) flows.current.set(key, run)
    },
    [projectRoot, start],
  )
  const stopFlow = useCallback(
    async (flow: RunnerFlow) => {
      const key = `${projectRoot}\n${flow.id}`
      operations.current.set(key, (operations.current.get(key) ?? 0) + 1)
      await flows.current.get(key)?.stop()
    },
    [projectRoot],
  )
  const restartFlow = useCallback(
    async (flow: RunnerFlow) => {
      const key = `${projectRoot}\n${flow.id}`
      const stopped = stopFlow(flow)
      const operation = operations.current.get(key)
      await stopped
      if (mounted.current && operations.current.get(key) === operation) runFlow(flow)
    },
    [projectRoot, runFlow, stopFlow],
  )
  const flowStates = new Map(
    [...flows.current]
      .filter(([key]) => key.startsWith(`${projectRoot}\n`))
      .map(([key, run]) => [key.slice(projectRoot.length + 1), [...run.states.entries()]]),
  )
  return { runCommand, runTargets, stopTargets, runFlow, stopFlow, restartFlow, flowStates }
}
