import { useCallback, useEffect, useRef, useState } from "react"
import { ConfirmationNotification } from "@xupon/tuiminal-core/notifications/index"
import type { HttpDocumentState } from "../model/types"
import { requestFromHttpFile } from "../model/http-file"
import { createScratchRequest, type HttpWorkspaceAction } from "../model/workspace"
import { loadPostmanAccount } from "../postman/account"
import { PostmanApi } from "../postman/api"
import { refreshPostmanCollection } from "../postman/refresh"

function assertDocumentsReady(available: boolean, documents: HttpDocumentState[], path: string) {
  if (!available) throw new Error("Conexão Postman cancelada.")
  const affected = documents.filter(
    ({ request }) => request.source.kind === "file" && request.source.path === path,
  )
  if (affected.some((document) => document.revision !== document.savedRevision))
    throw new Error("Salve ou feche os requests alterados antes de mudar a coleção.")
  if (affected.some((document) => document.execution.status === "running"))
    throw new Error("Aguarde ou cancele o request em execução antes de mudar a coleção.")
}

function refreshDocuments(
  documents: HttpDocumentState[],
  file: Awaited<ReturnType<typeof refreshPostmanCollection>>["file"],
  dispatch: (action: HttpWorkspaceAction) => void,
) {
  const removed: string[] = []
  for (const document of documents) {
    const source = document.request.source
    if (source.kind !== "file" || source.path !== file.path) continue
    if (document.revision !== document.savedRevision || document.execution.status === "running")
      continue
    const block = file.requests.find((item) => item.blockId === source.blockId)
    if (!block) removed.push(document.request.id)
    else
      dispatch({
        type: "commit-saved-document",
        documentId: document.request.id,
        request: requestFromHttpFile(file, block),
      })
  }
  if (removed.length && removed.length === documents.length)
    dispatch({ type: "add-document", request: createScratchRequest(`http-scratch-${Date.now()}`) })
  for (const documentId of removed) dispatch({ type: "close-document", documentId })
}

function notifyRefresh(
  result: Awaited<ReturnType<typeof refreshPostmanCollection>>,
  selectEnvironment: (name: string) => void,
  setNotice: (notice: string) => void,
) {
  if (result.environmentName) selectEnvironment(result.environmentName)
  setNotice("COLEÇÃO ATUALIZADA DO POSTMAN. TENTE A AÇÃO NOVAMENTE.")
  for (const warning of result.warnings) setNotice(warning)
}

export function usePostmanConflictRefresh({
  root,
  active,
  getDocuments,
  dispatch,
  refreshProject,
  selectEnvironment,
  setNotice,
}: {
  root: string
  active: boolean
  getDocuments: () => HttpDocumentState[]
  dispatch: (action: HttpWorkspaceAction) => void
  refreshProject: () => Promise<void>
  selectEnvironment: (name: string) => void
  setNotice: (notice: string) => void
}) {
  const [path, setPath] = useState<string | null>(null)
  const generation = useRef(0)
  const request = useCallback((next: string | null) => {
    generation.current += 1
    setPath(next)
  }, [])
  const mounted = useRef(false)
  const available = useRef(active)
  available.current = active
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  useEffect(() => {
    if (!active) request(null)
  }, [active, request])
  const confirm = async () => {
    if (!path) return
    const token = generation.current
    const isCurrent = () => mounted.current && generation.current === token
    const assertReady = () =>
      assertDocumentsReady(isCurrent() && available.current, getDocuments(), path)
    try {
      assertReady()
      const account = await loadPostmanAccount()
      if (!account) throw new Error("Postman desconectado. Execute: tuiminal postman login")
      const result = await refreshPostmanCollection(
        root,
        new PostmanApi(account),
        path,
        assertReady,
      )
      await refreshProject()
      if (!isCurrent()) return
      refreshDocuments(getDocuments(), result.file, dispatch)
      notifyRefresh(result, selectEnvironment, setNotice)
    } catch (error) {
      if (isCurrent()) setNotice(error instanceof Error ? error.message : String(error))
    } finally {
      if (isCurrent()) request(null)
    }
  }
  return {
    pending: Boolean(path),
    request,
    content:
      active && path ? (
        <ConfirmationNotification
          id="http-postman-conflict"
          title="ATUALIZAR COLEÇÃO DO POSTMAN"
          target={path}
          message="A coleção mudou no Postman. Atualizar a cópia local? Depois, tente a ação novamente."
          confirmLabel="[Enter] Atualizar"
          returnFocusId="http-navigation-collection"
          onConfirm={confirm}
          onCancel={() => request(null)}
        />
      ) : null,
  }
}
