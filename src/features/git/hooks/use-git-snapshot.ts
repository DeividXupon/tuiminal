import { type Dispatch, type SetStateAction, useCallback, useEffect, useRef, useState } from "react"
import type { ViewMode } from "../model/view"
import { gitSnapshotSignature } from "../rendering/presentation"
import { type GitSnapshot, loadGitDiff, loadGitSnapshot } from "../services/git"

type SnapshotSetters = {
  setSelectedPath: Dispatch<SetStateAction<string | null>>
  setSelectedCommitIndex: Dispatch<SetStateAction<number>>
  setDiff: Dispatch<SetStateAction<string>>
  setCommitDiff: Dispatch<SetStateAction<string>>
}

function applyWhenCurrent(
  generationRef: { current: number },
  generation: number,
  apply: () => void,
) {
  if (generationRef.current === generation) apply()
}

async function synchronizeSnapshot({
  nextSnapshot,
  signatureRef,
  selectedPathRef,
  viewRef,
  setSnapshot,
  setRefreshSequence,
  setters,
}: {
  nextSnapshot: GitSnapshot
  signatureRef: { current: string | null }
  selectedPathRef: { current: string | null }
  viewRef: { current: ViewMode }
  setSnapshot: Dispatch<SetStateAction<GitSnapshot | null>>
  setRefreshSequence: Dispatch<SetStateAction<number>>
  setters: SnapshotSetters
}) {
  const nextSignature = gitSnapshotSignature(nextSnapshot)
  if (signatureRef.current !== nextSignature) {
    signatureRef.current = nextSignature
    setSnapshot(nextSnapshot)
    setRefreshSequence((current) => current + 1)
    setters.setSelectedPath((current) =>
      current && nextSnapshot.files.some((file) => file.path === current)
        ? current
        : (nextSnapshot.files[0]?.path ?? null),
    )
    setters.setSelectedCommitIndex((current) =>
      Math.min(current, Math.max(0, nextSnapshot.commits.length - 1)),
    )
    return
  }
  if (!nextSnapshot.root || viewRef.current !== "diff") return
  const selected = nextSnapshot.files.find((file) => file.path === selectedPathRef.current)
  if (!selected) return
  const nextDiff = await loadGitDiff(nextSnapshot.root, selected)
  setters.setDiff((current) => (current === nextDiff ? current : nextDiff))
}

export function useGitSnapshot({
  active,
  targetDirectory,
  refreshRequest,
  selectedPath,
  view,
  setters,
}: {
  active: boolean
  targetDirectory: string
  refreshRequest: number
  selectedPath: string | null
  view: ViewMode
  setters: SnapshotSetters
}) {
  const [snapshot, setSnapshot] = useState<GitSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshSequence, setRefreshSequence] = useState(0)
  const refreshInFlightRef = useRef<Promise<void> | null>(null)
  const signatureRef = useRef<string | null>(null)
  const selectedPathRef = useRef(selectedPath)
  const viewRef = useRef(view)
  const targetRef = useRef(targetDirectory)
  const generationRef = useRef(0)
  const { setSelectedPath, setSelectedCommitIndex, setDiff, setCommitDiff } = setters
  selectedPathRef.current = selectedPath
  viewRef.current = view

  const refresh = useCallback(
    async (showLoading = true) => {
      if (refreshInFlightRef.current) return refreshInFlightRef.current
      const generation = generationRef.current
      const operation = (async () => {
        if (showLoading) setLoading(true)
        setError(null)
        try {
          const nextSnapshot = await loadGitSnapshot(targetDirectory)
          if (generationRef.current !== generation) return
          await synchronizeSnapshot({
            nextSnapshot,
            signatureRef,
            selectedPathRef,
            viewRef,
            setSnapshot,
            setRefreshSequence,
            setters: { setSelectedPath, setSelectedCommitIndex, setDiff, setCommitDiff },
          })
        } catch (loadError) {
          applyWhenCurrent(generationRef, generation, () => {
            setError(
              loadError instanceof Error
                ? loadError.message
                : "Não foi possível carregar o repositório.",
            )
          })
        } finally {
          applyWhenCurrent(generationRef, generation, () => {
            if (showLoading) setLoading(false)
          })
        }
      })()
      refreshInFlightRef.current = operation
      try {
        await operation
      } finally {
        if (refreshInFlightRef.current === operation) refreshInFlightRef.current = null
      }
    },
    [setCommitDiff, setDiff, setSelectedCommitIndex, setSelectedPath, targetDirectory],
  )

  const updateFiles = useCallback(
    (update: (files: GitSnapshot["files"]) => GitSnapshot["files"]) => {
      setSnapshot((current) => (current ? { ...current, files: update(current.files) } : current))
    },
    [],
  )

  useEffect(() => {
    if (targetRef.current === targetDirectory) return
    targetRef.current = targetDirectory
    generationRef.current += 1
    refreshInFlightRef.current = null
    signatureRef.current = null
    setSnapshot(null)
    setSelectedPath(null)
    setSelectedCommitIndex(0)
    setDiff("")
    setCommitDiff("")
  }, [setCommitDiff, setDiff, setSelectedCommitIndex, setSelectedPath, targetDirectory])

  useEffect(() => {
    if (!active || snapshot) return
    void refresh()
  }, [active, refresh, snapshot])

  useEffect(() => {
    if (active && refreshRequest > 0) void refresh(false)
  }, [active, refresh, refreshRequest])

  useEffect(() => {
    if (!active || !snapshot) return
    const interval = setInterval(() => void refresh(false), 8000)
    return () => clearInterval(interval)
  }, [active, refresh, snapshot])

  return { snapshot, loading, error, setError, refreshSequence, refresh, updateFiles }
}
