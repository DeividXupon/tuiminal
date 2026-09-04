import { chmodSync, mkdirSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"

import type { DatabaseBatchExportFormat } from "../model/batch"

export function safeExportName(value: string) {
  const normalized = value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  return normalized.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "dados"
}

export function saveDatabaseBatchExport({
  directory,
  tableName,
  format,
  content,
  now = new Date(),
}: {
  directory: string
  tableName: string
  format: DatabaseBatchExportFormat
  content: string
  now?: Date
}) {
  const exportDirectory = resolve(directory, "tuiminal-exports")
  mkdirSync(exportDirectory, { recursive: true, mode: 0o700 })
  chmodSync(exportDirectory, 0o700)
  const timestamp = now.toISOString().replace(/[:.]/g, "-")
  const filename = `${safeExportName(tableName)}-${timestamp}.${format}`
  const path = join(exportDirectory, filename)
  writeFileSync(path, content, { encoding: "utf8", flag: "wx", mode: 0o600 })
  return path
}
