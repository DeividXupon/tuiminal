import type { LivePostmanSession } from "../postman/live-session"
import { deleteLivePostmanRequest } from "../postman/live-mutations"
import { useCallback, useState } from "react"
import type { HttpDocumentState, HttpRequestDefinition, HttpWorkspaceOverlay } from "../model/types"
import type { HttpWorkspaceAction } from "../model/workspace"
import { deleteHttpRequest, moveHttpRequest } from "../storage/collections"
import { isPostmanPath } from "../postman/mutations"

type RequestFileActionContext = {
  root: string
  postmanSession?: LivePostmanSession | null
  request: HttpRequestDefinition
  dispatch: (action: HttpWorkspaceAction) => void
  setNotice: (notice: string) => void
}

async function moveCurrentRequest(context: RequestFileActionContext, moveTarget: string) {
  const target = moveTarget.trim()
  const source = context.request.source
  if (source.kind !== "file") return false
  if (!target || target === source.path) {
    context.setNotice("ESCOLHA OUTRO ARQUIVO DE DESTINO")
    return false
  }
  if (isPostmanPath(source.path) || isPostmanPath(target)) {
    throw new Error("Mover requests vinculadas ao Postman ainda não está disponível.")
  }
  const moved = await moveHttpRequest(context.root, context.request, target)
  context.dispatch({
    type: "commit-saved-document",
    documentId: context.request.id,
    request: moved,
  })
  context.setNotice(
    `REQUEST MOVIDO · ${moved.source.kind === "file" ? moved.source.path : moved.name}`,
  )
  return true
}

async function deleteCurrentRequest(
  context: RequestFileActionContext,
  closeDocument: (documentId: string) => void,
) {
  if (context.request.source.kind === "file" && isPostmanPath(context.request.source.path)) {
    if (!context.postmanSession) throw new Error("Selecione um workspace Postman.")
    await deleteLivePostmanRequest(context.postmanSession, context.request)
  } else await deleteHttpRequest(context.root, context.request)
  closeDocument(context.request.id)
  context.setNotice(`REQUEST EXCLUÍDO · ${context.request.name}`)
}

export function useHttpRequestFiles({
  root,
  postmanSession,
  document,
  dispatch,
  refreshProject,
  closeDocument,
  setNotice,
}: {
  root: string
  postmanSession?: LivePostmanSession | null
  document: HttpDocumentState | undefined
  dispatch: (action: HttpWorkspaceAction) => void
  refreshProject: () => Promise<void>
  closeDocument: (documentId: string) => void
  setNotice: (notice: string) => void
}) {
  const [moveTarget, setMoveTarget] = useState("")

  const open = useCallback(
    (overlay: "request-move" | "request-delete") => {
      if (document?.request.source.kind !== "file") {
        setNotice("SALVE O REQUEST ANTES DE MOVER OU EXCLUIR")
        return
      }
      if (overlay === "request-move" && isPostmanPath(document.request.source.path)) {
        setNotice("Mover requests vinculadas ao Postman ainda não está disponível.")
        return
      }
      if (
        overlay === "request-move" &&
        document.request.source.kind === "file" &&
        document.request.source.supported === false
      ) {
        setNotice("O bloco HTTP não pode ser editado com segurança.")
        return
      }
      setMoveTarget(document.request.source.path)
      dispatch({ type: "open-overlay", overlay })
    },
    [dispatch, document, setNotice],
  )

  const apply = useCallback(
    async (overlay: HttpWorkspaceOverlay) => {
      if (document?.request.source.kind !== "file") return
      try {
        const context = {
          root,
          postmanSession: postmanSession ?? null,
          request: document.request,
          dispatch,
          setNotice,
        }
        if (overlay === "request-move") {
          if (!(await moveCurrentRequest(context, moveTarget))) return
        } else if (overlay === "request-delete") {
          await deleteCurrentRequest(context, closeDocument)
        } else return
        dispatch({ type: "close-overlay" })
        await refreshProject()
      } catch (error) {
        setNotice(error instanceof Error ? error.message : String(error))
      }
    },
    [
      closeDocument,
      dispatch,
      document,
      moveTarget,
      refreshProject,
      root,
      setNotice,
      postmanSession,
    ],
  )

  return {
    moveTarget,
    setMoveTarget,
    openMove: () => open("request-move"),
    openDelete: () => open("request-delete"),
    apply,
  }
}
