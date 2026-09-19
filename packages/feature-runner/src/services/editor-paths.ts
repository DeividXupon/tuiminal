import { readdir, stat } from "node:fs/promises"
import { dirname, isAbsolute, join, resolve, sep } from "node:path"
import type { RunnerConfiguredCommand } from "../model/config"
import { rankRunnerYamlSuggestions } from "../model/yaml-editor"

export async function runnerDirectorySuggestions(root: string, value: string) {
  const path = resolve(root, value || ".")
  const directory = value.endsWith(sep) || !value ? path : dirname(path)
  try {
    const entries = await readdir(directory, { withFileTypes: true })
    const prefix =
      value.endsWith(sep) || !value ? value : value.slice(0, value.lastIndexOf(sep) + 1)
    return rankRunnerYamlSuggestions(
      entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => `${prefix}${entry.name}${sep}`)
        .sort(),
      value,
    )
  } catch {
    return []
  }
}
export async function resolveRunnerEditorPaths(root: string, command: RunnerConfiguredCommand) {
  const cwd = command.cwd ? resolve(root, command.cwd) : root
  if (!(await stat(cwd)).isDirectory()) throw new Error("Diretório de execução inválido.")
  return {
    ...command,
    cwd,
    ...(command.envFile
      ? { envFile: isAbsolute(command.envFile) ? command.envFile : join(root, command.envFile) }
      : {}),
  }
}
