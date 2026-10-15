import { useEffect, useMemo, useRef, useState } from "react"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { descendantProcesses } from "../model/agent-detection"
import { type LiveDiffFile, mergeLiveDiffFiles } from "../model/live-diff"
import type { RemoteCodexTarget } from "../model/sessions"
import { readTerminalProcesses } from "../services/agent-processes"
import {
  liveDiffRepositoryRoot,
  liveDiffWorktrees,
  readLiveDiffPatch,
  readLiveDiffRoot,
  readProcessDirectories,
} from "../services/live-diff"
import { collectLiveDiffSnapshot } from "../services/live-diff-snapshot"
import { createRemoteLiveDiffSource, type LiveDiffSource } from "../services/remote-live-diff"

const POLL_MS = 250
const REMOTE_POLL_MS = 750
const DISCOVERY_MS = 2000
const MAX_ROOTS = 4

async function updateSnapshot(
  roots: readonly string[],
  filesRef: { current: LiveDiffFile[] },
  observedRoots: Set<string>,
  signal: AbortSignal,
  warning: string,
  setFiles: (files: LiveDiffFile[]) => void,
  setLastProject: (root: string) => void,
  setError: (message: string) => void,
  readRoot: LiveDiffSource["readRoot"] = readLiveDiffRoot,
) {
  if (!roots.length) return
  const snapshot = await collectLiveDiffSnapshot(roots, filesRef.current, signal, readRoot)
  if (signal.aborted) return
  if (snapshot.changedRoot) setLastProject(snapshot.changedRoot)
  if (snapshot.changed) {
    const merged = mergeLiveDiffFiles(filesRef.current, snapshot.files, Date.now(), observedRoots)
    filesRef.current = merged
    setFiles(merged)
  }
  for (const root of roots) observedRoots.add(root)
  setError(
    snapshot.failed
      ? translateUi("Atualização parcial do Live Diff.")
      : snapshot.truncated
        ? translateUi("Live Diff limitado aos primeiros 1000 arquivos.")
        : warning,
  )
}

export function useLiveDiffSnapshot({
  agentKey,
  initialDirectory,
  remote,
  manualDirectories,
  running,
}: {
  agentKey: string
  initialDirectory: string
  remote: RemoteCodexTarget | undefined
  manualDirectories: readonly string[]
  running: boolean
}) {
  const [processDirectories, setProcessDirectories] = useState<string[]>([])
  const [roots, setRoots] = useState<string[]>([])
  const [files, setFiles] = useState<LiveDiffFile[]>([])
  const [error, setError] = useState("")
  const [lastProject, setLastProject] = useState("")
  const [snapshotReady, setSnapshotReady] = useState(false)
  const rootsRef = useRef<string[]>([])
  const filesRef = useRef<LiveDiffFile[]>([])
  const observedRoots = useRef(new Set<string>())
  const directoryRef = useRef<string[]>([])
  const remoteSource = useMemo(() => (remote ? createRemoteLiveDiffSource(remote) : null), [remote])
  const repositoryRoot = remoteSource?.repositoryRoot ?? liveDiffRepositoryRoot
  const readWorktrees = remoteSource?.worktrees ?? liveDiffWorktrees
  const readRoot = remoteSource?.readRoot ?? readLiveDiffRoot
  const readPatch = remoteSource?.readPatch ?? readLiveDiffPatch
  const pollMs = remoteSource ? REMOTE_POLL_MS : POLL_MS
  const discoveryRounds = Math.max(1, Math.ceil(DISCOVERY_MS / pollMs))
  directoryRef.current = remoteSource
    ? [initialDirectory]
    : [initialDirectory, ...manualDirectories, ...processDirectories]
  useEffect(() => () => remoteSource?.close(), [remoteSource])
  useEffect(() => {
    if (!running) remoteSource?.close()
  }, [remoteSource, running])
  useEffect(() => {
    if (!running || remoteSource) return
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const inspect = async () => {
      try {
        const processes = await readTerminalProcesses(controller.signal)
        const agentPid = Number(agentKey.split(":", 1)[0])
        const pids = descendantProcesses(agentPid, processes).map((process) => process.pid)
        const directories = await readProcessDirectories(pids, controller.signal)
        if (!controller.signal.aborted) {
          setProcessDirectories((previous) =>
            previous.join("\0") === directories.join("\0") ? previous : directories,
          )
        }
      } catch {
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(() => void inspect(), DISCOVERY_MS)
      }
    }
    void inspect()
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [agentKey, remoteSource, running])

  useEffect(() => {
    if (!running) return
    const controller = new AbortController()
    let busy = false
    let scans = 0
    let discoveryWarning = ""
    const discover = async () => {
      const candidates = await Promise.all(
        directoryRef.current.map((directory) => repositoryRoot(directory, controller.signal)),
      )
      const direct = [...new Set(candidates.filter((root): root is string => Boolean(root)))]
      discoveryWarning = manualDirectories.some((_, index) => !candidates[index + 1])
        ? translateUi("Projeto adicionado não é um repositório Git.")
        : ""
      const linked = await Promise.all(
        direct.map((root) => readWorktrees(root, controller.signal).catch(() => [])),
      )
      const next = [...new Set([...direct, ...linked.flat()])].slice(0, MAX_ROOTS)
      if (controller.signal.aborted) return
      if (next.join("\0") !== rootsRef.current.join("\0")) {
        rootsRef.current = next
        setRoots(next)
      }
      if (!next.length && directoryRef.current.length > 0) {
        filesRef.current = []
        setFiles([])
        setError(translateUi("Nenhum repositório Git observado."))
      }
    }
    const failureMessage = translateUi(
      remoteSource
        ? "Live Diff remoto desconectado; tentando novamente."
        : "Não foi possível atualizar o Live Diff.",
    )
    const poll = async () => {
      if (busy || controller.signal.aborted) return
      busy = true
      try {
        const shouldDiscover = scans++ % discoveryRounds === 0
        if (shouldDiscover) await discover()
        await updateSnapshot(
          rootsRef.current,
          filesRef,
          observedRoots.current,
          controller.signal,
          discoveryWarning,
          setFiles,
          setLastProject,
          setError,
          readRoot,
        )
        if (!controller.signal.aborted) setSnapshotReady(true)
      } catch {
        if (!controller.signal.aborted) setError(failureMessage)
      } finally {
        busy = false
      }
    }
    void poll()
    const timer = setInterval(() => void poll(), pollMs)
    return () => {
      controller.abort()
      clearInterval(timer)
    }
  }, [
    discoveryRounds,
    manualDirectories,
    pollMs,
    readRoot,
    readWorktrees,
    remoteSource,
    repositoryRoot,
    running,
  ])

  return { roots, files, filesRef, error, lastProject, snapshotReady, remoteSource, readPatch }
}
