import { postmanInheritedScripts } from "./inherited-settings"
import { liveSnapshotHashes } from "./live-snapshot"
import { liveRequestOptions } from "./live-settings"
import { importPostmanAccountCollection } from "../importing/postman"
import { record } from "../importing/shared"
import { parseHttpFile, serializeHttpRequestBlock } from "../model/http-file"
import type { HttpRequestDefinition } from "../model/types"
import type { PostmanCollection } from "./api"
import { postmanRemoteFolders, postmanRemoteHash, postmanRemoteRequests } from "./sync"
import { postmanRequestSnapshot } from "./snapshot"

export function postmanValues(source: unknown) {
  const values: Record<string, string> = Object.create(null)
  if (!Array.isArray(source)) return values
  for (const raw of source) {
    const entry = record(raw)
    if (
      entry?.enabled !== false &&
      entry?.disabled !== true &&
      typeof entry?.key === "string" &&
      typeof entry.value === "string"
    )
      values[entry.key] = entry.value
  }
  return values
}

export function liveRequestBaseline(
  request: HttpRequestDefinition,
  secrets: Record<string, string> = {},
) {
  return JSON.stringify({
    snapshot: postmanRequestSnapshot(request),
    hashes: liveSnapshotHashes(request, secrets),
    options: liveRequestOptions(request),
    assertions: request.assertions,
    chain: request.chain,
  })
}

/** A file-shaped view for the existing tree/runner. No file or sidecar is read or written. */
export function livePostmanCollection(
  selected: PostmanCollection,
  document: Record<string, unknown>,
) {
  const { report, privateValues } = importPostmanAccountCollection(document, true)
  const remote = postmanRemoteRequests(document)
  const inheritedScripts = postmanInheritedScripts(document)
  const path = `postman/${selected.id}.http`
  const remoteName = record(document.info)?.name
  const collectionName = typeof remoteName === "string" ? remoteName : selected.name
  if (remote.length !== report.requests.length) throw new Error("Coleção Postman inválida.")
  const requests = report.requests.map((request, index) => {
    const requestId = remote[index]?.id
    const key = typeof requestId === "string" ? requestId : `unavailable-${index}`
    const id = `${path}#${key}`
    // Importer IDs include traversal positions. Normalize them to remote identity so
    // inserting or moving another request does not change this draft's field IDs.
    const normalized = { ...request, id, inheritedScripts: inheritedScripts.get(key) ?? [] }
    normalized.description ??= ""
    normalized.source = {
      kind: "file",
      path,
      blockId: id,
      sourceHash: postmanRemoteHash(remote[index]),
      supported: typeof requestId === "string",
      ...(typeof requestId === "string"
        ? {
            postman: {
              collectionId: selected.uid ?? selected.id,
              collectionName,
              requestId,
              baseline: liveRequestBaseline(normalized, Object.fromEntries(privateValues)),
            },
          }
        : {}),
    }
    return normalized
  })
  const file = parseHttpFile(
    requests.map((request) => serializeHttpRequestBlock(request)).join("\n"),
    path,
  )
  file.requests.forEach((block, index) => {
    const request = requests[index]
    if (request) block.blockId = request.id
  })
  const name = record(document.info)?.name
  return {
    selected: { ...selected, name: typeof name === "string" ? name : selected.name },
    document,
    file: { ...file, name: typeof name === "string" ? name : selected.name, absolutePath: "" },
    requests: requests.map((request) => ({ filePath: path, request })),
    folders: postmanRemoteFolders(document).map((folder) => ({ ...folder, filePath: path })),
    variables: postmanValues(document.variable),
    privateValues: Object.fromEntries(privateValues),
    warnings: [
      ...report.warnings,
      ...report.ignored.filter((entry) => entry !== "Coleção: variáveis"),
    ],
  }
}

export type LivePostmanCollection = ReturnType<typeof livePostmanCollection>
