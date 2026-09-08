import { useEffect, useRef } from "react"
import { useNotifications, type NotificationInput } from "../../../shared/notifications/index"
import type { HttpDocumentState, HttpExecutionState } from "../model/types"

function completedExecutionId(execution: HttpExecutionState) {
  if (execution.status === "success") return execution.response.executionId
  if (execution.status === "error" || execution.status === "cancelled") {
    return execution.executionId
  }
  return null
}

function executionNotification(document: HttpDocumentState): NotificationInput | null {
  const execution = document.execution
  const requestLabel = `${document.request.method} ${document.request.name}`
  if (execution.status === "success") {
    return {
      source: "HTTP",
      kind: "success",
      message: `${requestLabel}: ${execution.response.status} ${execution.response.statusText}.`,
    }
  }
  if (execution.status === "error") {
    return { source: "HTTP", kind: "error", message: `${requestLabel}: ${execution.message}` }
  }
  if (execution.status === "cancelled") {
    return { source: "HTTP", kind: "warning", message: `${requestLabel}: request cancelado.` }
  }
  return null
}

function trimSeenExecutions(seen: Set<string>) {
  if (seen.size <= 100) return
  const oldest = seen.values().next().value
  if (oldest) seen.delete(oldest)
}

export function useHttpExecutionNotifications(documents: HttpDocumentState[]) {
  const { notify } = useNotifications()
  const seen = useRef(new Set<string>())
  useEffect(() => {
    for (const document of documents) {
      const executionId = completedExecutionId(document.execution)
      if (!executionId || seen.current.has(executionId)) continue
      seen.current.add(executionId)
      trimSeenExecutions(seen.current)
      const notification = executionNotification(document)
      if (notification) notify(notification)
    }
  }, [documents, notify])
}
