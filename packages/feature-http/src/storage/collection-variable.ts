import { readFile } from "node:fs/promises"
import {
  atomicWriteProjectFile,
  resolveSafeProjectFile,
  projectFileHash,
} from "@xupon/tuiminal-core/storage/project-files"
import { parseHttpFile } from "../model/http-file"

export async function localCollectionVariableEditor(
  root: string,
  path: string,
  name: string,
  refresh: () => Promise<void>,
  onSaved?: (path: string, beforeHash: string, sourceHash: string) => void,
) {
  const resolved = await resolveSafeProjectFile(root, path)
  const before = parseHttpFile(await readFile(resolved.path, "utf8"), path)
  if (!Object.hasOwn(before.variables, name)) throw Error("Variável não encontrada.")
  return async (value: string) => {
    if (/[\r\n]/.test(value)) throw Error("O valor da variável deve ocupar uma linha.")
    const file = await resolveSafeProjectFile(root, path)
    const source = await readFile(file.path, "utf8")
    const current = parseHttpFile(source, path)
    if (current.variables[name] === value) return
    if (current.variables[name] !== before.variables[name])
      throw Error("A variável mudou. Reabra para carregar o valor atual.")
    const pattern = /^([ \t]*@([A-Za-z_$][\w$.-]*)[ \t]*=[ \t]*)(.*?)(\r?)$/gm
    const matches = [...source.matchAll(pattern)].filter((match) => match[2] === name)
    const match = matches.at(-1)
    if (!match) throw Error("Variável não encontrada.")
    const replacement = `${match[1]}${value}${match[4] ?? ""}`
    const next =
      source.slice(0, match.index) + replacement + source.slice(match.index + match[0].length)
    await atomicWriteProjectFile(root, path, next, { expectedHash: projectFileHash(source) })
    onSaved?.(path, current.sourceHash, projectFileHash(next))
    await refresh()
  }
}
