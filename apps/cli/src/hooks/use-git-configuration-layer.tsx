import { useCallback, useState } from "react"

export function useGitConfigurationLayer() {
  const [revision, setRevision] = useState(0)
  const [localRevision, setLocalRevision] = useState(0)
  const onChanged = useCallback((change: "local" | "remote") => {
    if (change === "local") setLocalRevision((current) => current + 1)
    else setRevision((current) => current + 1)
  }, [])
  return {
    revision,
    localRevision,
    onChanged,
  }
}
