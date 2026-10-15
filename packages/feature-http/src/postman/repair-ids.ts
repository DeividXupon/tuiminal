import { readFile } from "node:fs/promises"
import { projectFileHash, atomicWriteProjectFile } from "@xupon/tuiminal-core/storage/project-files"
import { parseHttpFile } from "../model/http-file"
import { uniqueExistingHttpBlockNames } from "../model/http-file-serialization"
import {
  postmanRequestKey,
  postmanSidecar,
  readPostmanProvenance,
  replacePostmanProvenance,
} from "./sync"

const NAME_DIRECTIVE = /(^|\n)([ \t]*(?:#|\/\/)[ \t]*@name(?:[ \t]*=[ \t]*|[ \t]+))[^\r\n]*/im

export async function repairDuplicatePostmanRequestIds(root: string, filePath: string) {
  const metadataPath = await postmanSidecar(root, filePath)
  const metadata = await readPostmanProvenance(metadataPath)
  const source = await readFile(metadataPath.slice(0, -".postman.json".length), "utf8")
  const file = parseHttpFile(source, filePath)
  const keys = file.requests.map((block) => postmanRequestKey(block.blockId))
  const unique = uniqueExistingHttpBlockNames(keys)
  if (keys.every((key, index) => key === unique[index])) return false
  if (
    metadata.entries.length !== keys.length ||
    metadata.entries.some((entry, index) => entry.key !== keys[index])
  ) {
    throw new Error("IDs repetidos com associação Postman ambígua; importe a coleção novamente.")
  }
  let updated = source
  for (let index = file.requests.length - 1; index >= 0; index -= 1) {
    if (keys[index] === unique[index]) continue
    const block = file.requests[index]
    const nextKey = unique[index]
    if (!block || !nextKey) throw new Error("Bloco Postman inválido.")
    const original = source.slice(block.start, block.end)
    if (!NAME_DIRECTIVE.test(original)) {
      throw new Error("Request Postman sem diretiva de ID; importe a coleção novamente.")
    }
    const replacement = original.replace(
      NAME_DIRECTIVE,
      (_match, line: string, prefix: string) => `${line}${prefix}${nextKey}`,
    )
    updated = `${updated.slice(0, block.start)}${replacement}${updated.slice(block.end)}`
  }
  const reparsed = parseHttpFile(updated, filePath)
  if (
    reparsed.requests.length !== file.requests.length ||
    reparsed.requests.some(
      (block, index) =>
        postmanRequestKey(block.blockId) !== unique[index] ||
        block.name !== file.requests[index]?.name,
    )
  ) {
    throw new Error("A correção dos IDs Postman não pôde ser validada.")
  }
  const originalHash = projectFileHash(source)
  await atomicWriteProjectFile(root, filePath, updated, { expectedHash: originalHash })
  try {
    metadata.entries = metadata.entries.map((entry, index) => ({
      ...entry,
      key: unique[index] ?? entry.key,
    }))
    await replacePostmanProvenance(metadataPath, metadata)
  } catch (error) {
    await atomicWriteProjectFile(root, filePath, source, { expectedHash: projectFileHash(updated) })
    throw error
  }
  return true
}
