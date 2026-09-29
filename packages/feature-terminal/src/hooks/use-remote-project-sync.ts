import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  type RemoteProjectSyncMapping,
  type RemoteProjectSyncPreview,
  type RemoteProjectSyncSnapshot,
  type RemoteProjectSyncStatus,
  remoteProjectSyncKey,
  remoteProjectSyncMappingKey,
} from "../model/remote-project-sync"
import type { TerminalSession } from "../model/sessions"
import {
  inspectRemoteProjectSync,
  pathExists,
  RemoteProjectSyncCollisionError,
  RemoteProjectSyncLocalChangesError,
  readLocalProjectFingerprint,
  readRemoteProjectFingerprint,
  synchronizeRemoteProject,
} from "../services/remote-project-sync"
import {
  loadRemoteProjectSyncMappings,
  loadRemoteProjectSyncSnapshot,
  saveRemoteProjectSyncSnapshot,
} from "../services/remote-project-sync-state"

const STATUS_INTERVAL_MS = 10_000
const STATUS_TIMEOUT_MS = 60_000

function mappedBySource(mappings: readonly RemoteProjectSyncMapping[]) {
  return new Map(mappings.map((mapping) => [remoteProjectSyncMappingKey(mapping), mapping]))
}

function remoteSession(session: TerminalSession) {
  return session.agentIntegration === "codex-app-server" ? session.codex?.remote : undefined
}

async function inspectProjectSyncStatus(
  remote: NonNullable<ReturnType<typeof remoteSession>>,
  mapping: RemoteProjectSyncMapping,
  signal: AbortSignal,
): Promise<RemoteProjectSyncStatus> {
  const inspection = new AbortController()
  const cancel = () => inspection.abort(signal.reason)
  signal.addEventListener("abort", cancel, { once: true })
  const timeout = setTimeout(
    () => inspection.abort(new Error("A verificação do projeto excedeu o tempo limite.")),
    STATUS_TIMEOUT_MS,
  )
  try {
    const localPresent = await pathExists(mapping.localPath)
    const [remoteManifest, localFingerprint] = await Promise.all([
      readRemoteProjectFingerprint(remote, inspection.signal),
      localPresent
        ? readLocalProjectFingerprint(mapping.localPath, inspection.signal)
        : Promise.resolve(""),
    ])
    const remoteChanged = remoteManifest.fingerprint !== mapping.remoteFingerprint
    const localChanged = localFingerprint !== mapping.localFingerprint
    if (!remoteChanged && !localChanged) return { kind: "synced", localPath: mapping.localPath }
    return {
      kind: "out-of-sync",
      localPath: mapping.localPath,
      difference: remoteChanged && localChanged ? "both" : remoteChanged ? "remote" : "local",
    }
  } finally {
    clearTimeout(timeout)
    signal.removeEventListener("abort", cancel)
  }
}

function mappingFromSnapshot(
  remote: NonNullable<ReturnType<typeof remoteSession>>,
  localPath: string,
  snapshot: RemoteProjectSyncSnapshot,
) {
  return {
    profileId: remote.profile.id,
    sourcePath: remote.workingDirectory,
    remotePath: snapshot.remote.canonicalPath,
    localPath,
    remoteFingerprint: snapshot.remote.fingerprint,
    localFingerprint: snapshot.local.fingerprint,
    syncedAt: Date.now(),
  } satisfies RemoteProjectSyncMapping
}

function previewStatus(preview: RemoteProjectSyncPreview): RemoteProjectSyncStatus {
  if (!preview.changes.length) return { kind: "synced", localPath: preview.localPath }
  const remoteChanged = preview.changes.some((change) => change.remoteChanged)
  const localChanged = preview.hasLocalChanges
  const difference = remoteChanged && localChanged ? "both" : localChanged ? "local" : "remote"
  return { kind: "out-of-sync", localPath: preview.localPath, difference }
}

function failureStatus(localPath: string, error: unknown): RemoteProjectSyncStatus {
  return {
    kind: "error",
    localPath,
    message: error instanceof Error ? error.message : "Não foi possível sincronizar.",
  }
}

async function resolveSynchronizationPreview(options: {
  remote: NonNullable<ReturnType<typeof remoteSession>>
  localPath: string
  mapping?: RemoteProjectSyncMapping | undefined
  preview?: RemoteProjectSyncPreview | undefined
  signal: AbortSignal
}) {
  if (options.preview) return options.preview
  return inspectRemoteProjectSync({
    remote: options.remote,
    destination: options.localPath,
    mapping: options.mapping,
    snapshot: options.mapping ? loadRemoteProjectSyncSnapshot(options.mapping) : undefined,
    signal: options.signal,
  })
}

function synchronizationProgress(
  key: string,
  localPath: string,
  updateStatus: (key: string, status: RemoteProjectSyncStatus) => void,
) {
  let lastProgress = -1
  return (progress: number) => {
    const rounded = Math.floor(progress * 100) / 100
    if (rounded === lastProgress) return
    lastProgress = rounded
    updateStatus(key, { kind: "syncing", localPath, progress: rounded })
  }
}

function reportSynchronizationFailure(
  error: unknown,
  aborted: boolean,
  key: string,
  localPath: string,
  updateStatus: (key: string, status: RemoteProjectSyncStatus) => void,
) {
  if (error instanceof RemoteProjectSyncLocalChangesError) {
    updateStatus(key, { kind: "out-of-sync", localPath, difference: "local" })
    return
  }
  if (!aborted) updateStatus(key, failureStatus(localPath, error))
}

function synchronizationDestination(
  mapping: RemoteProjectSyncMapping | undefined,
  destination: string | undefined,
) {
  const localPath = mapping?.localPath ?? destination
  if (!localPath) throw new Error("Escolha uma pasta local para sincronizar o projeto remoto.")
  return localPath
}

export function useRemoteProjectSync(
  active: boolean,
  visibleSessions: readonly TerminalSession[],
  allSessions: readonly TerminalSession[],
) {
  const [mappings, setMappings] = useState(() => mappedBySource(loadRemoteProjectSyncMappings()))
  const mappingsRef = useRef(mappings)
  mappingsRef.current = mappings
  const [statuses, setStatuses] = useState<ReadonlyMap<string, RemoteProjectSyncStatus>>(
    () => new Map(),
  )
  const jobs = useRef(new Map<string, AbortController>())

  const updateStatus = useCallback((key: string, status: RemoteProjectSyncStatus) => {
    setStatuses((current) => {
      const next = new Map(current)
      next.set(key, status)
      return next
    })
  }, [])

  const retainMapping = useCallback(
    (key: string, mapping: RemoteProjectSyncMapping, snapshot: RemoteProjectSyncSnapshot) => {
      const saved = saveRemoteProjectSyncSnapshot(mapping, snapshot)
      setMappings((current) => {
        const updated = new Map(current)
        updated.set(key, saved)
        mappingsRef.current = updated
        return updated
      })
      return saved
    },
    [],
  )

  const check = useCallback(
    async (session: TerminalSession, signal: AbortSignal) => {
      const remote = remoteSession(session)
      if (!remote) return
      const key = remoteProjectSyncKey(remote)
      if (jobs.current.has(key)) return
      const mapping = mappingsRef.current.get(key)
      if (!mapping) {
        updateStatus(key, { kind: "unmapped" })
        return
      }
      updateStatus(key, { kind: "checking", localPath: mapping.localPath })
      try {
        const status = await inspectProjectSyncStatus(remote, mapping, signal)
        if (signal.aborted || jobs.current.has(key)) return
        updateStatus(key, status)
      } catch (error) {
        if (!signal.aborted)
          updateStatus(key, {
            kind: "error",
            localPath: mapping.localPath,
            message:
              error instanceof Error ? error.message : "Não foi possível verificar o projeto.",
          })
      }
    },
    [updateStatus],
  )

  useEffect(() => {
    if (!active) return
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const poll = async () => {
      const unique = new Map<string, TerminalSession>()
      for (const session of visibleSessions) {
        const remote = remoteSession(session)
        if (remote) unique.set(remoteProjectSyncKey(remote), session)
      }
      await Promise.allSettled(
        [...unique.values()].map((session) => check(session, controller.signal)),
      )
      if (!controller.signal.aborted) timer = setTimeout(() => void poll(), STATUS_INTERVAL_MS)
    }
    void poll()
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [active, check, visibleSessions])

  useEffect(
    () => () => {
      for (const controller of jobs.current.values()) controller.abort()
      jobs.current.clear()
    },
    [],
  )

  useEffect(() => {
    const retained = new Set(
      allSessions.flatMap((session) => {
        const remote = remoteSession(session)
        return remote ? [remoteProjectSyncKey(remote)] : []
      }),
    )
    for (const [key, controller] of jobs.current) {
      if (!retained.has(key)) controller.abort()
    }
  }, [allSessions])

  const inspect = useCallback(
    async (session: TerminalSession) => {
      const remote = remoteSession(session)
      if (!remote) return null
      const key = remoteProjectSyncKey(remote)
      const mapping = mappingsRef.current.get(key)
      if (!mapping || jobs.current.has(key)) return null
      const controller = new AbortController()
      jobs.current.set(key, controller)
      updateStatus(key, { kind: "checking", localPath: mapping.localPath })
      try {
        const snapshot = loadRemoteProjectSyncSnapshot(mapping)
        const preview = await inspectRemoteProjectSync({
          remote,
          destination: mapping.localPath,
          mapping,
          snapshot,
          signal: controller.signal,
        })
        const status = previewStatus(preview)
        if (
          status.kind === "synced" &&
          (!snapshot ||
            preview.remote.fingerprint !== mapping.remoteFingerprint ||
            preview.local.fingerprint !== mapping.localFingerprint)
        ) {
          const baseline = { version: 1, remote: preview.remote, local: preview.local } as const
          retainMapping(key, mappingFromSnapshot(remote, mapping.localPath, baseline), baseline)
        }
        updateStatus(key, status)
        return preview
      } catch (error) {
        if (!controller.signal.aborted) updateStatus(key, failureStatus(mapping.localPath, error))
        throw error
      } finally {
        jobs.current.delete(key)
      }
    },
    [retainMapping, updateStatus],
  )

  const synchronize = useCallback(
    async (
      session: TerminalSession,
      destination?: string,
      options: { replaceLocalChanges?: boolean; preview?: RemoteProjectSyncPreview } = {},
    ) => {
      const remote = remoteSession(session)
      if (!remote) return null
      const key = remoteProjectSyncKey(remote)
      if (jobs.current.has(key)) return null
      const mapping = mappingsRef.current.get(key)
      const localPath = synchronizationDestination(mapping, destination)
      const controller = new AbortController()
      jobs.current.set(key, controller)
      try {
        if (!mapping && (await pathExists(localPath)))
          throw new RemoteProjectSyncCollisionError("A pasta de sincronização já existe.")
        if (!options.preview) updateStatus(key, { kind: "checking", localPath })
        const preview = await resolveSynchronizationPreview({
          remote,
          localPath,
          mapping,
          preview: options.preview,
          signal: controller.signal,
        })
        if (!mapping && preview.local.fingerprint !== "")
          throw new RemoteProjectSyncCollisionError("A pasta de sincronização já existe.")
        if (preview.hasLocalChanges && !options.replaceLocalChanges)
          throw new RemoteProjectSyncLocalChangesError(
            "A cópia local possui alterações que serão substituídas.",
          )
        updateStatus(key, { kind: "syncing", localPath, progress: 0 })
        const result = await synchronizeRemoteProject({
          remote,
          destination: localPath,
          preview,
          signal: controller.signal,
          onProgress: synchronizationProgress(key, localPath, updateStatus),
        })
        const next = retainMapping(
          key,
          mappingFromSnapshot(remote, localPath, result.snapshot),
          result.snapshot,
        )
        updateStatus(key, { kind: "synced", localPath })
        return next
      } catch (error) {
        reportSynchronizationFailure(error, controller.signal.aborted, key, localPath, updateStatus)
        throw error
      } finally {
        jobs.current.delete(key)
      }
    },
    [retainMapping, updateStatus],
  )

  const sessionStatuses = useMemo(() => {
    const result = new Map<string, RemoteProjectSyncStatus>()
    for (const session of visibleSessions) {
      const remote = remoteSession(session)
      if (!remote) continue
      result.set(session.id, statuses.get(remoteProjectSyncKey(remote)) ?? { kind: "unmapped" })
    }
    return result
  }, [statuses, visibleSessions])

  const mappingFor = useCallback((session: TerminalSession) => {
    const remote = remoteSession(session)
    return remote ? mappingsRef.current.get(remoteProjectSyncKey(remote)) : undefined
  }, [])

  return { statuses: sessionStatuses, mappingFor, inspect, synchronize }
}
