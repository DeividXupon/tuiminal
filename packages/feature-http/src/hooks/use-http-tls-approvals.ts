import { useCallback, useRef } from "react"
import type { HttpInsecureTlsApproval } from "../model/tls-policy"

export function useHttpTlsApprovals() {
  const approved = useRef(new Set<string>())
  const isApproved = useCallback(
    (approval: HttpInsecureTlsApproval) => approved.current.has(approval.key),
    [],
  )
  const approve = useCallback((approval: HttpInsecureTlsApproval) => {
    approved.current.add(approval.key)
  }, [])
  return { isApproved, approve }
}
