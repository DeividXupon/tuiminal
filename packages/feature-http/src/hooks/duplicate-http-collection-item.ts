import { readFile } from "node:fs/promises"
import { resolveSafeProjectFile } from "@xupon/tuiminal-core/storage/project-files"
import { parseHttpFile, requestFromHttpFile } from "../model/http-file"
import type { HttpDocumentState } from "../model/types"
import type { HttpWorkspaceAction } from "../model/workspace"
import type { HttpCollectionTreeRow } from "../model/collection-tree"
import type { PostmanApi } from "../postman/api"
import { duplicatePostmanCollection, duplicatePostmanFolder } from "../postman/duplicate"
import { duplicatePostmanRequest } from "../postman/mutations"
import { duplicateHttpRequestInCollection } from "../storage/collection-copy"
import { duplicateHttpCollection, duplicateHttpFolder } from "../storage/collection-management"

export async function duplicateCollectionItem(
  root: string,
  files: { path: string; sourceHash: string }[],
  row: HttpCollectionTreeRow | null,
  name: string,
  api?: PostmanApi,
) {
  if (!row) return null
  if (row.kind === "request") {
    const request = api
      ? await duplicatePostmanRequest(root, api, row.item.request, name)
      : await duplicateHttpRequestInCollection(root, row.item.request, name)
    return { filePath: row.path, request }
  }
  if (row.kind === "directory") {
    await duplicateHttpFolder(root, row.path, name, files)
    return null
  }
  const hash = files.find((file) => file.path === row.path)?.sourceHash
  if (!hash) throw new Error("A coleção não está mais na árvore; atualize antes de continuar.")
  if (api) {
    if (row.kind === "folder")
      await duplicatePostmanFolder(root, api, row.path, row.folderId, name, hash)
    else await duplicatePostmanCollection(root, api, row.path, name, hash)
  } else await duplicateHttpCollection(root, row.path, name, hash)
  return null
}

// Appending a copy changes the file hash without changing its existing requests.
// Keep clean open originals saveable; preserve any edits made during the copy.
export async function refreshDuplicatedSource(
  root: string,
  row: HttpCollectionTreeRow | null,
  getDocuments: () => HttpDocumentState[],
  dispatch: (action: HttpWorkspaceAction) => void,
) {
  if (!row || !["request", "folder"].includes(row.kind)) return
  const path = row.path
  const safe = await resolveSafeProjectFile(root, path)
  const file = parseHttpFile(await readFile(safe.path, "utf8"), path)
  for (const document of getDocuments()) {
    const source = document.request.source
    if (
      source.kind !== "file" ||
      source.path !== path ||
      document.revision !== document.savedRevision
    )
      continue
    const block = file.requests.find((candidate) => candidate.blockId === source.blockId)
    if (!block) continue
    const next = requestFromHttpFile(file, block)
    const updated = { ...document.request, source: { ...source, sourceHash: file.sourceHash } }
    if (JSON.stringify(updated) !== JSON.stringify(next)) continue
    dispatch({ type: "commit-saved-document", documentId: document.request.id, request: next })
  }
}
