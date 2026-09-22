/** Find the changed hunk in a complete Git patch without relying on line numbers. */
export function latestChangedHunkIndex(previousPatch: string | null, patch: string): number | null {
  if (patch === previousPatch) return null
  const signatures = changedHunkSignatures(patch)
  if (!signatures.length) return null
  if (previousPatch === null) return signatures.length - 1

  const oldCounts = new Map<string, number>()
  const oldSignatures = changedHunkSignatures(previousPatch)
  for (const signature of oldSignatures) {
    oldCounts.set(signature, (oldCounts.get(signature) ?? 0) + 1)
  }
  let latest: number | null = null
  for (const [index, signature] of signatures.entries()) {
    const remaining = oldCounts.get(signature) ?? 0
    if (remaining > 0) oldCounts.set(signature, remaining - 1)
    else latest = index
  }
  // A reverted/deleted hunk has no new signature to follow. Keep a surviving
  // change visible while retaining the complete patch.
  return latest ?? (signatures.length < oldSignatures.length ? signatures.length - 1 : null)
}

function changedHunkSignatures(patch: string) {
  const signatures: string[] = []
  let changes: string[] | null = null
  for (const line of patch.split("\n")) {
    if (line.startsWith("@@ ")) {
      if (changes) signatures.push(changes.join("\n"))
      changes = []
    } else if (changes && (line.startsWith("+") || line.startsWith("-"))) {
      changes.push(line)
    }
  }
  if (changes) signatures.push(changes.join("\n"))
  return signatures
}

/** Logical code row of the newly edited line, excluding Git headers. */
export function changedHunkLineIndex(
  patch: string,
  hunkIndex: number,
  previousPatch: string | null = null,
): number | null {
  const current = changedHunkLines(patch, hunkIndex)
  const first = current[0]
  if (!first) return null
  if (previousPatch === null) return first.codeLine
  const oldCounts = new Map<string, number>()
  for (const change of changedHunkLines(previousPatch, hunkIndex)) {
    oldCounts.set(change.text, (oldCounts.get(change.text) ?? 0) + 1)
  }
  let latest: number | null = null
  for (const change of current) {
    const remaining = oldCounts.get(change.text) ?? 0
    if (remaining > 0) oldCounts.set(change.text, remaining - 1)
    else latest = change.codeLine
  }
  return latest ?? first.codeLine
}

function changedHunkLines(patch: string, hunkIndex: number) {
  const changes: { text: string; codeLine: number }[] = []
  let currentHunk = -1
  let codeLine = 0
  for (const line of patch.split("\n")) {
    if (line.startsWith("@@ ")) {
      currentHunk += 1
    } else if (currentHunk >= 0 && /^[ +-]/.test(line)) {
      if (currentHunk === hunkIndex && (line.startsWith("+") || line.startsWith("-")))
        changes.push({ text: line, codeLine })
      codeLine += 1
    }
  }
  return changes
}
