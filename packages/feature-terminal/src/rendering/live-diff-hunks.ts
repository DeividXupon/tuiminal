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

export type RecentDiffLine = { line: number; kind: "added" | "removed" }
export type LiveDiffPatchHistory = { baseline: string; latest: string }
export type PreparedLiveDiffPatch = { patch: string; separatorLines: number[] }

const MAX_HIGHLIGHT_HISTORY_FILES = 16

/** Keep each file's first patch so earlier blue rows survive later edits and selection changes. */
export function observeLiveDiffPatch(
  history: Map<string, LiveDiffPatchHistory>,
  key: string,
  patch: string,
  initialIsRecent = false,
) {
  const previous = history.get(key)
  const initialPatch = initialIsRecent ? "" : null
  const highlighted = recentDiffLines(previous?.baseline ?? initialPatch, patch)
  const recent = recentDiffLines(previous?.latest ?? initialPatch, patch)
  history.delete(key)
  history.set(key, { baseline: previous?.baseline ?? patch, latest: patch })
  if (history.size > MAX_HIGHLIGHT_HISTORY_FILES) {
    const oldest = history.keys().next().value
    if (oldest !== undefined) history.delete(oldest)
  }
  return { highlighted, recent, changed: patch !== previous?.latest }
}

/** Add one valid, numberless context row between unified hunks for visual separation. */
export function prepareLiveDiffPatch(patch: string): PreparedLiveDiffPatch {
  const lines = patch.split("\n")
  const hunkHeaders = lines
    .map((line, index) => (line.startsWith("@@ ") ? index : -1))
    .filter((index) => index >= 0)

  const separateAfter = new Set<number>()
  for (let index = 0; index < hunkHeaders.length - 1; index += 1) {
    const header = hunkHeaders[index]
    const next = hunkHeaders[index + 1]
    if (header === undefined || next === undefined) continue
    if (lines.slice(header + 1, next).some((line) => line.startsWith("diff --git "))) continue
    const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/.exec(lines[header] ?? "")
    if (!match) continue
    const oldCount = Number(match[2] ?? 1) + 1
    const newCount = Number(match[4] ?? 1) + 1
    lines[header] = `@@ -${match[1]},${oldCount} +${match[3]},${newCount} @@${match[5]}`
    separateAfter.add(next)
  }

  if (!separateAfter.size) return { patch, separatorLines: [] }
  const output: string[] = []
  const separatorLines: number[] = []
  let codeLine = 0
  let inHunk = false
  for (const [index, line] of lines.entries()) {
    if (separateAfter.has(index)) {
      output.push(" ")
      separatorLines.push(codeLine)
      codeLine += 1
    }
    output.push(line)
    if (line.startsWith("@@ ")) inHunk = true
    else if (inHunk && /^[ +-]/.test(line)) codeLine += 1
  }
  return { patch: output.join("\n"), separatorLines }
}

/** Lines newly present in the current Git patch relative to the previous snapshot. */
export function recentDiffLines(previousPatch: string | null, patch: string): RecentDiffLine[] {
  if (previousPatch === null || previousPatch === patch) return []
  const counts = new Map<string, number>()
  for (const change of patchChangeRows(previousPatch))
    counts.set(change.text, (counts.get(change.text) ?? 0) + 1)
  const recent: RecentDiffLine[] = []
  for (const change of patchChangeRows(patch)) {
    const remaining = counts.get(change.text) ?? 0
    if (remaining > 0) counts.set(change.text, remaining - 1)
    else recent.push({ line: change.line, kind: change.kind })
  }
  return recent
}

function patchChangeRows(patch: string) {
  const changes: Array<RecentDiffLine & { text: string }> = []
  let inHunk = false
  let codeLine = 0
  for (const text of patch.split("\n")) {
    if (text.startsWith("@@ ")) {
      inHunk = true
      continue
    }
    if (!inHunk) continue
    const marker = text[0]
    if (marker === "+" || marker === "-") {
      changes.push({ text, line: codeLine, kind: marker === "+" ? "added" : "removed" })
      codeLine++
    } else if (marker === " ") codeLine++
  }
  return changes
}
