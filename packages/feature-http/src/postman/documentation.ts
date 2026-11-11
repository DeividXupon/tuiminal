import { readFile } from "node:fs/promises"
import { postmanRequestDescription } from "../importing/postman-description"
import { parseHttpFile } from "../model/http-file"
import type { HttpRequestDefinition } from "../model/types"
import type { PostmanApi } from "./api"
import { assertPostmanRequestLinks } from "./association-validation"
import {
  postmanRemoteRequests,
  postmanRequestKey,
  postmanSidecar,
  readPostmanProvenance,
} from "./sync"

export function hasPostmanDocumentationSource(request: HttpRequestDefinition) {
  return (
    request.source.kind === "file" &&
    request.source.path.replaceAll("\\", "/").startsWith("postman/")
  )
}

export async function readPostmanRequestDocumentation(
  root: string,
  api: Pick<PostmanApi, "collection">,
  request: HttpRequestDefinition,
) {
  if (request.source.kind !== "file") return ""
  const path = await postmanSidecar(root, request.source.path)
  const metadata = await readPostmanProvenance(path)
  const source = await readFile(path.slice(0, -".postman.json".length), "utf8")
  const file = parseHttpFile(source, request.source.path)
  assertPostmanRequestLinks(file, metadata)
  const key = postmanRequestKey(request.source.blockId)
  const entries = metadata.entries.filter((entry) => entry.key === key)
  const blocks = file.requests.filter((block) => postmanRequestKey(block.blockId) === key)
  if (entries.length !== 1 || blocks.length !== 1 || !entries[0]) {
    throw new Error("Esta request não possui ID remoto; importe a coleção novamente.")
  }
  const collection = await api.collection(metadata.collectionId)
  const items = postmanRemoteRequests(collection).filter(
    (item) => item.id === entries[0]?.requestId,
  )
  if (items.length !== 1 || !items[0]) throw new Error("Recurso Postman não encontrado.")
  return postmanRequestDescription(items[0])
}
