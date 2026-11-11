import { useEffect, useState, useRef, type RefObject } from "react"
import type { PostmanApi, PostmanWorkspace } from "../postman/api"
import { countPostmanWorkspaceRequests } from "../postman/request-count"

export function usePostmanRequestCounts(
  apiRef: RefObject<PostmanApi | null>,
  workspaces: PostmanWorkspace[],
  busy: boolean,
) {
  const [counts, setCounts] = useState<Record<string, number | null>>({})
  const completed = useRef<Record<string, number | null>>({})
  useEffect(() => {
    const api = apiRef.current
    if (!api || busy) return
    let disposed = false
    void (async () => {
      // Serialize reads so large accounts do not launch a burst of API requests.
      for (const workspace of workspaces) {
        if (disposed) return
        if (completed.current[workspace.id] !== undefined) continue
        let count: number | null | undefined
        try {
          count = await countPostmanWorkspaceRequests(api, workspace.id, () => disposed)
        } catch {
          count = null
        }
        if (disposed || count === undefined) return
        const result = count
        completed.current[workspace.id] = result
        setCounts((previous) => ({ ...previous, [workspace.id]: result }))
      }
    })()
    return () => {
      disposed = true
    }
  }, [apiRef, workspaces, busy])
  return counts
}
