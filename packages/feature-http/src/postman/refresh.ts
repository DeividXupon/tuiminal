import { randomUUID } from "node:crypto"
import { readFile } from "node:fs/promises"
import {
  atomicWriteProjectFile,
  projectFileHash,
  resolveSafeProjectFile,
} from "@xupon/tuiminal-core/storage/project-files"
import { parseHttpFile, requestFromHttpFile, serializeHttpRequestBlock } from "../model/http-file"
import { createScratchRequest } from "../model/workspace"
import type { HttpCredentialStore } from "../storage/environments"
import { deleteGlobalHttpEnvironment } from "../storage/global-environments"
import { preparePostmanCollection, savePostmanVariables } from "./pull"
import {
  postmanProvenanceEntries,
  postmanRemoteFolders,
  postmanRemoteHash,
  postmanRemoteRequests,
  postmanRequestKey,
  postmanRequestSnapshot,
  postmanSidecar,
  readPostmanProvenance,
  type PostmanProvenance,
} from "./sync"

const LOCAL_CHANGES = "A coleção tem alterações locais; resolva-as antes de atualizar do Postman."

function assertCleanSource(source: string, path: string, metadata: PostmanProvenance) {
  const file = parseHttpFile(source, path)
  const keys = new Set(metadata.entries.map((entry) => entry.key))
  if (keys.size !== metadata.entries.length || file.requests.length !== keys.size)
    throw new Error(LOCAL_CHANGES)
  const defaults = createScratchRequest("postman-refresh")
  const canonical = file.requests.map((block) => {
    const request = requestFromHttpFile(file, block)
    const entry = metadata.entries.find((item) => item.key === postmanRequestKey(block.blockId))
    if (
      !block.editable ||
      !entry ||
      !keys.delete(entry.key) ||
      postmanRemoteHash(entry.baseline) !== postmanRemoteHash(postmanRequestSnapshot(request))
    )
      throw new Error(LOCAL_CHANGES)
    // Options, assertions, comments and unsupported local directives are not in
    // Postman's baseline. Refuse their replacement as well as pending pushes.
    return serializeHttpRequestBlock({
      ...request,
      url: block.query.length ? request.url : block.url,
      query: block.query.length ? request.query : [],
      options: defaults.options,
      assertions: [],
      chain: { extract: [] },
    })
  })
  if (source.trim() !== canonical.join("\n").trim()) throw new Error(LOCAL_CHANGES)
}

function refreshedSource(
  prepared: Awaited<ReturnType<typeof preparePostmanCollection>>,
  metadata: PostmanProvenance,
) {
  const items = postmanRemoteRequests(prepared.document)
  const used = new Set<string>()
  return prepared.report.requests
    .map((request, index) => {
      const entry = metadata.entries.find((item) => item.requestId === items[index]?.id)
      const key = entry?.key ?? `postman-${randomUUID()}`
      if (used.has(key))
        throw new Error("Associação Postman inválida. Importe a coleção novamente.")
      used.add(key)
      return serializeHttpRequestBlock(request, "\n", key)
    })
    .join("\n")
}

/** Explicit refresh of a clean linked copy; it never writes to Postman. */
export async function refreshPostmanCollection(
  root: string,
  api: Parameters<typeof preparePostmanCollection>[0],
  path: string,
  assertReady: () => void = () => {},
  credentialStore?: HttpCredentialStore,
) {
  assertReady()
  const sidecar = await postmanSidecar(root, path)
  const metadataSource = await readFile(sidecar, "utf8")
  const metadata = await readPostmanProvenance(sidecar)
  const source = await readFile((await resolveSafeProjectFile(root, path)).path, "utf8")
  assertCleanSource(source, path, metadata)
  if (!metadata.workspaceId) throw new Error("Selecione um workspace Postman.")
  const prepared = await preparePostmanCollection(api, {
    workspaceId: metadata.workspaceId,
    collectionId: metadata.collectionId,
  })
  const nextSource = refreshedSource(prepared, metadata)
  if (Buffer.byteLength(nextSource) > 1_000_000)
    throw new Error("A coleção convertida excede o limite de 1 MB por arquivo HTTP.")
  const file = parseHttpFile(nextSource, path)
  const nextMetadata: PostmanProvenance = {
    ...metadata,
    requestMappingVersion: 2,
    collectionName: prepared.selected.name,
    collectionHash: postmanRemoteHash(prepared.document),
    folders: postmanRemoteFolders(prepared.document),
    entries: postmanProvenanceEntries(file, prepared.document),
  }
  if (
    new Set(nextMetadata.entries.map((entry) => entry.requestId)).size !==
    nextMetadata.entries.length
  )
    throw new Error("Associação Postman inválida. Importe a coleção novamente.")
  const environmentName = await savePostmanVariables(
    root,
    prepared.selected.name,
    prepared.remoteEnvironment.name,
    prepared.variables,
    credentialStore,
  )
  let published = false
  try {
    assertReady()
    if ((await readFile(sidecar, "utf8")) !== metadataSource)
      throw new Error("A coleção local mudou; atualize antes de editar a pasta.")
    await atomicWriteProjectFile(root, path, nextSource, { expectedHash: projectFileHash(source) })
    published = true
    await atomicWriteProjectFile(root, `${path}.postman.json`, JSON.stringify(nextMetadata), {
      expectedHash: projectFileHash(metadataSource),
    })
  } catch (error) {
    if (published) {
      await atomicWriteProjectFile(root, path, source, {
        expectedHash: projectFileHash(nextSource),
      }).then(
        () => {
          published = false
        },
        () => {},
      )
    }
    if (!published && environmentName)
      await deleteGlobalHttpEnvironment(root, environmentName, credentialStore).catch(() => {})
    throw error
  }
  return { file, environmentName, warnings: prepared.warnings }
}
