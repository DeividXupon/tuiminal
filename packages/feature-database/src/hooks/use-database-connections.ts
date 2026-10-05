import { useCallback, useEffect, useRef, useState } from "react"
import type { DatabaseConnectionProfile, ExternalDatabaseConnectionCandidate } from "../model/types"
import { closeConnection, listDatabaseConnections } from "../services/database"
import {
  discoverExternalDatabaseConnections,
  externalDatabaseDiscoveryWarnings,
  installExternalDatabaseConnections,
  listExternalDatabaseCandidates,
} from "../services/external-database-connections"

export function useDatabaseConnections() {
  const externalDiscoveryEnabled = process.env.TUIMINAL_DATABASE_EXTERNAL_DISCOVERY !== "0"
  const [connections, setConnections] =
    useState<DatabaseConnectionProfile[]>(listDatabaseConnections)
  const [externalCandidates, setExternalCandidates] = useState<
    ExternalDatabaseConnectionCandidate[]
  >([])
  const [externalWarnings, setExternalWarnings] = useState<string[]>([])
  const [discoveringExternal, setDiscoveringExternal] = useState(() => externalDiscoveryEnabled)
  const controllerRef = useRef<AbortController | null>(null)

  const reloadConnections = useCallback(() => {
    setConnections(listDatabaseConnections())
    setExternalCandidates(listExternalDatabaseCandidates())
    setExternalWarnings(externalDatabaseDiscoveryWarnings())
  }, [])

  const refreshExternalConnections = useCallback(async () => {
    if (!externalDiscoveryEnabled) {
      reloadConnections()
      return
    }
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setDiscoveringExternal(true)
    try {
      const result = await discoverExternalDatabaseConnections({ signal: controller.signal })
      if (controller.signal.aborted) return
      const removed = installExternalDatabaseConnections(result)
      await Promise.all(removed.map(closeConnection))
      reloadConnections()
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null
        setDiscoveringExternal(false)
      }
    }
  }, [externalDiscoveryEnabled, reloadConnections])

  useEffect(() => {
    void refreshExternalConnections()
    return () => {
      const controller = controllerRef.current
      controllerRef.current = null
      controller?.abort()
    }
  }, [refreshExternalConnections])

  return {
    connections,
    externalCandidates,
    externalWarnings,
    discoveringExternal,
    reloadConnections,
    refreshExternalConnections,
  }
}
