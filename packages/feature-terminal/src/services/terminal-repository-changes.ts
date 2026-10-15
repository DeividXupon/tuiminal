import { parseLiveDiffNumstat, parseLiveDiffStatus } from "../model/live-diff"
import type { TerminalRepositoryChanges } from "../model/terminal-context"

export type TerminalChangesReader = {
  headExists: () => Promise<boolean>
  numstat: () => Promise<string>
  newLines: (paths: string[]) => Promise<{ additions: number; partial: boolean }>
}

/** Net textual changes against HEAD; the index is never modified. */
export async function readTerminalRepositoryChanges(
  status: string,
  reader: TerminalChangesReader,
): Promise<TerminalRepositoryChanges> {
  const headExists = await reader.headExists()
  const changes = { additions: 0, deletions: 0, partial: false }
  if (headExists) {
    const stats = parseLiveDiffNumstat(await reader.numstat())
    for (const file of stats.values()) {
      changes.additions += file.additions ?? 0
      changes.deletions += file.deletions ?? 0
    }
  }
  const paths = parseLiveDiffStatus(status)
    .filter((entry) => entry.status === "??" || !headExists)
    .map((entry) => entry.path)
  if (paths.length) {
    const fresh = await reader.newLines(paths.slice(0, 1000))
    changes.additions += fresh.additions
    changes.partial = fresh.partial || paths.length > 1000
  }
  return changes
}
