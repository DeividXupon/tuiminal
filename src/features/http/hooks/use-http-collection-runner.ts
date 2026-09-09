import { useCallback, useRef, useState } from "react"
import type {
  HttpProjectRequestItem,
  HttpRequestDefinition,
  HttpVariableContext,
  HttpVariableValue,
} from "../model/types"
import {
  loadHttpProjectRunnerDataset,
  runHttpCollectionCase,
  runHttpDataset,
  type HttpRunCase,
} from "../services/collection-runner"
import type { HttpInsecureTlsApproval } from "../model/tls-policy"
import type { HttpRedirectAuthorizer } from "../model/redirect-policy"

type RunnerStatus = "idle" | "running" | "complete" | "cancelled"

function completedRunnerStatus(aborted: boolean, approval: HttpInsecureTlsApproval | null) {
  if (aborted) return "cancelled"
  return approval ? "idle" : "complete"
}

export function useHttpCollectionRunner({
  root,
  items,
  variablesForRequest,
  environmentName,
  isInsecureTlsApproved,
  approveInsecureTls,
  authorizeRedirect,
}: {
  root: string
  items: HttpProjectRequestItem[]
  variablesForRequest: (request: HttpRequestDefinition) => HttpVariableContext
  environmentName: string | null
  isInsecureTlsApproved: (approval: HttpInsecureTlsApproval) => boolean
  approveInsecureTls: (approval: HttpInsecureTlsApproval) => void
  authorizeRedirect: HttpRedirectAuthorizer
}) {
  const [targetId, setTargetId] = useState<string | null>(null)
  const [datasetPath, setDatasetPath] = useState("")
  const [concurrency, setConcurrency] = useState(1)
  const [status, setStatus] = useState<RunnerStatus>("idle")
  const [cases, setCases] = useState<HttpRunCase[]>([])
  const [error, setError] = useState("")
  const [pendingTlsApproval, setPendingTlsApproval] = useState<HttpInsecureTlsApproval | null>(null)
  const controllerRef = useRef<AbortController | null>(null)

  const open = useCallback(() => {
    setTargetId((current) =>
      current && items.some((item) => item.request.id === current) ? current : null,
    )
    setStatus("idle")
    setCases([])
    setError("")
    setPendingTlsApproval(null)
  }, [items])
  const cycleTarget = useCallback(() => {
    setTargetId((current) => {
      const options = [null, ...items.map((item) => item.request.id)]
      const index = options.indexOf(current)
      return options[(index + 1) % options.length] ?? null
    })
    setCases([])
    setStatus("idle")
    setPendingTlsApproval(null)
  }, [items])
  const cycleConcurrency = useCallback(() => {
    setConcurrency((current) => (current >= 8 ? 1 : current + 1))
  }, [])
  const cancel = useCallback(() => controllerRef.current?.abort(), [])

  const run = useCallback(async () => {
    if (status === "running") {
      cancel()
      return
    }
    if (!items.length) {
      setError("Nenhum request de projeto para executar.")
      return
    }
    const selected = items.find((item) => item.request.id === targetId)
    const controller = new AbortController()
    controllerRef.current = controller
    setStatus("running")
    setCases([])
    setError("")
    try {
      const dataset = datasetPath.trim()
        ? await loadHttpProjectRunnerDataset(root, datasetPath.trim())
        : [{ name: "default", values: {} }]
      const results = await runHttpDataset(
        dataset,
        concurrency,
        (testCase) => {
          const variables = new Map<string, HttpVariableValue>()
          for (const [name, value] of Object.entries(testCase.values)) {
            variables.set(name, { value, origin: "request", secret: false })
          }
          return runHttpCollectionCase({
            name: testCase.name,
            items,
            ...(selected ? { selector: selected.request.name } : {}),
            variables,
            variablesForRequest,
            root,
            signal: controller.signal,
            environmentName,
            isInsecureTlsApproved,
            authorizeRedirect,
          })
        },
        controller.signal,
      )
      setCases(results)
      const approval = results
        .flatMap((result) => result.items)
        .map((item) => item.error?.approval)
        .find((candidate): candidate is HttpInsecureTlsApproval => Boolean(candidate))
      setPendingTlsApproval(approval ?? null)
      setStatus(completedRunnerStatus(controller.signal.aborted, approval ?? null))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      setStatus(controller.signal.aborted ? "cancelled" : "idle")
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null
    }
  }, [
    cancel,
    authorizeRedirect,
    concurrency,
    datasetPath,
    environmentName,
    isInsecureTlsApproved,
    items,
    root,
    status,
    targetId,
    variablesForRequest,
  ])

  const approvePendingTls = useCallback(() => {
    if (!pendingTlsApproval) return
    approveInsecureTls(pendingTlsApproval)
    setPendingTlsApproval(null)
    setError("")
  }, [approveInsecureTls, pendingTlsApproval])

  return {
    targetId,
    targetName: items.find((item) => item.request.id === targetId)?.request.name ?? null,
    datasetPath,
    setDatasetPath,
    concurrency,
    status,
    cases,
    error,
    pendingTlsApproval,
    approvePendingTls,
    open,
    cycleTarget,
    cycleConcurrency,
    cancel,
    run,
  }
}
