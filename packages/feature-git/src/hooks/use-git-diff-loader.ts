import { type Dispatch, type SetStateAction, useEffect, useRef } from "react"
import type { GitFile } from "../model/types"
import { loadGitDiff } from "../services/git"

type GitDiffLoaderOptions = {
  active: boolean
  root: string | null | undefined
  target: GitFile | null
  refreshSequence: number
  setDiff: Dispatch<SetStateAction<string>>
  setLoadedDiffPath: Dispatch<SetStateAction<string | null>>
  setDiffOffset: Dispatch<SetStateAction<number>>
  setDiffLoading: Dispatch<SetStateAction<boolean>>
}

export function useGitDiffLoader({
  active,
  root,
  target,
  refreshSequence,
  setDiff,
  setLoadedDiffPath,
  setDiffOffset,
  setDiffLoading,
}: GitDiffLoaderOptions) {
  const targetPath = target?.path
  const targetRef = useRef(target)
  const loadedTargetRef = useRef<string | null>(null)
  targetRef.current = target

  useEffect(() => {
    if (!active) return
    void refreshSequence
    const currentTarget = targetRef.current
    if (!root || !currentTarget || !targetPath) {
      loadedTargetRef.current = null
      setLoadedDiffPath(null)
      setDiff("")
      return
    }

    const targetKey = `${root}:${targetPath}`
    const pathChanged = loadedTargetRef.current !== targetKey
    let cancelled = false
    if (pathChanged) {
      setDiffOffset(0)
      setDiffLoading(true)
    }
    void loadGitDiff(root, currentTarget)
      .then((nextDiff) => {
        if (!cancelled) {
          setDiff(nextDiff)
          setLoadedDiffPath(currentTarget.path)
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setDiff(error instanceof Error ? error.message : "Não foi possível carregar o diff.")
          setLoadedDiffPath(currentTarget.path)
        }
      })
      .finally(() => {
        if (!cancelled) {
          loadedTargetRef.current = targetKey
          if (pathChanged) setDiffLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [
    active,
    refreshSequence,
    root,
    setDiff,
    setDiffLoading,
    setDiffOffset,
    setLoadedDiffPath,
    targetPath,
  ])
}
