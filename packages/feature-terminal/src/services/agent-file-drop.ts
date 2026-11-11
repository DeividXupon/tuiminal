import { stat } from "node:fs/promises"
import { homedir } from "node:os"
import { basename, isAbsolute, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { droppedAgentPaths, isAgentDropPath } from "../model/agent-file-drop"

export type AgentDroppedFile = {
  path: string
  name: string
  size: number
  modified: number
  changed: number
  device: number
  inode: number
}

function localPath(value: string) {
  if (value.startsWith("file://")) return fileURLToPath(value)
  if (value.startsWith("~/")) return resolve(homedir(), value.slice(2))
  return isAbsolute(value) ? resolve(value) : null
}

async function inspect(value: string): Promise<AgentDroppedFile | null> {
  try {
    const path = localPath(value)
    if (!path || /[\p{Cc}\p{Cf}]/u.test(path)) return null
    const info = await stat(path)
    if (!info.isFile()) return null
    return {
      path,
      name: basename(path),
      size: info.size,
      modified: info.mtimeMs,
      changed: info.ctimeMs,
      device: info.dev,
      inode: info.ino,
    }
  } catch {
    return null
  }
}

export async function inspectAgentFileDrop(text: string): Promise<AgentDroppedFile[] | null> {
  if (text.length > 32_768) return null
  const trimmed = text.trim()
  // File managers also send one unquoted path containing spaces.
  if (isAgentDropPath(trimmed)) {
    const single = await inspect(trimmed)
    if (single) return [single]
  }
  const lines = trimmed.split(/\r?\n/u).filter(Boolean)
  if (lines.length > 1 && lines.length <= 20) {
    const files = await Promise.all(lines.map(inspect))
    if (files.every((file): file is AgentDroppedFile => file !== null)) return files
  }
  const paths = droppedAgentPaths(text, process.platform === "win32")
  if (!paths) return null
  const files = await Promise.all(paths.map(inspect))
  return files.every((file): file is AgentDroppedFile => file !== null) ? files : null
}
