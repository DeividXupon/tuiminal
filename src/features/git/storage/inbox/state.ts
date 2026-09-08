import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"

const configRoot = process.env.XDG_CONFIG_HOME?.trim() || join(homedir(), ".config")
export const INBOX_STATE_PATH = join(configRoot, "tuiminal", "git-inbox.json")

function parsedSavedIds(value: unknown) {
  if (!value || typeof value !== "object") return []
  const savedIds = (value as Record<string, unknown>).savedIds
  if (!Array.isArray(savedIds)) return []
  return [
    ...new Set(savedIds.filter((id): id is string => typeof id === "string" && id.length > 0)),
  ]
}

export function loadInboxSavedIds(path = INBOX_STATE_PATH) {
  if (!existsSync(path)) return new Set<string>()
  try {
    return new Set(parsedSavedIds(JSON.parse(readFileSync(path, "utf8"))))
  } catch {
    return new Set<string>()
  }
}

export function saveInboxSavedIds(savedIds: ReadonlySet<string>, path = INBOX_STATE_PATH) {
  const directory = dirname(path)
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  try {
    writeFileSync(
      temporary,
      `${JSON.stringify({ version: 1, savedIds: [...savedIds] }, null, 2)}\n`,
      {
        encoding: "utf8",
        mode: 0o600,
        flag: "wx",
      },
    )
    renameSync(temporary, path)
    chmodSync(path, 0o600)
  } catch (error) {
    if (existsSync(temporary)) unlinkSync(temporary)
    throw error
  }
}
