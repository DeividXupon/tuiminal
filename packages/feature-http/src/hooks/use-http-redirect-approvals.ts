import { useCallback, useEffect, useState, useSyncExternalStore } from "react"
import { HttpRedirectApprovalQueue } from "../services/redirect-approvals"
import { httpInsecureTlsApproval, type HttpInsecureTlsApproval } from "../model/tls-policy"

export function useHttpRedirectApprovals(approveTls: (approval: HttpInsecureTlsApproval) => void) {
  const [queue] = useState(() => new HttpRedirectApprovalQueue())
  const pending = useSyncExternalStore(queue.subscribe, queue.snapshot, queue.snapshot)
  useEffect(() => {
    queue.activate()
    return () => queue.dispose()
  }, [queue])
  const decide = useCallback(
    (id: number, allowed: boolean) => {
      const current = queue.snapshot()
      if (current?.id !== id) return
      if (allowed && current.approval.risks.includes("insecure-tls")) {
        approveTls(
          httpInsecureTlsApproval(
            current.approval.toOrigin,
            current.approval.environmentName ?? null,
          ),
        )
      }
      queue.decide(id, allowed)
    },
    [approveTls, queue],
  )
  return { pending, authorize: queue.request, decide }
}
