import { type Dispatch, type SetStateAction, useCallback, useEffect, useRef, useState } from "react"
import type { ViewMode } from "../model/view"
import { gitSnapshotSignature } from "../rendering/presentation"
import {
  type GitSnapshot,
  loadGitCommitHistory,
  loadGitDiff,
  loadGitFiles,
  loadGitRefSignature,
  loadGitWorkingTreeSnapshot,
} from "../services/git"

type SnapshotSetters = {
  setSelectedPath: Dispatch<SetStateAction<string | null>>
  setSelectedCommitIndex: Dispatch<SetStateAction<number>>
  setDiff: Dispatch<SetStateAction<string>>
  setCommitDiff: Dispatch<SetStateAction<string>>
}

type MutableRef<Value> = { current: Value }

type CommitHistoryUpdate = {
  commits: GitSnapshot["commits"]
  signature: string
}

function applyWhenCurrent(
  generationRef: { current: number },
  generation: number,
  apply: () => void,
) {
  if (generationRef.current === generation) apply()
}

function refreshIsCurrent({
  generationRef,
  generation,
  filesRevisionRef,
  filesRevision,
}: {
  generationRef: MutableRef<number>
  generation: number
  filesRevisionRef: MutableRef<number>
  filesRevision: number
}) {
  return generationRef.current === generation && filesRevisionRef.current === filesRevision
}

function mergeExistingHistory(workingTree: GitSnapshot, current: GitSnapshot | null) {
  return {
    ...workingTree,
    commits: current?.root === workingTree.root ? current.commits : workingTree.commits,
  }
}

async function loadCommitHistoryUpdate(
  root: string,
  previousSignature: string | null,
): Promise<CommitHistoryUpdate | null> {
  const signature = await loadGitRefSignature(root)
  if (signature === previousSignature) return null
  return { commits: await loadGitCommitHistory(root), signature }
}

function applyCommitHistory({
  root,
  update,
  snapshotRef,
  signatureRef,
  historySignatureRef,
  setSnapshot,
  setSelectedCommitIndex,
}: {
  root: string
  update: CommitHistoryUpdate
  snapshotRef: MutableRef<GitSnapshot | null>
  signatureRef: MutableRef<string | null>
  historySignatureRef: MutableRef<string | null>
  setSnapshot: Dispatch<SetStateAction<GitSnapshot | null>>
  setSelectedCommitIndex: Dispatch<SetStateAction<number>>
}) {
  const latest = snapshotRef.current
  if (latest?.root !== root) return
  const withHistory = { ...latest, commits: update.commits }
  historySignatureRef.current = update.signature
  signatureRef.current = gitSnapshotSignature(withHistory)
  snapshotRef.current = withHistory
  setSnapshot(withHistory)
  setSelectedCommitIndex((selected) => Math.min(selected, Math.max(0, update.commits.length - 1)))
}

function gitLoadErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

async function refreshCommitHistory({
  workingTree,
  generation,
  generationRef,
  snapshotRef,
  signatureRef,
  historySignatureRef,
  setSnapshot,
  setSelectedCommitIndex,
}: {
  workingTree: GitSnapshot
  generation: number
  generationRef: MutableRef<number>
  snapshotRef: MutableRef<GitSnapshot | null>
  signatureRef: MutableRef<string | null>
  historySignatureRef: MutableRef<string | null>
  setSnapshot: Dispatch<SetStateAction<GitSnapshot | null>>
  setSelectedCommitIndex: Dispatch<SetStateAction<number>>
}) {
  const root = workingTree.root
  if (!root || generationRef.current !== generation) return
  const knownSignature = snapshotRef.current?.root === root ? historySignatureRef.current : null
  const update = await loadCommitHistoryUpdate(root, knownSignature)
  if (!update || generationRef.current !== generation) return
  applyCommitHistory({
    root,
    update,
    snapshotRef,
    signatureRef,
    historySignatureRef,
    setSnapshot,
    setSelectedCommitIndex,
  })
}

async function synchronizeSnapshot({
  nextSnapshot,
  signatureRef,
  selectedPathRef,
  viewRef,
  setSnapshot,
  snapshotRef,
  setRefreshSequence,
  setters,
}: {
  nextSnapshot: GitSnapshot
  signatureRef: { current: string | null }
  selectedPathRef: { current: string | null }
  viewRef: { current: ViewMode }
  setSnapshot: Dispatch<SetStateAction<GitSnapshot | null>>
  snapshotRef: { current: GitSnapshot | null }
  setRefreshSequence: Dispatch<SetStateAction<number>>
  setters: SnapshotSetters
}) {
  const nextSignature = gitSnapshotSignature(nextSnapshot)
  if (signatureRef.current !== nextSignature) {
    signatureRef.current = nextSignature
    snapshotRef.current = nextSnapshot
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
  const snapshotRef = useRef<GitSnapshot | null>(null)
  const signatureRef = useRef<string | null>(null)
  const historySignatureRef = useRef<string | null>(null)
  const filesRevisionRef = useRef(0)
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
      const filesRevision = filesRevisionRef.current
      const operation = (async () => {
        if (showLoading) setLoading(true)
        setError(null)
        try {
          const workingTree = await loadGitWorkingTreeSnapshot(targetDirectory)
          if (!refreshIsCurrent({ generationRef, generation, filesRevisionRef, filesRevision }))
            return
          const nextSnapshot = mergeExistingHistory(workingTree, snapshotRef.current)
          await synchronizeSnapshot({
            nextSnapshot,
            signatureRef,
            selectedPathRef,
            viewRef,
            setSnapshot,
            snapshotRef,
            setRefreshSequence,
            setters: { setSelectedPath, setSelectedCommitIndex, setDiff, setCommitDiff },
          })
          if (showLoading) setLoading(false)
          await refreshCommitHistory({
            workingTree,
            generation,
            generationRef,
            snapshotRef,
            signatureRef,
            historySignatureRef,
            setSnapshot,
            setSelectedCommitIndex,
          })
        } catch (loadError) {
          applyWhenCurrent(generationRef, generation, () => {
            setError(gitLoadErrorMessage(loadError, "Não foi possível carregar o repositório."))
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
      const current = snapshotRef.current
      if (!current) return
      filesRevisionRef.current += 1
      const next = { ...current, files: update(current.files) }
      snapshotRef.current = next
      setSnapshot(next)
    },
    [],
  )

  const refreshFiles = useCallback(async () => {
    const generation = generationRef.current
    const filesRevision = filesRevisionRef.current
    const root = snapshotRef.current?.root
    if (!root) return
    try {
      const files = await loadGitFiles(root)
      if (!refreshIsCurrent({ generationRef, generation, filesRevisionRef, filesRevision })) return
      const current = snapshotRef.current
      if (current?.root !== root) return
      filesRevisionRef.current += 1
      const next = { ...current, files }
      snapshotRef.current = next
      signatureRef.current = gitSnapshotSignature(next)
      setSnapshot(next)
      setRefreshSequence((sequence) => sequence + 1)
      setSelectedPath((selected) =>
        selected && files.some((file) => file.path === selected)
          ? selected
          : (files[0]?.path ?? null),
      )
    } catch (loadError) {
      if (!refreshIsCurrent({ generationRef, generation, filesRevisionRef, filesRevision })) return
      setError(gitLoadErrorMessage(loadError, "Não foi possível ler o status do Git."))
    }
  }, [setSelectedPath])

  useEffect(() => {
    if (targetRef.current === targetDirectory) return
    targetRef.current = targetDirectory
    generationRef.current += 1
    filesRevisionRef.current += 1
    refreshInFlightRef.current = null
    snapshotRef.current = null
    signatureRef.current = null
    historySignatureRef.current = null
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

  return {
    snapshot,
    loading,
    error,
    setError,
    refreshSequence,
    refresh,
    refreshFiles,
    updateFiles,
  }
}
