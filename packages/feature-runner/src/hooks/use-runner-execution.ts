import { basename } from "node:path"
import {
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type SetStateAction,
  type RefObject,
} from "react"
import type { RunnerCommand, RunnerProcessHandle } from "../model/types"
import type { RunnerEnvironmentProfile } from "../model/config"
import {
  executionPlanOutcome,
  runnerShouldRestart,
  runnerLogHealthMatches,
  type RunnerExecution,
  type ExecutionLog,
} from "../model/execution"
import type { RunnerLaunchOptions } from "../services/plan-run"
import { startRunnerProcess, waitForRunnerHealthCheck } from "../services/runner"
import { saveRunnerHistoryEntry as persistHistoryEntry } from "../storage/runner-config"
import { commandKey } from "../rendering/presentation"
import {
  notifyRunnerExit,
  notifyRunnerHealth,
  notifyRunnerStarted,
  runnerExitPresentation,
} from "./use-runner-notifications"

type Options = {
  projectRoot: string
  environmentProfiles: RunnerEnvironmentProfile[]
  profileSelections: Record<string, string>
  setExecutions: Dispatch<SetStateAction<RunnerExecution[]>>
  setNow: (value: number) => void
  appendLog: (id: string, text: string, stream: ExecutionLog["stream"]) => void
  beginLogs: (id: string, log: ExecutionLog) => ExecutionLog[]
  finishLogs: (id: string) => ExecutionLog[]
  logSequence: RefObject<number>
  notify: Parameters<typeof notifyRunnerStarted>[0]
  onStarted: (id: string) => void
}
export function useRunnerExecution({
  projectRoot,
  environmentProfiles,
  profileSelections,
  setExecutions,
  setNow,
  appendLog,
  beginLogs,
  finishLogs,
  logSequence,
  notify,
  onStarted,
}: Options) {
  const mountedRef = useRef(true)
  const handlesRef = useRef(new Map<string, RunnerProcessHandle>())
  const healthControllersRef = useRef(new Map<string, AbortController>())
  const healthTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const restartTimersRef = useRef(new Set<ReturnType<typeof setTimeout>>())
  const executionSequence = useRef(0)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      for (const controller of healthControllersRef.current.values()) controller.abort()
      healthControllersRef.current.clear()
      for (const timer of healthTimersRef.current.values()) clearTimeout(timer)
      healthTimersRef.current.clear()
      for (const timer of restartTimersRef.current) clearTimeout(timer)
      restartTimersRef.current.clear()
      for (const handle of handlesRef.current.values()) void handle.stop().catch(() => undefined)
      handlesRef.current.clear()
    }
  }, [])
  const saveRunnerHistoryEntry = useCallback(
    (entry: Parameters<typeof persistHistoryEntry>[0]) => {
      try {
        persistHistoryEntry(entry)
      } catch (error) {
        notify({ source: "Runner", kind: "error", message: String(error) })
      }
    },
    [notify],
  )
  const launchCommand = useCallback(
    (command: RunnerCommand, options: RunnerLaunchOptions = {}) => {
      if (options.signal?.aborted) {
        options.onSettled?.()
        return
      }
      const executionProjectRoot = options.projectRoot ?? projectRoot
      const restartAttempt = options.restartAttempt ?? 0
      const executionId = `${Date.now()}:${executionSequence.current}`
      executionSequence.current += 1
      const startedAt = Date.now()
      const initialLog: ExecutionLog = {
        id: logSequence.current,
        text: `${restartAttempt ? `reinício ${restartAttempt} · ` : ""}❯ ${command.displayCommand}`,
        stream: "system",
        at: startedAt,
      }
      const execution: RunnerExecution = {
        id: executionId,
        commandId: command.id,
        commandKey: commandKey(executionProjectRoot, command.id),
        label: command.label,
        displayCommand: command.displayCommand,
        projectRoot: executionProjectRoot,
        projectName: basename(executionProjectRoot),
        status: "running",
        pid: null,
        startedAt,
        endedAt: null,
        exitCode: null,
        logs: beginLogs(executionId, initialLog),
        command,
        restartAttempt,
        health: command.healthCheck ? "checking" : "none",
      }
      logSequence.current += 1
      setExecutions((current) => {
        let completedKept = 0
        return [execution, ...current].filter((item) => {
          const running = item.status === "running" || item.status === "stopping"
          if (running) return true
          completedKept += 1
          return completedKept <= 20
        })
      })
      onStarted(executionId)
      setNow(startedAt)

      try {
        let finished = false
        let cancelled = false
        let removeAbort = () => {}
        let healthResolved = false
        const markHealth = (healthy: boolean, detail: string) => {
          if (healthResolved || cancelled || finished || !mountedRef.current) return
          healthResolved = true
          options.onEvent?.(healthy ? "healthy" : "failed")
          const timer = healthTimersRef.current.get(executionId)
          if (timer) clearTimeout(timer)
          healthTimersRef.current.delete(executionId)
          setExecutions((current) =>
            current.map((item) =>
              item.id === executionId
                ? { ...item, health: healthy ? "healthy" : "unhealthy" }
                : item,
            ),
          )
          appendLog(executionId, detail, "system")
          notifyRunnerHealth(notify, command.label, healthy, detail)
        }
        const selectedProfileId = command.profile ?? profileSelections[executionProjectRoot]
        const profile = environmentProfiles.find((candidate) => candidate.id === selectedProfileId)
        const handle = startRunnerProcess(
          executionProjectRoot,
          command,
          {
            onLine: (line, stream) => {
              appendLog(executionId, line, stream)
              if (command.healthCheck?.type === "log" && !healthResolved) {
                const matches = runnerLogHealthMatches(command.healthCheck.pattern, line)
                if (matches) markHealth(true, "health check confirmado pelo log")
              }
            },
            onExit: ({ code, signal, stopped }) => {
              finished = true
              removeAbort()
              options.onEvent?.(
                executionPlanOutcome(
                  stopped || cancelled,
                  code,
                  Boolean(command.healthCheck),
                  healthResolved,
                ),
              )
              handlesRef.current.delete(executionId)
              const missedHealth = Boolean(command.healthCheck && !healthResolved)
              if (missedHealth) {
                healthResolved = true
                appendLog(
                  executionId,
                  "processo encerrou antes de confirmar o health check",
                  "system",
                )
              }
              healthControllersRef.current.get(executionId)?.abort()
              healthControllersRef.current.delete(executionId)
              const healthTimer = healthTimersRef.current.get(executionId)
              if (healthTimer) clearTimeout(healthTimer)
              healthTimersRef.current.delete(executionId)
              if (!mountedRef.current) {
                options.onSettled?.()
                return
              }
              const presentation = runnerExitPresentation({ code, signal, stopped })
              const { status, detail } = presentation
              const endedAt = Date.now()
              appendLog(executionId, detail, "system")
              const logs = finishLogs(executionId)
              setExecutions((current) =>
                current.map((item) =>
                  item.id === executionId
                    ? {
                        ...item,
                        status,
                        endedAt,
                        exitCode: code,
                        health: missedHealth ? "unhealthy" : item.health,
                        logs,
                      }
                    : item,
                ),
              )
              notifyRunnerExit(notify, command.label, presentation)
              const persistedLogs = command.persistLogs
                ? logs.map((log) => ({
                    text: log.text,
                    stream: log.stream,
                    at: log.at,
                  }))
                : []
              saveRunnerHistoryEntry({
                id: executionId,
                commandId: command.id,
                label: command.label,
                displayCommand: command.displayCommand,
                projectRoot: executionProjectRoot,
                projectName: basename(executionProjectRoot),
                status,
                pid: null,
                startedAt,
                endedAt,
                exitCode: code,
                logs: persistedLogs,
              })
              const shouldRestart = runnerShouldRestart(
                command,
                stopped || cancelled || Boolean(options.signal?.aborted),
                code,
                restartAttempt,
              )
              if (shouldRestart) {
                const delay = command.restartDelayMs ?? 1_000
                const timer = setTimeout(() => {
                  options.signal?.removeEventListener("abort", cancelRestart)
                  restartTimersRef.current.delete(timer)
                  if (mountedRef.current && !options.signal?.aborted) {
                    launchCommand(command, {
                      ...options,
                      projectRoot: executionProjectRoot,
                      restartAttempt: restartAttempt + 1,
                    })
                  }
                }, delay)
                const cancelRestart = () => {
                  clearTimeout(timer)
                  restartTimersRef.current.delete(timer)
                  options.onSettled?.()
                }
                options.signal?.addEventListener("abort", cancelRestart, { once: true })
                restartTimersRef.current.add(timer)
              } else options.onSettled?.()
            },
          },
          profile,
        )
        const registerProcessHandle = () => {
          const stop = () => {
            cancelled = true
            options.onEvent?.("stopped")
            healthControllersRef.current.get(executionId)?.abort()
            const timer = healthTimersRef.current.get(executionId)
            if (timer) clearTimeout(timer)
            return handle.stop()
          }
          const abort = () => {
            void stop().catch((error) => {
              options.onSettled?.(error)
              notify({ source: "Runner", kind: "error", message: String(error) })
            })
          }
          options.signal?.addEventListener("abort", abort, { once: true })
          removeAbort = () => options.signal?.removeEventListener("abort", abort)
          if (!finished) handlesRef.current.set(executionId, { ...handle, stop })
          else removeAbort()
          if (options.signal?.aborted) abort()
          if (!cancelled && !finished) options.onEvent?.(handle.pid ? "started" : "failed")
          setExecutions((current) =>
            current.map((item) => (item.id === executionId ? { ...item, pid: handle.pid } : item)),
          )
        }
        registerProcessHandle()
        notifyRunnerStarted(notify, command.label, executionProjectRoot)
        const startHealth = () => {
          if (cancelled || finished || healthResolved) return
          if (command.healthCheck?.type === "log") {
            const timer = setTimeout(() => {
              markHealth(false, "health check por log expirou")
            }, command.healthCheck.timeoutMs)
            healthTimersRef.current.set(executionId, timer)
          } else if (command.healthCheck) {
            const controller = new AbortController()
            healthControllersRef.current.set(executionId, controller)
            void waitForRunnerHealthCheck(command.healthCheck, controller.signal).then(
              (healthy) => {
                healthControllersRef.current.delete(executionId)
                markHealth(healthy, healthy ? "health check aprovado" : "health check expirou")
              },
            )
          }
        }
        startHealth()
      } catch (error) {
        options.onSettled?.()
        options.onEvent?.("failed")
        const endedAt = Date.now()
        const message =
          error instanceof Error ? error.message : "Não foi possível iniciar o comando."
        appendLog(executionId, message, "stderr")
        const logs = finishLogs(executionId)
        setExecutions((current) =>
          current.map((item) =>
            item.id === executionId
              ? {
                  ...item,
                  status: "failed",
                  endedAt,
                  health: command.healthCheck ? "unhealthy" : "none",
                  logs,
                }
              : item,
          ),
        )
        saveRunnerHistoryEntry({
          id: executionId,
          commandId: command.id,
          label: command.label,
          displayCommand: command.displayCommand,
          projectRoot: executionProjectRoot,
          projectName: basename(executionProjectRoot),
          status: "failed",
          pid: null,
          startedAt,
          endedAt,
          exitCode: null,
          logs: command.persistLogs
            ? logs.map((log) => ({
                text: log.text,
                stream: log.stream,
                at: log.at,
              }))
            : [],
        })
        notify({ source: "Runner", kind: "error", message })
      }
    },
    [
      saveRunnerHistoryEntry,
      setExecutions,
      setNow,
      logSequence,
      appendLog,
      beginLogs,
      finishLogs,
      environmentProfiles,
      onStarted,
      notify,
      profileSelections,
      projectRoot,
    ],
  )

  return { launchCommand, handlesRef }
}
