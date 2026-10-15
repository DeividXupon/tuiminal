import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  type RemoteProjectSyncMapping,
  type RemoteProjectSyncReview,
  type RemoteProjectSyncStatus,
  remoteProjectSyncKey,
  remoteProjectSyncMappingKey,
  remoteProjectSyncReviewStatus,
} from "../model/remote-project-sync"
import { agentSessionHasCapability, type TerminalSession } from "../model/sessions"
import { RemoteProjectSyncLocalChangesError } from "../services/remote-project-sync-errors"
import {
  loadRemoteProjectSyncMappings,
  saveRemoteProjectSyncMapping,
} from "../services/remote-project-sync-state"
import { RemoteProjectSyncWorkerClient } from "../services/remote-project-sync-worker-client"
import { shouldReportRemoteProjectAutoSyncFailure } from "./use-remote-project-auto-sync"

type RemoteProjectSyncOptions = {
  onAutomaticFailure?: ((session: TerminalSession, error: unknown) => void) | undefined
}

function mappedBySource(mappings: readonly RemoteProjectSyncMapping[]) {
  return new Map(mappings.map((mapping) => [remoteProjectSyncMappingKey(mapping), mapping]))
}

function remoteSession(session: TerminalSession) {
  return agentSessionHasCapability(session, "project-sync")
    ? session.agentLaunch?.remote
    : undefined
}

function failureStatus(localPath: string, error: unknown): RemoteProjectSyncStatus {
  return {
    kind: "error",
    localPath,
    message: error instanceof Error ? error.message : "Não foi possível sincronizar.",
  }
}

function synchronizationDestination(
  mapping: RemoteProjectSyncMapping | undefined,
  destination: string | undefined,
) {
  const localPath = mapping?.localPath ?? destination
  if (!localPath) throw new Error("Escolha uma pasta local para sincronizar o projeto remoto.")
  return localPath
}

function synchronizationFailureStatus(
  localPath: string,
  error: unknown,
  wasCancelled: boolean,
): RemoteProjectSyncStatus | undefined {
  if (error instanceof RemoteProjectSyncLocalChangesError)
    return { kind: "out-of-sync", localPath, difference: "local" }
  return wasCancelled ? undefined : failureStatus(localPath, error)
}

function cancelledSynchronizationStatus(
  localPath: string,
  mapping: RemoteProjectSyncMapping | undefined,
  review: RemoteProjectSyncReview | undefined,
): RemoteProjectSyncStatus {
  if (review) return remoteProjectSyncReviewStatus(review)
  return mapping ? { kind: "out-of-sync", localPath, difference: "remote" } : { kind: "unmapped" }
}

export function useRemoteProjectSync(
  visibleSessions: readonly TerminalSession[],
  allSessions: readonly TerminalSession[],
  options: RemoteProjectSyncOptions = {},
) {
  const [mappings, setMappings] = useState(() => mappedBySource(loadRemoteProjectSyncMappings()))
  const mappingsRef = useRef(mappings)
  mappingsRef.current = mappings
  const [automaticKeys, setAutomaticKeys] = useState(
    () => new Set([...mappings].filter(([, mapping]) => mapping.automatic).map(([key]) => key)),
  )
  const automaticKeysRef = useRef(automaticKeys)
  automaticKeysRef.current = automaticKeys
  const [statuses, setStatuses] = useState<ReadonlyMap<string, RemoteProjectSyncStatus>>(
    () => new Map(),
  )
  const statusesRef = useRef(statuses)
  statusesRef.current = statuses
  const clients = useRef(new Map<string, RemoteProjectSyncWorkerClient>())
  const cancelled = useRef(new Set<string>())
  const running = useRef(new Set<string>())
  const pendingAutomatic = useRef(new Map<string, TerminalSession>())
  const automaticRunning = useRef(new Set<string>())
  const allSessionsRef = useRef(allSessions)
  allSessionsRef.current = allSessions
  const lifecycleActive = useRef(true)
  const onAutomaticFailureRef = useRef(options.onAutomaticFailure)
  onAutomaticFailureRef.current = options.onAutomaticFailure
  const drainAutomaticRef = useRef((_key: string) => {})

  const updateStatus = useCallback((key: string, status: RemoteProjectSyncStatus) => {
    setStatuses((current) => {
      const next = new Map(current)
      next.set(key, status)
      statusesRef.current = next
      return next
    })
  }, [])

  const retainMapping = useCallback((key: string, mapping: RemoteProjectSyncMapping) => {
    const configured = { ...mapping, automatic: automaticKeysRef.current.has(key) }
    if (configured.automatic !== mapping.automatic) saveRemoteProjectSyncMapping(configured)
    setMappings((current) => {
      const next = new Map(current)
      next.set(key, configured)
      mappingsRef.current = next
      return next
    })
    drainAutomaticRef.current(key)
  }, [])

  const cancelKey = useCallback(
    (key: string) => {
      const client = clients.current.get(key)
      if (!client) return
      cancelled.current.add(key)
      client.cancel()
      void client.finished.finally(() => {
        if (clients.current.get(key) === client) clients.current.delete(key)
        if (!running.current.has(key)) {
          const mapping = mappingsRef.current.get(key)
          const previous = statusesRef.current.get(key)
          updateStatus(
            key,
            previous?.kind === "synced" || previous?.kind === "out-of-sync"
              ? previous
              : mapping
                ? { kind: "out-of-sync", localPath: mapping.localPath, difference: "remote" }
                : { kind: "unmapped" },
          )
          cancelled.current.delete(key)
        }
        drainAutomaticRef.current(key)
      })
    },
    [updateStatus],
  )

  useEffect(() => {
    lifecycleActive.current = true
    return () => {
      lifecycleActive.current = false
      for (const [key, client] of clients.current) {
        cancelled.current.add(key)
        client.cancel()
      }
      pendingAutomatic.current.clear()
      clients.current.clear()
    }
  }, [])

  useEffect(() => {
    const retained = new Set(
      allSessions.flatMap((session) => {
        const remote = remoteSession(session)
        return remote ? [remoteProjectSyncKey(remote)] : []
      }),
    )
    for (const key of clients.current.keys()) if (!retained.has(key)) cancelKey(key)
    for (const key of pendingAutomatic.current.keys())
      if (!retained.has(key)) pendingAutomatic.current.delete(key)
  }, [allSessions, cancelKey])

  const createClient = useCallback(
    (key: string, localPath: string) => {
      const client = new RemoteProjectSyncWorkerClient(localPath, (status) =>
        updateStatus(key, status),
      )
      clients.current.set(key, client)
      return client
    },
    [updateStatus],
  )

  const inspect = useCallback(
    async (session: TerminalSession) => {
      const remote = remoteSession(session)
      if (!remote) return null
      const key = remoteProjectSyncKey(remote)
      const mapping = mappingsRef.current.get(key)
      if (!mapping || clients.current.has(key)) return null
      cancelled.current.delete(key)
      const client = createClient(key, mapping.localPath)
      let keepClient = false
      try {
        const review = await client.inspect(remote, mapping)
        if (review.mapping) retainMapping(key, review.mapping)
        if (!review.changeCount) {
          updateStatus(key, { kind: "synced", localPath: mapping.localPath })
          return review
        }
        keepClient = true
        updateStatus(key, remoteProjectSyncReviewStatus(review))
        return review
      } catch (error) {
        if (!cancelled.current.has(key)) updateStatus(key, failureStatus(mapping.localPath, error))
        throw error
      } finally {
        if (!keepClient) {
          clients.current.delete(key)
          client.dispose()
          drainAutomaticRef.current(key)
        }
      }
    },
    [createClient, retainMapping, updateStatus],
  )

  const synchronize = useCallback(
    async (
      session: TerminalSession,
      destination?: string,
      options: { review?: RemoteProjectSyncReview | undefined } = {},
    ) => {
      const remote = remoteSession(session)
      if (!remote) return null
      const key = remoteProjectSyncKey(remote)
      const mapping = mappingsRef.current.get(key)
      const localPath = synchronizationDestination(mapping, destination)
      cancelled.current.delete(key)
      const retained = options.review ? clients.current.get(key) : undefined
      const client = retained ?? createClient(key, localPath)
      running.current.add(key)
      try {
        const next = options.review
          ? await client.apply()
          : await client.synchronize(remote, mapping)
        retainMapping(key, next)
        updateStatus(key, { kind: "synced", localPath })
        return next
      } catch (error) {
        const status = synchronizationFailureStatus(localPath, error, cancelled.current.has(key))
        if (status) updateStatus(key, status)
        throw error
      } finally {
        running.current.delete(key)
        clients.current.delete(key)
        client.dispose()
        if (cancelled.current.delete(key))
          updateStatus(key, cancelledSynchronizationStatus(localPath, mapping, options.review))
        drainAutomaticRef.current(key)
      }
    },
    [createClient, retainMapping, updateStatus],
  )

  const page = useCallback(async (session: TerminalSession, offset: number) => {
    const remote = remoteSession(session)
    if (!remote) return null
    return clients.current.get(remoteProjectSyncKey(remote))?.page(offset) ?? null
  }, [])

  const cancel = useCallback(
    (session: TerminalSession) => {
      const remote = remoteSession(session)
      if (!remote) return
      cancelKey(remoteProjectSyncKey(remote))
    },
    [cancelKey],
  )

  const drainAutomatic = useCallback(
    (key: string) => {
      if (
        automaticRunning.current.has(key) ||
        clients.current.has(key) ||
        !pendingAutomatic.current.has(key)
      )
        return
      if (!automaticKeysRef.current.has(key)) {
        pendingAutomatic.current.delete(key)
        return
      }
      if (!mappingsRef.current.has(key)) return
      const queued = pendingAutomatic.current.get(key)
      const session = allSessionsRef.current.find(
        (candidate) => candidate.id === queued?.id && candidate.startedAt === queued.startedAt,
      )
      if (!session) {
        pendingAutomatic.current.delete(key)
        return
      }
      pendingAutomatic.current.delete(key)
      automaticRunning.current.add(key)
      void synchronize(session)
        .catch((error) => {
          if (
            shouldReportRemoteProjectAutoSyncFailure({
              active: lifecycleActive.current,
              enabled: automaticKeysRef.current.has(key),
              sessions: allSessionsRef.current,
              session,
            })
          )
            onAutomaticFailureRef.current?.(session, error)
        })
        .finally(() => {
          automaticRunning.current.delete(key)
          drainAutomaticRef.current(key)
        })
    },
    [synchronize],
  )
  drainAutomaticRef.current = drainAutomatic

  const requestAutomatic = useCallback((session: TerminalSession) => {
    const remote = remoteSession(session)
    if (!remote) return
    const key = remoteProjectSyncKey(remote)
    if (!automaticKeysRef.current.has(key)) return
    pendingAutomatic.current.set(key, session)
    drainAutomaticRef.current(key)
  }, [])

  const toggleAutomatic = useCallback((session: TerminalSession) => {
    const remote = remoteSession(session)
    if (!remote) return false
    const key = remoteProjectSyncKey(remote)
    const enabled = !automaticKeysRef.current.has(key)
    const mapping = mappingsRef.current.get(key)
    if (mapping) {
      const configured = { ...mapping, automatic: enabled }
      saveRemoteProjectSyncMapping(configured)
      const nextMappings = new Map(mappingsRef.current)
      nextMappings.set(key, configured)
      mappingsRef.current = nextMappings
      setMappings(nextMappings)
    }
    const nextAutomaticKeys = new Set(automaticKeysRef.current)
    if (enabled) nextAutomaticKeys.add(key)
    else {
      nextAutomaticKeys.delete(key)
      pendingAutomatic.current.delete(key)
    }
    automaticKeysRef.current = nextAutomaticKeys
    setAutomaticKeys(nextAutomaticKeys)
    clients.current.get(key)?.setAutomatic(enabled)
    return enabled
  }, [])

  const sessionStatuses = useMemo(() => {
    const result = new Map<string, RemoteProjectSyncStatus>()
    for (const session of visibleSessions) {
      const remote = remoteSession(session)
      if (!remote) continue
      const key = remoteProjectSyncKey(remote)
      const mapping = mappings.get(key)
      result.set(
        session.id,
        statuses.get(key) ??
          (mapping ? { kind: "synced", localPath: mapping.localPath } : { kind: "unmapped" }),
      )
    }
    return result
  }, [mappings, statuses, visibleSessions])

  const mappingFor = useCallback((session: TerminalSession) => {
    const remote = remoteSession(session)
    return remote ? mappingsRef.current.get(remoteProjectSyncKey(remote)) : undefined
  }, [])

  const automaticFor = useCallback(
    (session: TerminalSession) => {
      const remote = remoteSession(session)
      return remote ? automaticKeys.has(remoteProjectSyncKey(remote)) : false
    },
    [automaticKeys],
  )

  return {
    statuses: sessionStatuses,
    mappingFor,
    automaticFor,
    toggleAutomatic,
    requestAutomatic,
    inspect,
    synchronize,
    page,
    cancel,
  }
}
