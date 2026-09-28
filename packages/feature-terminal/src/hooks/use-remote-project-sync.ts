import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  type RemoteProjectSyncMapping,
  type RemoteProjectSyncStatus,
  remoteProjectSyncKey,
  remoteProjectSyncMappingKey,
} from "../model/remote-project-sync"
import type { TerminalSession } from "../model/sessions"
import {
  pathExists,
  RemoteProjectSyncCollisionError,
  RemoteProjectSyncLocalChangesError,
  RemoteProjectSyncLocalRaceError,
  readLocalProjectFingerprint,
  readRemoteProjectFingerprint,
  synchronizeRemoteProject,
} from "../services/remote-project-sync"
import {
  loadRemoteProjectSyncMappings,
  saveRemoteProjectSyncMapping,
} from "../services/remote-project-sync-state"

const STATUS_INTERVAL_MS = 10_000
const STATUS_TIMEOUT_MS = 60_000

function mappedBySource(mappings: readonly RemoteProjectSyncMapping[]) {
  return new Map(mappings.map((mapping) => [remoteProjectSyncMappingKey(mapping), mapping]))
}

function remoteSession(session: TerminalSession) {
  return session.agentIntegration === "codex-app-server" ? session.codex?.remote : undefined
}

async function inspectProjectSync(
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

async function currentLocalFingerprint(localPath: string, signal: AbortSignal) {
  return (await pathExists(localPath)) ? readLocalProjectFingerprint(localPath, signal) : null
}

async function prepareLocalSync(
  mapping: RemoteProjectSyncMapping | undefined,
  localPath: string,
  replaceLocalChanges: boolean,
  signal: AbortSignal,
) {
  const fingerprint = await currentLocalFingerprint(localPath, signal)
  if (!mapping && fingerprint)
    throw new RemoteProjectSyncCollisionError("A pasta de sincronização já existe.")
  if (mapping && fingerprint !== mapping.localFingerprint && !replaceLocalChanges)
    throw new RemoteProjectSyncLocalChangesError(
      "A cópia local possui alterações que serão substituídas.",
    )
  return fingerprint
}

async function assertLocalUnchanged(
  localPath: string,
  expected: string | null,
  signal: AbortSignal,
) {
  if ((await currentLocalFingerprint(localPath, signal)) !== expected)
    throw new RemoteProjectSyncLocalRaceError(
      "A cópia local mudou durante a sincronização; tente novamente.",
    )
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
        const status = await inspectProjectSync(remote, mapping, signal)
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

  const synchronize = useCallback(
    async (
      session: TerminalSession,
      destination?: string,
      options: { replaceLocalChanges?: boolean } = {},
    ) => {
      const remote = remoteSession(session)
      if (!remote) return null
      const key = remoteProjectSyncKey(remote)
      if (jobs.current.has(key)) return null
      const mapping = mappingsRef.current.get(key)
      const localPath = mapping?.localPath ?? destination
      if (!localPath) throw new Error("Escolha uma pasta local para sincronizar o projeto remoto.")
      const controller = new AbortController()
      jobs.current.set(key, controller)
      try {
        const localFingerprint = await prepareLocalSync(
          mapping,
          localPath,
          Boolean(options.replaceLocalChanges),
          controller.signal,
        )
        updateStatus(key, { kind: "syncing", localPath })
        const result = await synchronizeRemoteProject({
          remote,
          destination: localPath,
          signal: controller.signal,
          beforePublish: () => assertLocalUnchanged(localPath, localFingerprint, controller.signal),
        })
        const next: RemoteProjectSyncMapping = {
          profileId: remote.profile.id,
          sourcePath: remote.workingDirectory,
          remotePath: result.remotePath,
          localPath,
          remoteFingerprint: result.remoteFingerprint,
          localFingerprint: result.localFingerprint,
          syncedAt: Date.now(),
        }
        saveRemoteProjectSyncMapping(next)
        setMappings((current) => {
          const updated = new Map(current)
          updated.set(key, next)
          mappingsRef.current = updated
          return updated
        })
        updateStatus(key, { kind: "synced", localPath })
        return next
      } catch (error) {
        if (error instanceof RemoteProjectSyncLocalChangesError) {
          updateStatus(key, { kind: "out-of-sync", localPath, difference: "local" })
        } else if (!controller.signal.aborted) {
          updateStatus(key, {
            kind: "error",
            localPath,
            message: error instanceof Error ? error.message : "Não foi possível sincronizar.",
          })
        }
        throw error
      } finally {
        jobs.current.delete(key)
      }
    },
    [updateStatus],
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

  return { statuses: sessionStatuses, mappingFor, synchronize }
}
