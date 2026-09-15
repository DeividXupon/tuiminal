import { useCallback, useEffect, useRef, useState } from "react"
import type {
  HttpProjectRequestItem,
  HttpRequestDefinition,
  HttpVariableContext,
} from "../model/types"
import { createHttpVariableContext } from "../model/variables"
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

function failedRunnerState(error: unknown, aborted: boolean) {
  return {
    error: error instanceof Error ? error.message : String(error),
    status: (aborted ? "cancelled" : "idle") as RunnerStatus,
  }
}

function firstTlsApproval(cases: HttpRunCase[]) {
  for (const result of cases) {
    for (const item of result.items) {
      if (item.error?.approval) return item.error.approval
    }
  }
  return null
}

async function executeDataset(
  context: Omit<Parameters<typeof runHttpCollectionCase>[0], "name" | "variables">,
  datasetPath: string,
  concurrency: number,
) {
  const dataset = datasetPath.trim()
    ? await loadHttpProjectRunnerDataset(context.root, datasetPath.trim())
    : [{ name: "default", values: {} }]
  return runHttpDataset(
    dataset,
    concurrency,
    (testCase) =>
      runHttpCollectionCase({
        ...context,
        name: testCase.name,
        variables: createHttpVariableContext([{ origin: "request", values: testCase.values }]),
      }),
    context.signal,
  )
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
  const lifecycle = useRef({ mounted: true, root })
  lifecycle.current.root = root

  const resetRun = useCallback(() => {
    const controller = controllerRef.current
    controllerRef.current = null
    controller?.abort()
    setStatus("idle")
    setCases([])
    setError("")
    setPendingTlsApproval(null)
  }, [])
  useEffect(() => {
    const owner = lifecycle.current
    if (owner.root !== root) return
    owner.mounted = true
    resetRun()
    return () => {
      owner.mounted = false
      controllerRef.current?.abort()
      controllerRef.current = null
    }
  }, [root, resetRun])

  const open = useCallback(() => {
    resetRun()
    setTargetId((current) =>
      current && items.some((item) => item.request.id === current) ? current : null,
    )
  }, [items, resetRun])
  const cycleTarget = useCallback(() => {
    resetRun()
    setTargetId((current) => {
      const options = [null, ...items.map((item) => item.request.id)]
      const index = options.indexOf(current)
      return options[(index + 1) % options.length] ?? null
    })
  }, [items, resetRun])
  const cycleConcurrency = useCallback(() => {
    setConcurrency((current) => (current >= 8 ? 1 : current + 1))
  }, [])
  const cancel = useCallback(() => controllerRef.current?.abort(), [])

  const run = useCallback(async () => {
    if (!lifecycle.current.mounted || lifecycle.current.root !== root) return
    if (controllerRef.current) {
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
    const current = () =>
      lifecycle.current.mounted &&
      lifecycle.current.root === root &&
      controllerRef.current === controller
    setStatus("running")
    setCases([])
    setError("")
    const context = {
      items,
      ...(selected ? { selector: selected.request.id } : {}),
      variablesForRequest,
      root,
      signal: controller.signal,
      environmentName,
      isInsecureTlsApproved,
      authorizeRedirect,
    }
    try {
      const results = await executeDataset(context, datasetPath, concurrency)
      if (!current()) return
      setCases(results)
      const approval = firstTlsApproval(results)
      setPendingTlsApproval(approval)
      setStatus(completedRunnerStatus(controller.signal.aborted, approval))
    } catch (caught) {
      if (!current()) return
      const failure = failedRunnerState(caught, controller.signal.aborted)
      setError(failure.error)
      setStatus(failure.status)
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
