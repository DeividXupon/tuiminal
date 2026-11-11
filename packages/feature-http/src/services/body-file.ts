import { accessSync, constants, realpathSync, statSync } from "node:fs"
import { homedir } from "node:os"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

export const HTTP_BODY_FILE_MAX_BYTES = 256 * 1024 * 1024

export function resolveHttpBodyFiles(values: string[], root?: string) {
  const paths = [...new Set(values.map((value) => resolveHttpBodyFile(value, root)))]
  const size = paths.reduce((total, path) => total + statSync(path).size, 0)
  if (size > HTTP_BODY_FILE_MAX_BYTES) throw new Error("Os arquivos multipart excedem 256 MB.")
  return paths
}

export function resolveHttpBodyFile(input: string, root = process.cwd()) {
  if (!input.trim()) throw new Error("Selecione um arquivo para o body.")
  let path: string
  try {
    const expanded = input.startsWith("~/") ? resolve(homedir(), input.slice(2)) : input
    path = realpathSync(
      expanded.startsWith("file://") ? fileURLToPath(expanded) : resolve(root, expanded),
    )
  } catch {
    throw new Error(`O arquivo de body não foi encontrado: ${input}.`)
  }
  const info = statSync(path)
  if (!info.isFile()) throw new Error("O caminho do body não aponta para um arquivo.")
  if (info.size > HTTP_BODY_FILE_MAX_BYTES) throw new Error("O arquivo de body excede 256 MB.")
  try {
    accessSync(path, constants.R_OK)
  } catch {
    throw new Error("Não foi possível ler o arquivo selecionado.")
  }
  return path
}
