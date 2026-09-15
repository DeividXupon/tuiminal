import { useEffect, useState } from "react"
import { gitDiffsTargetForScope } from "../model/local-target"
import { GIT_LAUNCH_DIRECTORY, resolveGitProjectContext } from "../services/git"
import { loadGitDiffsConfig } from "../storage/local/config"

export function useLocalGitTargetRoot(configurationRevision: number) {
  const [root, setRoot] = useState(GIT_LAUNCH_DIRECTORY)

  useEffect(() => {
    void configurationRevision
    let cancelled = false
    void (async () => {
      const launch = await resolveGitProjectContext()
      const fallback = launch.isRepository ? launch.root : launch.launchDirectory
      const loaded = loadGitDiffsConfig()
      const selected = gitDiffsTargetForScope(loaded.config, launch.root, fallback)
      const target = await resolveGitProjectContext(selected)
      if (!cancelled) setRoot(target.isRepository ? target.root : fallback)
    })()
    return () => {
      cancelled = true
    }
  }, [configurationRevision])

  return root
}
