import { readFile } from "node:fs/promises"
import { importPostmanAccountCollection } from "../importing/postman"
import { parseHttpFile, type ParsedHttpFile } from "../model/http-file"
import { serializeImportedHttpCollection } from "../storage/imports"
import type { PostmanApi } from "./api"
import { hasLegacyIncompletePostmanLinks } from "./association-validation"
import {
  postmanProvenanceEntries,
  postmanRemoteHash,
  postmanRequestKey,
  postmanSidecar,
  readPostmanProvenance,
  replacePostmanProvenance,
  type PostmanProvenance,
} from "./sync"

const INVALID_ASSOCIATION = "Associação Postman inválida. Importe a coleção novamente."

function repairedEntries(file: ParsedHttpFile, metadata: PostmanProvenance, remote: unknown) {
  const { report } = importPostmanAccountCollection(remote)
  const original = parseHttpFile(serializeImportedHttpCollection(report), file.path)
  const entries = postmanProvenanceEntries(original, remote)
  const byKey = new Map(entries.map((entry) => [entry.key, entry]))
  const keys = file.requests.map((block) => postmanRequestKey(block.blockId))
  if (
    original.requests.length !== keys.length ||
    new Set(keys).size !== keys.length ||
    keys.some((key) => !byKey.has(key)) ||
    metadata.entries.some(
      (entry) => JSON.stringify(entry.baseline) !== JSON.stringify(byKey.get(entry.key)?.baseline),
    )
  ) {
    throw new Error(INVALID_ASSOCIATION)
  }
  return keys.flatMap((key) => byKey.get(key) ?? [])
}

export async function repairPostmanDraftAssociations(
  root: string,
  filePath: string,
  api: Pick<PostmanApi, "collection">,
) {
  const path = await postmanSidecar(root, filePath)
  const metadata = await readPostmanProvenance(path)
  const sourcePath = path.slice(0, -".postman.json".length)
  const source = await readFile(sourcePath, "utf8")
  const file = parseHttpFile(source, filePath)
  if (!hasLegacyIncompletePostmanLinks(file, metadata)) return false
  const remote = await api.collection(metadata.collectionId)
  if (metadata.collectionHash !== postmanRemoteHash(remote)) throw new Error(INVALID_ASSOCIATION)
  const entries = repairedEntries(file, metadata, remote)
  if (
    (await readFile(sourcePath, "utf8")) !== source ||
    JSON.stringify(await readPostmanProvenance(path)) !== JSON.stringify(metadata)
  )
    throw new Error(INVALID_ASSOCIATION)
  await replacePostmanProvenance(path, { ...metadata, entries, requestMappingVersion: 2 })
  return true
}
