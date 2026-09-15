import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react"
import type { RunnerExecution } from "../model/execution"
import type { RunnerLogEntry } from "../model/log"
import { RunnerLogBuffer, RUNNER_LOG_FLUSH_INTERVAL_MS } from "../model/log-buffer"

/** One bounded buffer per running execution; React receives snapshots only on a flush. */
export function useRunnerLogBuffer(setExecutions: Dispatch<SetStateAction<RunnerExecution[]>>) {
  const buffers = useRef(new Map<string, RunnerLogBuffer>())
  const dirty = useRef(new Set<string>())
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      if (timer.current) clearTimeout(timer.current)
      timer.current = null
      dirty.current.clear()
      buffers.current.clear()
    }
  }, [])

  const flush = useCallback(() => {
    timer.current = null
    if (!mounted.current || !dirty.current.size) return
    const snapshots = new Map<string, RunnerLogEntry[]>()
    for (const id of dirty.current) {
      const buffer = buffers.current.get(id)
      if (buffer) snapshots.set(id, buffer.snapshot())
    }
    dirty.current.clear()
    setExecutions((current) =>
      current.map((execution) => {
        const logs = snapshots.get(execution.id)
        return logs ? { ...execution, logs } : execution
      }),
    )
  }, [setExecutions])

  const begin = useCallback((id: string, initial: RunnerLogEntry) => {
    const buffer = new RunnerLogBuffer([initial])
    buffers.current.set(id, buffer)
    return buffer.snapshot()
  }, [])

  const append = useCallback(
    (id: string, log: RunnerLogEntry) => {
      const buffer = buffers.current.get(id)
      if (!mounted.current || !buffer) return
      buffer.append(log)
      dirty.current.add(id)
      if (!timer.current) timer.current = setTimeout(flush, RUNNER_LOG_FLUSH_INTERVAL_MS)
    },
    [flush],
  )

  const finish = useCallback((id: string) => {
    const logs = buffers.current.get(id)?.snapshot() ?? []
    buffers.current.delete(id)
    dirty.current.delete(id)
    return logs
  }, [])

  const clear = useCallback(
    (id: string) => {
      buffers.current.get(id)?.clear()
      dirty.current.delete(id)
      setExecutions((current) =>
        current.map((execution) => (execution.id === id ? { ...execution, logs: [] } : execution)),
      )
    },
    [setExecutions],
  )

  return { begin, append, finish, clear }
}
