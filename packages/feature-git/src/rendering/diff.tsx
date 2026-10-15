import { pathToFiletype, type RGBA, type TextChunk } from "@opentui/core"
import { padDisplayEnd, translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import {
  type CharacterRange,
  type DiffDocument,
  type DiffLayout,
  type InlineDiffRow,
  type ParsedDiffLine,
  resolveDiffDocumentPath,
} from "../model/view"

export function fitLine(line: string, width: number) {
  const clean = translateUi(line).replace(/\t/g, "  ").replace(/\r/g, "")
  return truncateDisplay(clean, width)
}

export function fillLine(line: string, width: number) {
  return padDisplayEnd(fitLine(line, width), width)
}

export function parseUnifiedDiff(diff: string): ParsedDiffLine[] {
  const result: ParsedDiffLine[] = []
  let oldLine: number | null = null
  let newLine: number | null = null

  for (const rawLine of diff.split("\n")) {
    if (rawLine.startsWith("──")) {
      result.push({ kind: "section", content: rawLine, oldLine: null, newLine: null })
      continue
    }

    if (rawLine.startsWith("diff --git ")) {
      const match = rawLine.match(/ b\/(.+)$/)
      result.push({
        kind: "file",
        content: match?.[1] ?? rawLine.replace("diff --git ", ""),
        oldLine: null,
        newLine: null,
      })
      oldLine = null
      newLine = null
      continue
    }

    const insideHunk = oldLine !== null && newLine !== null
    if (
      !insideHunk &&
      (rawLine.startsWith("index ") || rawLine.startsWith("--- ") || rawLine.startsWith("+++ "))
    ) {
      continue
    }

    if (rawLine.startsWith("@@")) {
      const match = rawLine.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/)
      oldLine = match ? Number(match[1]) : null
      newLine = match ? Number(match[2]) : null
      result.push({
        kind: "hunk",
        content: match ? (match[3]?.trim() ?? "") : rawLine,
        oldLine,
        newLine,
      })
      continue
    }

    if (newLine !== null && rawLine.startsWith("+")) {
      result.push({
        kind: "added",
        content: rawLine.slice(1),
        oldLine: null,
        newLine,
      })
      newLine += 1
      continue
    }

    if (oldLine !== null && rawLine.startsWith("-")) {
      result.push({
        kind: "removed",
        content: rawLine.slice(1),
        oldLine,
        newLine: null,
      })
      oldLine += 1
      continue
    }

    if (rawLine.startsWith(" ") && oldLine !== null && newLine !== null) {
      result.push({
        kind: "context",
        content: rawLine.slice(1),
        oldLine,
        newLine,
      })
      oldLine += 1
      newLine += 1
      continue
    }

    if (!rawLine && result.at(-1)?.kind === "file") continue
    result.push({ kind: "meta", content: rawLine, oldLine: null, newLine: null })
  }

  return result.length
    ? result
    : [
        {
          kind: "meta",
          content: "Sem alterações textuais para exibir.",
          oldLine: null,
          newLine: null,
        },
      ]
}

export function fallbackChangedRanges(oldText: string, newText: string): CharacterRange[] {
  const oldCharacters = Array.from(oldText)
  const newCharacters = Array.from(newText)
  let prefix = 0
  while (
    prefix < oldCharacters.length &&
    prefix < newCharacters.length &&
    oldCharacters[prefix] === newCharacters[prefix]
  ) {
    prefix += 1
  }

  let suffix = 0
  while (
    suffix < oldCharacters.length - prefix &&
    suffix < newCharacters.length - prefix &&
    oldCharacters[oldCharacters.length - suffix - 1] ===
      newCharacters[newCharacters.length - suffix - 1]
  ) {
    suffix += 1
  }

  const end = newCharacters.length - suffix
  if (prefix < end) return [{ start: prefix, end }]
  if (newCharacters.length) {
    const adjacentCharacter = Math.max(0, Math.min(prefix, newCharacters.length - 1))
    return [{ start: adjacentCharacter, end: adjacentCharacter + 1 }]
  }
  return []
}

export function findChangedRanges(oldText: string, newText: string): CharacterRange[] {
  if (oldText === newText) return []
  const oldCharacters = Array.from(oldText)
  const newCharacters = Array.from(newText)
  if (oldCharacters.length * newCharacters.length > 60_000) {
    return fallbackChangedRanges(oldText, newText)
  }

  const lcs = Array.from(
    { length: oldCharacters.length + 1 },
    () => new Uint16Array(newCharacters.length + 1),
  )
  for (let oldIndex = oldCharacters.length - 1; oldIndex >= 0; oldIndex -= 1) {
    const row = lcs[oldIndex]
    if (!row) continue
    for (let newIndex = newCharacters.length - 1; newIndex >= 0; newIndex -= 1) {
      row[newIndex] =
        oldCharacters[oldIndex] === newCharacters[newIndex]
          ? (lcs[oldIndex + 1]?.[newIndex + 1] ?? 0) + 1
          : Math.max(lcs[oldIndex + 1]?.[newIndex] ?? 0, lcs[oldIndex]?.[newIndex + 1] ?? 0)
    }
  }

  const changedIndexes: number[] = []
  let oldIndex = 0
  let newIndex = 0
  while (oldIndex < oldCharacters.length && newIndex < newCharacters.length) {
    if (oldCharacters[oldIndex] === newCharacters[newIndex]) {
      oldIndex += 1
      newIndex += 1
    } else if ((lcs[oldIndex + 1]?.[newIndex] ?? 0) >= (lcs[oldIndex]?.[newIndex + 1] ?? 0)) {
      oldIndex += 1
    } else {
      changedIndexes.push(newIndex)
      newIndex += 1
    }
  }
  while (newIndex < newCharacters.length) {
    changedIndexes.push(newIndex)
    newIndex += 1
  }

  if (!changedIndexes.length) return fallbackChangedRanges(oldText, newText)
  const ranges: CharacterRange[] = []
  for (const index of changedIndexes) {
    const previous = ranges.at(-1)
    if (previous?.end === index) previous.end += 1
    else ranges.push({ start: index, end: index + 1 })
  }
  return ranges
}

export function parseInlineRows(lines: string[]): InlineDiffRow[] {
  const rows: InlineDiffRow[] = []
  let oldLine = 0
  let newLine = 0
  let insideHunk = false
  let removed: Array<{ content: string; lineNumber: number }> = []
  let added: Array<{ content: string; lineNumber: number }> = []

  const flushChanges = () => {
    const pairedLines = Math.min(removed.length, added.length)
    for (let index = 0; index < pairedLines; index += 1) {
      const previousLine = removed[index]
      const nextLine = added[index]
      if (!previousLine || !nextLine) continue
      rows.push({
        key: `modified:${nextLine.lineNumber}:${nextLine.content}`,
        kind: "modified",
        content: nextLine.content,
        lineNumber: nextLine.lineNumber,
        changedRanges: findChangedRanges(previousLine.content, nextLine.content),
      })
    }
    for (const line of removed.slice(pairedLines)) {
      rows.push({
        key: `removed:${line.lineNumber}:${line.content}`,
        kind: "removed",
        content: line.content,
        lineNumber: line.lineNumber,
        changedRanges: [{ start: 0, end: Array.from(line.content).length }],
      })
    }
    for (const line of added.slice(pairedLines)) {
      rows.push({
        key: `added:${line.lineNumber}:${line.content}`,
        kind: "added",
        content: line.content,
        lineNumber: line.lineNumber,
        changedRanges: [{ start: 0, end: Array.from(line.content).length }],
      })
    }
    removed = []
    added = []
  }

  for (const line of lines) {
    if (line.startsWith("@@")) {
      flushChanges()
      const match = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)/)
      oldLine = match ? Number(match[1]) : 0
      newLine = match ? Number(match[2]) : 0
      insideHunk = true
    } else if (insideHunk && line.startsWith(" ")) {
      flushChanges()
      rows.push({
        key: `context:${newLine}:${line.slice(1)}`,
        kind: "context",
        content: line.slice(1),
        lineNumber: newLine,
        changedRanges: [],
      })
      oldLine += 1
      newLine += 1
    } else if (insideHunk && line.startsWith("-")) {
      removed.push({ content: line.slice(1), lineNumber: oldLine })
      oldLine += 1
    } else if (insideHunk && line.startsWith("+")) {
      added.push({ content: line.slice(1), lineNumber: newLine })
      newLine += 1
    }
  }
  flushChanges()
  return rows
}

export function highlightChangedChunks(
  chunks: TextChunk[],
  ranges: CharacterRange[],
  highlightBackground: RGBA,
) {
  if (!ranges.length) return chunks
  const result: TextChunk[] = []
  let absoluteIndex = 0
  let rangeIndex = 0

  for (const chunk of chunks) {
    let segment = ""
    let segmentChanged = false
    const flushSegment = () => {
      if (!segment) return
      result.push({
        ...chunk,
        text: segment,
        ...(segmentChanged ? { bg: highlightBackground } : {}),
      })
      segment = ""
    }

    for (const character of Array.from(chunk.text)) {
      while ((ranges[rangeIndex]?.end ?? Infinity) <= absoluteIndex) {
        rangeIndex += 1
      }
      const range = ranges[rangeIndex]
      const changed = Boolean(range && absoluteIndex >= range.start && absoluteIndex < range.end)
      if (segment && changed !== segmentChanged) flushSegment()
      segmentChanged = changed
      segment += character
      absoluteIndex += 1
    }
    flushSegment()
  }
  return result
}

function isDiffContentPrefix(code: number) {
  return code === 0x2d || code === 0x20 || code === 0x2b
}

function diffDocumentLineCounts(source: string) {
  let unifiedLineCount = 0
  let splitLineCount = 0
  let removedLines = 0
  let addedLines = 0
  let insideHunk = false
  const flushChangedLines = () => {
    splitLineCount += Math.max(removedLines, addedLines)
    removedLines = 0
    addedLines = 0
  }

  let lineStart = 0
  while (lineStart <= source.length) {
    const newline = source.indexOf("\n", lineStart)
    const lineEnd = newline === -1 ? source.length : newline
    const first = source.charCodeAt(lineStart)
    if (insideHunk && isDiffContentPrefix(first)) {
      unifiedLineCount += 1
    }
    if (first === 0x40 && source.charCodeAt(lineStart + 1) === 0x40) {
      flushChangedLines()
      insideHunk = true
    } else if (insideHunk && first === 0x20) {
      flushChangedLines()
      splitLineCount += 1
    } else if (insideHunk && first === 0x2d) {
      removedLines += 1
    } else if (insideHunk && first === 0x2b) {
      addedLines += 1
    }
    if (newline === -1) break
    lineStart = lineEnd + 1
  }
  flushChangedLines()
  return { unifiedLineCount, splitLineCount }
}

function createDiffDocument(source: string, section: string, selectedPath?: string): DiffDocument {
  const firstLineEnd = source.indexOf("\n")
  const path = resolveDiffDocumentPath(
    source.slice(0, firstLineEnd === -1 ? source.length : firstLineEnd),
    selectedPath,
  )
  const { unifiedLineCount, splitLineCount } = diffDocumentLineCounts(source)

  let pendingInlineSource: string | undefined = source
  let inlineRows: InlineDiffRow[] | undefined
  return {
    key: `${section}:${path}`,
    source,
    path,
    filetype: pathToFiletype(path) ?? "text",
    section,
    unifiedLineCount,
    splitLineCount,
    get inlineRows() {
      if (!inlineRows) {
        inlineRows = parseInlineRows(pendingInlineSource?.split("\n") ?? [])
        pendingInlineSource = undefined
      }
      return inlineRows
    },
  }
}

export function parseDiffDocuments(input: string, selectedPath?: string): DiffDocument[] {
  const documents: DiffDocument[] = []
  let section = "ALTERAÇÕES"
  let documentStart = -1

  const flush = (end: number, beforeNextLine: boolean) => {
    if (documentStart === -1) return
    const sourceEnd = beforeNextLine && input.charCodeAt(end - 1) === 0x0a ? end - 1 : end
    documents.push(createDiffDocument(input.slice(documentStart, sourceEnd), section, selectedPath))
    documentStart = -1
  }

  let lineStart = 0
  while (lineStart <= input.length) {
    const newline = input.indexOf("\n", lineStart)
    const lineEnd = newline === -1 ? input.length : newline
    if (input.startsWith("──", lineStart)) {
      flush(lineStart, true)
      section = input.slice(lineStart, lineEnd).replace(/─/g, "").trim()
    } else if (input.startsWith("diff --git ", lineStart)) {
      flush(lineStart, true)
      documentStart = lineStart
    }
    if (newline === -1) break
    lineStart = lineEnd + 1
  }
  flush(input.length, false)

  return documents
}

export function documentLineCount(document: DiffDocument, layout: DiffLayout) {
  if (layout === "split") return document.splitLineCount
  if (layout === "inline") return document.inlineRows.length
  return document.unifiedLineCount
}
