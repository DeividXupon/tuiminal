import { useEffect, useRef, type Dispatch, type SetStateAction } from "react"
import type { GitHubCreateDraft } from "../../model/create-item"
import { validateRepositoryName } from "../../model/pr/query"
import { readGitHubRepositoryDefaultBranch } from "../../services/github/repository-default-branch"

export function useGitHubCreateDefaultBase(
  draft: GitHubCreateDraft,
  setDraft: Dispatch<SetStateAction<GitHubCreateDraft>>,
  open: boolean,
  host: string | undefined,
  demo: boolean,
) {
  const manualBaseRef = useRef(false)
  const latestRepositoryRef = useRef(draft.repository)
  latestRepositoryRef.current = draft.repository

  const noteChange = (patch: Partial<GitHubCreateDraft>) => {
    if (patch.repository !== undefined && patch.repository !== latestRepositoryRef.current) {
      manualBaseRef.current = false
      latestRepositoryRef.current = patch.repository
    }
    if (patch.base !== undefined) manualBaseRef.current = true
  }

  const reset = () => {
    manualBaseRef.current = false
  }

  useEffect(() => {
    const repository = draft.repository.trim()
    if (!open || draft.kind !== "pr" || !host || !validateRepositoryName(repository)) return
    const controller = new AbortController()
    const load = async () => {
      try {
        const executable = process.env.TUIMINAL_GH_EXECUTABLE?.trim()
        const base = demo
          ? "main"
          : await readGitHubRepositoryDefaultBranch(host, repository, {
              signal: controller.signal,
              ...(executable ? { executable } : {}),
            })
        if (controller.signal.aborted || manualBaseRef.current) return
        setDraft((current) =>
          current.kind === "pr" &&
          current.repository.trim() === repository &&
          !manualBaseRef.current
            ? { ...current, base }
            : current,
        )
      } catch {
        // A failed suggestion leaves the base picker available for manual selection.
      }
    }
    void load()
    return () => controller.abort()
  }, [demo, draft.kind, draft.repository, host, open, setDraft])

  return { noteChange, reset }
}
