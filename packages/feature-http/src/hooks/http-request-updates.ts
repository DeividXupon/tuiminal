import type { ComponentProps, RefObject } from "react"
import type { HttpWorkspaceState } from "../model/types"
import type { HttpWorkspaceAction } from "../model/workspace"
import type { HttpWorkspaceBody } from "../ui/HttpWorkspaceBody"
import { applyHttpFileSelection } from "../model/file-selection"
import { applyHttpUrlQueryEdit } from "../model/url-query"
import { httpBodyFor } from "../runtime"

type EditorUpdates = Pick<
  ComponentProps<typeof HttpWorkspaceBody>,
  | "onQueryChange"
  | "onPathChange"
  | "onHeadersChange"
  | "onAuthChange"
  | "onBodyChange"
  | "onBodyFormChange"
  | "onBodyKindChange"
  | "onBodyMultipartChange"
  | "onBodyFilesChange"
>

export function httpRequestUpdates(
  stateRef: RefObject<HttpWorkspaceState>,
  dispatch: (action: HttpWorkspaceAction) => void,
): EditorUpdates {
  return {
    onQueryChange(documentId, query) {
      const request = stateRef.current.documents.find(
        (item) => item.request.id === documentId,
      )?.request
      if (request)
        dispatch({
          type: "update-request",
          documentId,
          patch: applyHttpUrlQueryEdit(request.url, query, documentId),
        })
    },
    onPathChange: (documentId, path) =>
      dispatch({ type: "update-request", documentId, patch: { path } }),
    onHeadersChange: (documentId, headers) =>
      dispatch({ type: "update-request", documentId, patch: { headers } }),
    onAuthChange: (documentId, auth) =>
      dispatch({ type: "update-request", documentId, patch: { auth } }),
    onBodyChange: (documentId, text) =>
      dispatch({
        type: "update-request",
        documentId,
        patch: { body: { ...httpBodyFor(stateRef.current, documentId), text } },
      }),
    onBodyFormChange: (documentId, form) =>
      dispatch({
        type: "update-request",
        documentId,
        patch: { body: { ...httpBodyFor(stateRef.current, documentId), form } },
      }),
    onBodyKindChange: (documentId, kind) =>
      dispatch({
        type: "update-request",
        documentId,
        patch: { body: { ...httpBodyFor(stateRef.current, documentId), kind } },
      }),
    onBodyMultipartChange: (documentId, multipart) =>
      dispatch({
        type: "update-request",
        documentId,
        patch: { body: { ...httpBodyFor(stateRef.current, documentId), multipart } },
      }),
    onBodyFilesChange(documentId, paths) {
      const request = stateRef.current.documents.find(
        (item) => item.request.id === documentId,
      )?.request
      if (request)
        dispatch({
          type: "update-request",
          documentId,
          patch: applyHttpFileSelection(request, paths),
        })
    },
  }
}
