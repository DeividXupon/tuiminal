import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { isAbsolute, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { pastedHttpImportSourcePath } from "./import-source-path"

function terminalPaths(input: string) {
  const paths: string[] = []
  let value = ""
  let quote = ""
  for (let i = 0; i < input.length; i++) {
    const char = input[i] ?? ""
    if (char === "\\" && quote !== "'" && process.platform !== "win32") {
      value += input[++i] ?? "\\"
    } else if (quote) {
      if (char === quote) quote = ""
      else value += char
    } else if (char === "'" || char === '"') quote = char
    else if (/\s/u.test(char)) {
      if (value) paths.push(value)
      value = ""
    } else value += char
  }
  if (quote) return null
  if (value) paths.push(value)
  return paths
}

export function pastedHttpBodyFiles(input: string): string[] | null {
  const single = pastedHttpImportSourcePath(input)
  if (single && existsSync(single)) return [single]
  const lines = input
    .trim()
    .split(/\r?\n/u)
    .filter((line) => line && !line.startsWith("#"))
  const paths =
    lines.length > 1
      ? lines.map(pastedHttpImportSourcePath)
      : terminalPaths(input)?.map(resolveDroppedPath)
  if (!paths?.length) return null
  return paths.every((path): path is string => path !== null) ? paths : single ? [single] : null
}

function resolveDroppedPath(value: string) {
  try {
    if (value.startsWith("file://")) return fileURLToPath(value)
    if (value.startsWith("~/")) return resolve(homedir(), value.slice(2))
    return isAbsolute(value) ? resolve(value) : null
  } catch {
    return null
  }
}
