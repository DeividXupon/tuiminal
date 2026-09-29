import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  type RemoteProjectSyncMapping,
  type RemoteProjectSyncReview,
  type RemoteProjectSyncStatus,
  remoteProjectSyncKey,
  remoteProjectSyncMappingKey,
} from "../model/remote-project-sync"
import type { TerminalSession } from "../model/sessions"
import { RemoteProjectSyncLocalChangesError } from "../services/remote-project-sync-errors"
import { loadRemoteProjectSyncMappings } from "../services/remote-project-sync-state"
import { RemoteProjectSyncWorkerClient } from "../services/remote-project-sync-worker-client"

function mappedBySource(mappings: readonly RemoteProjectSyncMapping[]) {
  return new Map(mappings.map((mapping) => [remoteProjectSyncMappingKey(mapping), mapping]))
}

function remoteSession(session: TerminalSession) {
  return session.agentIntegration === "codex-app-server" ? session.codex?.remote : undefined
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

export function useRemoteProjectSync(
  visibleSessions: readonly TerminalSession[],
  allSessions: readonly TerminalSession[],
) {
  const [mappings, setMappings] = useState(() => mappedBySource(loadRemoteProjectSyncMappings()))
  const mappingsRef = useRef(mappings)
  mappingsRef.current = mappings
  const [statuses, setStatuses] = useState<ReadonlyMap<string, RemoteProjectSyncStatus>>(
    () => new Map(),
  )
  const clients = useRef(new Map<string, RemoteProjectSyncWorkerClient>())
  const cancelled = useRef(new Set<string>())
  const running = useRef(new Set<string>())

  const updateStatus = useCallback((key: string, status: RemoteProjectSyncStatus) => {
    setStatuses((current) => {
      const next = new Map(current)
      next.set(key, status)
      return next
    })
  }, [])

  const retainMapping = useCallback((key: string, mapping: RemoteProjectSyncMapping) => {
    setMappings((current) => {
      const next = new Map(current)
      next.set(key, mapping)
      mappingsRef.current = next
      return next
    })
  }, [])

  const cancelKey = useCallback(
    (key: string) => {
      const client = clients.current.get(key)
      if (!client) return
      cancelled.current.add(key)
      client.cancel()
      clients.current.delete(key)
      if (!running.current.has(key)) {
        const mapping = mappingsRef.current.get(key)
        updateStatus(
          key,
          mapping
            ? { kind: "out-of-sync", localPath: mapping.localPath, difference: "remote" }
            : { kind: "unmapped" },
        )
      }
    },
    [updateStatus],
  )

  useEffect(
    () => () => {
      for (const [key, client] of clients.current) {
        cancelled.current.add(key)
        client.cancel()
      }
      clients.current.clear()
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
    for (const key of clients.current.keys()) if (!retained.has(key)) cancelKey(key)
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
        updateStatus(key, {
          kind: "out-of-sync",
          localPath: mapping.localPath,
          difference: review.difference,
        })
        return review
      } catch (error) {
        if (!cancelled.current.has(key)) updateStatus(key, failureStatus(mapping.localPath, error))
        throw error
      } finally {
        if (!keepClient) {
          clients.current.delete(key)
          client.dispose()
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
          updateStatus(
            key,
            mapping
              ? { kind: "out-of-sync", localPath, difference: "remote" }
              : { kind: "unmapped" },
          )
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

  return { statuses: sessionStatuses, mappingFor, inspect, synchronize, page, cancel }
}
