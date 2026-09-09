import { metadataOnlyHistoryEntry } from "../model/history-privacy"
import type {
  DatabaseQueryHistoryEntry,
  DatabaseQueryHistorySessionParameter,
} from "../model/types"

// Never serialize this cache. Closing the app discards raw SQL and diagnostics.
export const HISTORY_SESSION_ENTRY_LIMIT = 200
export const HISTORY_SESSION_BYTE_LIMIT = 2_000_000
const content = new Map<string, { entry: DatabaseQueryHistoryEntry; bytes: number }>()
let contentBytes = 0

function forget(id: string) {
  contentBytes -= content.get(id)?.bytes ?? 0
  content.delete(id)
}

export function retainHistoryContent(entries: readonly DatabaseQueryHistoryEntry[]) {
  const retained = new Set(entries.map((entry) => entry.id))
  for (const id of content.keys()) if (!retained.has(id)) forget(id)
}

export function rememberHistoryContent(
  entry: DatabaseQueryHistoryEntry,
  parameters: readonly DatabaseQueryHistorySessionParameter[] = [],
) {
  const metadata = metadataOnlyHistoryEntry(entry)
  const values = new Map(parameters.map((parameter) => [parameter.position, parameter.value]))
  const session: DatabaseQueryHistoryEntry = {
    ...entry,
    storage: "metadata-only",
    readOnly: metadata.readOnly === true,
    parameterPreview: entry.parameterPreview.map((parameter) => {
      const revealedValue = values.get(parameter.position)
      return revealedValue === undefined ? parameter : { ...parameter, revealedValue }
    }),
  }
  const bytes = Buffer.byteLength(JSON.stringify(session), "utf8")
  forget(entry.id)
  if (bytes > HISTORY_SESSION_BYTE_LIMIT) return
  content.set(entry.id, { entry: session, bytes })
  contentBytes += bytes
  while (content.size > HISTORY_SESSION_ENTRY_LIMIT || contentBytes > HISTORY_SESSION_BYTE_LIMIT) {
    const oldest = content.keys().next().value
    if (oldest === undefined) break
    forget(oldest)
  }
}

export const restoreHistoryContent = (entry: DatabaseQueryHistoryEntry) =>
  content.get(entry.id)?.entry ?? entry
export function clearHistoryContent() {
  content.clear()
  contentBytes = 0
}
