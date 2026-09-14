export type GitPartialStageGranularity = "hunk" | "line"
export type GitPartialStageSource = "unstaged" | "staged"

export type GitPartialStageLine = {
  id: string
  kind: "added" | "removed" | "context" | "meta"
  raw: string
  content: string
  oldLine: number | null
  newLine: number | null
}

export type GitPartialStageHunk = {
  id: string
  header: string
  heading: string
  oldStart: number
  newStart: number
  lines: GitPartialStageLine[]
}

export type GitPartialStageDocument = {
  source: string
  header: string[]
  hunks: GitPartialStageHunk[]
}

export type GitPartialStageTarget = {
  id: string
  hunkIndex: number
  lineIndex: number | null
  rowIndex: number
}

export type GitPartialStageItem = {
  id: string
  source: GitPartialStageSource
  target: GitPartialStageTarget
}

type MutableHunk = Omit<GitPartialStageHunk, "lines"> & {
  lines: GitPartialStageLine[]
  oldCursor: number
  newCursor: number
}

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/

function normalizedPatchHeader(lines: readonly string[]) {
  const diff = lines.find((line) => line.startsWith("diff --git "))
  const oldFile = lines.find((line) => line.startsWith("--- "))
  const newFile = lines.find((line) => line.startsWith("+++ "))
  return diff && oldFile && newFile ? [diff, oldFile, newFile] : []
}

function finishHunk(hunks: GitPartialStageHunk[], current: MutableHunk | null) {
  if (!current) return
  const { oldCursor: _oldCursor, newCursor: _newCursor, ...hunk } = current
  hunks.push(hunk)
}

function createHunk(match: RegExpMatchArray, header: string, index: number): MutableHunk {
  const oldStart = Number(match[1])
  const newStart = Number(match[3])
  return {
    id: `hunk:${index}`,
    header,
    heading: match[5] ?? "",
    oldStart,
    newStart,
    oldCursor: oldStart,
    newCursor: newStart,
    lines: [],
  }
}

function appendPatchLine(hunk: MutableHunk, raw: string, hunkIndex: number) {
  const lineIndex = hunk.lines.length
  const id = `line:${hunkIndex}:${lineIndex}`
  if (raw.startsWith("+")) {
    hunk.lines.push({
      id,
      kind: "added",
      raw,
      content: raw.slice(1),
      oldLine: null,
      newLine: hunk.newCursor,
    })
    hunk.newCursor += 1
  } else if (raw.startsWith("-")) {
    hunk.lines.push({
      id,
      kind: "removed",
      raw,
      content: raw.slice(1),
      oldLine: hunk.oldCursor,
      newLine: null,
    })
    hunk.oldCursor += 1
  } else if (raw.startsWith(" ")) {
    hunk.lines.push({
      id,
      kind: "context",
      raw,
      content: raw.slice(1),
      oldLine: hunk.oldCursor,
      newLine: hunk.newCursor,
    })
    hunk.oldCursor += 1
    hunk.newCursor += 1
  } else {
    hunk.lines.push({ id, kind: "meta", raw, content: raw, oldLine: null, newLine: null })
  }
}

export function parseGitPartialStagePatch(source: string): GitPartialStageDocument | null {
  const lines = source.replace(/\r\n?/g, "\n").split("\n")
  const header = normalizedPatchHeader(lines)
  if (!header.length) return null
  const hunks: GitPartialStageHunk[] = []
  let current: MutableHunk | null = null

  for (const line of lines) {
    const match = line.match(HUNK_HEADER)
    if (match) {
      finishHunk(hunks, current)
      current = createHunk(match, line, hunks.length)
    } else if (current && line) {
      appendPatchLine(current, line, hunks.length)
    }
  }
  finishHunk(hunks, current)
  return hunks.length ? { source, header, hunks } : null
}

export function gitPartialStageTargets(
  document: GitPartialStageDocument,
  granularity: GitPartialStageGranularity,
) {
  const targets: GitPartialStageTarget[] = []
  let rowIndex = 0
  for (const [hunkIndex, hunk] of document.hunks.entries()) {
    if (granularity === "hunk") {
      targets.push({ id: hunk.id, hunkIndex, lineIndex: null, rowIndex })
    }
    rowIndex += 1
    for (const [lineIndex, line] of hunk.lines.entries()) {
      if (granularity === "line" && (line.kind === "added" || line.kind === "removed")) {
        targets.push({ id: line.id, hunkIndex, lineIndex, rowIndex })
      }
      rowIndex += 1
    }
  }
  return targets
}

export function gitPartialStageChangeLineIds(document: GitPartialStageDocument) {
  return document.hunks.flatMap((hunk) =>
    hunk.lines
      .filter((line) => line.kind === "added" || line.kind === "removed")
      .map((line) => line.id),
  )
}

export function gitPartialStageTargetLineIds(
  document: GitPartialStageDocument,
  target: GitPartialStageTarget,
) {
  if (target.lineIndex !== null) return [target.id]
  const hunk = document.hunks[target.hunkIndex]
  return hunk
    ? hunk.lines
        .filter((line) => line.kind === "added" || line.kind === "removed")
        .map((line) => line.id)
    : []
}

function selectedHunkLines(
  hunk: GitPartialStageHunk,
  selected: ReadonlySet<string>,
  granularity: GitPartialStageGranularity,
) {
  if (granularity === "hunk") return selected.has(hunk.id) ? hunk.lines.map((line) => line.raw) : []
  const result: string[] = []
  let previousIncluded = false
  let hasSelectedChange = false
  for (const line of hunk.lines) {
    if (line.kind === "meta") {
      if (previousIncluded) result.push(line.raw)
      continue
    }
    const lineSelected = selected.has(line.id)
    if (lineSelected) hasSelectedChange = true
    if (line.kind === "added" && !lineSelected) {
      previousIncluded = false
      continue
    }
    result.push(line.kind === "removed" && !lineSelected ? ` ${line.content}` : line.raw)
    previousIncluded = true
  }
  return hasSelectedChange ? result : []
}

function patchLineCounts(lines: readonly string[]) {
  let oldCount = 0
  let newCount = 0
  for (const line of lines) {
    if (line.startsWith("\\")) continue
    if (!line.startsWith("+")) oldCount += 1
    if (!line.startsWith("-")) newCount += 1
  }
  return { oldCount, newCount }
}

function stagedRangeStart(oldStart: number, oldCount: number, newCount: number, delta: number) {
  if (oldCount === 0 && newCount > 0) return Math.max(0, oldStart + delta + 1)
  if (newCount === 0 && oldCount > 0) return Math.max(0, oldStart + delta - 1)
  return Math.max(0, oldStart + delta)
}

export function buildGitPartialStagePatch({
  document,
  granularity,
  selected,
}: {
  document: GitPartialStageDocument
  granularity: GitPartialStageGranularity
  selected: ReadonlySet<string>
}) {
  const result = [...document.header]
  let stagedDelta = 0
  let selectedChanges = 0
  for (const hunk of document.hunks) {
    const lines = selectedHunkLines(hunk, selected, granularity)
    if (!lines.length) continue
    const { oldCount, newCount } = patchLineCounts(lines)
    const newStart = stagedRangeStart(hunk.oldStart, oldCount, newCount, stagedDelta)
    result.push(
      `@@ -${hunk.oldStart},${oldCount} +${newStart},${newCount} @@${hunk.heading}`,
      ...lines,
    )
    stagedDelta += newCount - oldCount
    selectedChanges += lines.filter((line) => line.startsWith("+") || line.startsWith("-")).length
  }
  return selectedChanges ? `${result.join("\n")}\n` : ""
}
