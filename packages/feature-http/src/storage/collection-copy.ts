import { randomUUID } from "node:crypto"
import { readFile } from "node:fs/promises"
import {
  atomicWriteProjectFile,
  projectFileHash,
  resolveSafeProjectFile,
} from "@xupon/tuiminal-core/storage/project-files"
import { parseHttpFile, requestFromHttpFile, type HttpFileRequestBlock } from "../model/http-file"
import { findHttpRequestStart } from "../model/http-file-syntax"
import type { HttpRequestDefinition } from "../model/types"
import { HttpCollectionConflictError } from "./collections"

export function copyHttpBlocks(
  blocks: readonly HttpFileRequestBlock[],
  nameFor: (block: HttpFileRequestBlock) => string,
) {
  const keys = new Map(
    blocks.map((block) => [block.blockId.split("#").at(-1) ?? "", `copy-${randomUUID()}`]),
  )
  return blocks
    .map((block) => {
      const name = nameFor(block)
      const lines = block.rawText.split(/\r?\n/)
      const start = findHttpRequestStart(lines)
      if (!start) throw new HttpCollectionConflictError("O bloco HTTP original não existe mais.")
      const key = keys.get(block.blockId.split("#").at(-1) ?? "")
      const prefix = lines
        .slice(0, start.index)
        .filter((line) => !/^\s*###|^\s*(?:#|\/\/)\s*@name\s/.test(line))
        .map((line) =>
          line.replace(
            /^(\s*(?:#|\/\/)\s*@depends\s+)(\S+)/,
            (_match, head: string, value: string) => `${head}${keys.get(value) ?? value}`,
          ),
        )
      const eol = block.rawText.includes("\r\n") ? "\r\n" : "\n"
      return [`### ${name}`, `# @name ${key}`, ...prefix, ...lines.slice(start.index)].join(eol)
    })
    .join("\n")
}

export async function duplicateHttpRequestInCollection(
  root: string,
  request: HttpRequestDefinition,
  name: string,
) {
  if (request.source.kind !== "file") throw new HttpCollectionConflictError("Request sem arquivo.")
  if (!name.trim() || /[\\/\0\r\n]/.test(name))
    throw new HttpCollectionConflictError("Use um nome sem barras ou caracteres de controle.")
  const requestSource = request.source
  const path = requestSource.path
  const safe = await resolveSafeProjectFile(root, path)
  const source = await readFile(safe.path, "utf8")
  if (projectFileHash(source) !== requestSource.sourceHash)
    throw new HttpCollectionConflictError(
      "A coleção mudou fora do Tuiminal; atualize antes de continuar.",
    )
  const parsed = parseHttpFile(source, path)
  const original = parsed.requests.find((block) => block.blockId === requestSource.blockId)
  if (!original) throw new HttpCollectionConflictError("O bloco HTTP original não existe mais.")
  if (parsed.requests.some((block) => block.name === name.trim()))
    throw new HttpCollectionConflictError("Já existe um request com esse nome na coleção.")
  const nextSource = `${source}\n${copyHttpBlocks([original], () => name.trim())}`
  await atomicWriteProjectFile(root, path, nextSource, { expectedHash: requestSource.sourceHash })
  const next = parseHttpFile(nextSource, path)
  const copied = next.requests.at(-1)
  if (!copied) throw new HttpCollectionConflictError("O request criado não pôde ser relido.")
  return requestFromHttpFile(next, copied)
}
