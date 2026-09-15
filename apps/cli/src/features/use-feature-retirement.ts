import { useCallback, useEffect, useRef, useState } from "react"
import { shutdownTools } from "../feature-registry"
import type { FeatureId } from "./model"

export function useFeatureRetirement() {
  const [closed, setClosed] = useState<ReadonlySet<FeatureId>>(() => new Set())
  const pending = useRef<{
    id: FeatureId
    resolve: () => void
    reject: (error: Error) => void
  } | null>(null)
  // App has removed the tool tree by this commit, including its effect cleanups.
  useEffect(() => {
    const operation = pending.current
    if (!operation || !closed.has(operation.id)) return
    pending.current = null
    void shutdownTools([operation.id]).then((results) => {
      if (results.some((result) => result.status === "rejected"))
        operation.reject(new Error("Unable to close feature resources"))
      else operation.resolve()
    }, operation.reject)
  }, [closed])
  useEffect(
    () => () => {
      pending.current?.reject(new Error("Workspace closed before feature retirement"))
      pending.current = null
    },
    [],
  )
  const retire = useCallback(
    (id: FeatureId) =>
      new Promise<void>((resolve, reject) => {
        if (pending.current) return reject(new Error("Feature retirement is already pending"))
        pending.current = { id, resolve, reject }
        setClosed((current) => new Set([...current, id]))
      }),
    [],
  )
  const resume = useCallback(
    (id: FeatureId) =>
      setClosed((current) => {
        if (!current.has(id)) return current
        const next = new Set(current)
        next.delete(id)
        return next
      }),
    [],
  )
  return { closed, retire, resume }
}
