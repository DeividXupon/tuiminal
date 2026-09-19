import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { atomicWriteFileSync, fileContentHash } from "@xupon/tuiminal-core/storage/atomic-file"
import { canonicalRunnerRoot, RUNNER_SETTINGS_PATH } from "./runner-paths"
import {
  parseRunnerYaml,
  runnerYamlDocument,
  setRunnerYamlDefinition,
} from "../model/configuration-yaml"

export function runnerYamlPath(root: string, settingsPath = RUNNER_SETTINGS_PATH) {
  return join(
    dirname(settingsPath),
    "runner",
    fileContentHash(canonicalRunnerRoot(root)),
    "runner.yaml",
  )
}
export function readRunnerYaml(root: string, settingsPath = RUNNER_SETTINGS_PATH) {
  const path = runnerYamlPath(root, settingsPath)
  try {
    const source = readFileSync(path, "utf8")
    return { path, source, hash: fileContentHash(source) }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    return { path, source: null, hash: null }
  }
}
export function saveRunnerYaml(path: string, source: string, expectedHash: string | null) {
  parseRunnerYaml(source)
  return atomicWriteFileSync(path, source, { expectedHash, mode: 0o600, backup: true })
}
export function mutateRunnerYaml(
  root: string,
  section: "commands" | "flows",
  id: string,
  value: unknown,
  settingsPath = RUNNER_SETTINGS_PATH,
) {
  const current = readRunnerYaml(root, settingsPath)
  if (current.source === null) return false
  const document = runnerYamlDocument(current.source)
  if (value === undefined) document.deleteIn([section, id])
  else setRunnerYamlDefinition(document, section, id, value)
  saveRunnerYaml(current.path, document.toString({ lineWidth: 0 }), current.hash)
  return true
}
