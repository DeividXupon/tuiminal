import { useCallback, useEffect } from "react"
import { createHttpErrorHistoryEntry, createHttpSuccessHistoryEntry } from "../model/history"
import type {
  HttpDocumentState,
  HttpHistoryEntry,
  HttpPrivacyContext,
  HttpProjectRequestItem,
  HttpResponseSnapshot,
} from "../model/types"
import type { HttpWorkspaceAction } from "../model/workspace"
import { HTTP_WORKING_DIRECTORY } from "../services/context"
import type { HttpWorkspaceConfig } from "../storage/config"
import { loadHttpHistory, persistHttpHistoryEntry } from "../storage/history"

export function useHttpHistory({
  config,
  dispatch,
  setNotice,
  documents,
  projectRequests,
}: {
  config: HttpWorkspaceConfig
  dispatch: (action: HttpWorkspaceAction) => void
  setNotice: (notice: string) => void
  documents: HttpDocumentState[]
  projectRequests: HttpProjectRequestItem[]
}) {
  useEffect(() => {
    let disposed = false
    void loadHttpHistory(HTTP_WORKING_DIRECTORY, config).then((entries) => {
      if (!disposed && entries.length) dispatch({ type: "hydrate-history", entries })
    })
    return () => {
      disposed = true
    }
  }, [config, dispatch])

  const persist = useCallback(
    (entry: HttpHistoryEntry) => {
      void persistHttpHistoryEntry(HTTP_WORKING_DIRECTORY, config, entry).catch(() => {
        setNotice("NÃO FOI POSSÍVEL PERSISTIR O HISTÓRICO HTTP")
      })
      return entry
    },
    [config, setNotice],
  )

  const success = useCallback(
    (document: HttpDocumentState, response: HttpResponseSnapshot, environmentName: string | null) =>
      persist(createHttpSuccessHistoryEntry(document, response, environmentName)),
    [persist],
  )

  const failure = useCallback(
    (
      document: HttpDocumentState,
      executionId: string,
      error: string,
      environmentName: string | null,
      privacy?: HttpPrivacyContext,
    ) =>
      persist(
        createHttpErrorHistoryEntry(
          document,
          executionId,
          error,
          environmentName,
          Date.now(),
          privacy,
        ),
      ),
    [persist],
  )

  const open = useCallback(
    (entry: HttpHistoryEntry) => {
      if (!entry.response?.body) return
      if (!documents.some((document) => document.request.id === entry.requestId)) {
        const projectRequest = projectRequests.find(
          (item) => item.request.id === entry.requestId,
        )?.request
        if (!projectRequest) {
          setNotice("O REQUEST ORIGINAL NÃO EXISTE MAIS NESTE PROJETO")
          return
        }
        dispatch({ type: "add-document", request: projectRequest })
      }
      dispatch({ type: "open-history-entry", entryId: entry.id })
    },
    [dispatch, documents, projectRequests, setNotice],
  )

  return { success, failure, open }
}
