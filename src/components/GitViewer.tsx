import {
  pathToFiletype,
  RGBA,
  StyledText,
  SyntaxStyle,
  type ScrollBoxRenderable,
  type SelectRenderable,
  type TextChunk,
} from "@opentui/core"
import { useKeyboard, useTerminalDimensions } from "@opentui/react"
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  loadCommitDiff,
  loadGitDiff,
  loadGitSnapshot,
  toggleAllGitFiles,
  toggleGitFile,
  type GitCommit,
  type GitFile,
  type GitSnapshot,
} from "../git"
import { COLORS } from "../theme"

const LOADING_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]
const FILES_PANEL_WIDTH = 31
const INLINE_CHANGED_BG = RGBA.fromHex(COLORS.diffChangedBg)
const INLINE_REMOVED_CHANGED_BG = RGBA.fromHex(COLORS.diffRemovedChangedBg)
const GIT_GRAPH_COLORS = [
  COLORS.git,
  COLORS.database,
  COLORS.break,
  COLORS.success,
  COLORS.focus,
  "#f78c6c",
  "#82aaff",
  "#c3e88d",
] as const
const DIFF_SYNTAX_STYLE = SyntaxStyle.fromStyles({
  default: { fg: COLORS.text },
  keyword: { fg: "#c792ea", bold: true },
  string: { fg: "#c3e88d" },
  comment: { fg: COLORS.muted, italic: true },
  number: { fg: "#f78c6c" },
  function: { fg: "#82aaff" },
  type: { fg: "#ffcb6b" },
  property: { fg: "#80cbc4" },
  operator: { fg: "#89ddff" },
  constant: { fg: "#f78c6c" },
  punctuation: { fg: "#a6accd" },
})

type ViewMode = "diff" | "graph" | "log" | "commit"
type DiffLayout = "unified" | "split" | "inline"
type DiffLineKind =
  | "added"
  | "removed"
  | "context"
  | "hunk"
  | "file"
  | "section"
  | "meta"

type ParsedDiffLine = {
  kind: DiffLineKind
  content: string
  oldLine: number | null
  newLine: number | null
}

type DiffDocument = {
  key: string
  source: string
  path: string
  filetype: string
  section: string
  unifiedLineCount: number
  splitLineCount: number
  inlineRows: InlineDiffRow[]
}

type CharacterRange = {
  start: number
  end: number
}

type InlineDiffRow = {
  key: string
  kind: "context" | "modified" | "added" | "removed"
  content: string
  lineNumber: number
  changedRanges: CharacterRange[]
}

type FileTreeNode = {
  directories: Map<string, FileTreeNode>
  files: GitFile[]
}

type FileTreeOption = {
  name: string
  description: string
  value: string
}

const FILE_OPTION_PREFIX = "file:"
const FOLDER_OPTION_PREFIX = "folder:"

function fileMarker(file: GitFile) {
  if (file.untracked) return "?"
  if (file.staged && file.unstaged) return "◐"
  if (file.staged) return "●"
  return "○"
}

function fileCode(file: GitFile) {
  if (file.untracked) return "??"
  return `${file.indexStatus}${file.worktreeStatus}`
}

function displayPath(path: string) {
  return path.replace(/[\r\n\t]/g, "�")
}

function fileOptionValue(path: string) {
  return `${FILE_OPTION_PREFIX}${path}`
}

function folderOptionValue(path: string) {
  return `${FOLDER_OPTION_PREFIX}${path}`
}

function createFileTreeOptions(
  files: GitFile[],
  collapsedFolders: Set<string>,
): FileTreeOption[] {
  const root: FileTreeNode = { directories: new Map(), files: [] }

  for (const file of files) {
    const parts = file.path.split("/")
    let node = root
    for (const directory of parts.slice(0, -1)) {
      const child = node.directories.get(directory) ?? {
        directories: new Map(),
        files: [],
      }
      node.directories.set(directory, child)
      node = child
    }
    node.files.push(file)
  }

  const options: FileTreeOption[] = []
  const appendNode = (node: FileTreeNode, parentPath: string, depth: number) => {
    const indent = "  ".repeat(depth)
    const directories = [...node.directories.entries()].sort(([left], [right]) =>
      left.localeCompare(right),
    )
    for (const [name, child] of directories) {
      const path = parentPath ? `${parentPath}/${name}` : name
      const collapsed = collapsedFolders.has(path)
      options.push({
        name: `${indent}${collapsed ? "▸" : "▾"} ${displayPath(name)}/`,
        description: "",
        value: folderOptionValue(path),
      })
      if (!collapsed) appendNode(child, path, depth + 1)
    }

    for (const file of [...node.files].sort((left, right) =>
      left.path.localeCompare(right.path),
    )) {
      const name = file.path.split("/").at(-1) ?? file.path
      options.push({
        name: `${indent}${fileMarker(file)} ${fileCode(file)} ${displayPath(name)}`,
        description: "",
        value: fileOptionValue(file.path),
      })
    }
  }

  appendNode(root, "", 0)
  return options
}

function authorInitials(author: string) {
  const names = author
    .replace(/([\p{Ll}])([\p{Lu}])/gu, "$1 $2")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)

  if (!names.length) return "?"

  const firstInitial = Array.from(names[0] ?? "?")[0] ?? "?"
  const lastName = names.length > 1 ? names.at(-1) : undefined
  const lastInitial = lastName ? (Array.from(lastName)[0] ?? "") : ""
  return `${firstInitial}${lastInitial}`.toLocaleUpperCase("pt-BR")
}

function formatGraph(graph: string) {
  return graph
    .replaceAll("*", "○")
    .replaceAll("|", "│")
    .replaceAll("\\", "╰")
    .replaceAll("/", "╯")
    .replaceAll("_", "─")
    .replaceAll("-", "─")
}

enum GraphPipeKind {
  Terminates,
  Starts,
  Continues,
}

type GraphPipe = {
  fromHash: string
  toHash: string
  fromPosition: number
  toPosition: number
  kind: GraphPipeKind
}

type GraphCell = {
  up: boolean
  down: boolean
  left: boolean
  right: boolean
  kind: "connection" | "commit" | "merge"
}

function nextGraphPipes(previousPipes: GraphPipe[], commit: GitCommit) {
  const maxPosition = Math.max(
    0,
    ...previousPipes.map((pipe) => pipe.toPosition),
  )
  const currentPipes = previousPipes.filter(
    (pipe) => pipe.kind !== GraphPipeKind.Terminates,
  )
  let commitPosition = maxPosition + 1
  for (const pipe of currentPipes) {
    if (pipe.toHash === commit.fullHash) {
      commitPosition = pipe.toPosition
      break
    }
  }

  const nextPipes: GraphPipe[] = [{
    fromHash: commit.fullHash,
    toHash: commit.parents[0] ?? "__EMPTY_TREE__",
    fromPosition: commitPosition,
    toPosition: commitPosition,
    kind: GraphPipeKind.Starts,
  }]
  const takenPositions = new Set<number>()
  const traversedPositions = new Set<number>()
  const continuingPositions = new Set(
    currentPipes
      .filter((pipe) => pipe.toHash !== commit.fullHash)
      .map((pipe) => pipe.toPosition),
  )

  const nextAvailableContinuingPosition = () => {
    let position = 0
    while (traversedPositions.has(position)) position += 1
    return position
  }
  const nextAvailableNewPosition = () => {
    let position = 0
    while (
      takenPositions.has(position) || continuingPositions.has(position)
    ) {
      position += 1
    }
    return position
  }
  const traverse = (from: number, to: number) => {
    const left = Math.min(from, to)
    const right = Math.max(from, to)
    for (let position = left; position <= right; position += 1) {
      traversedPositions.add(position)
    }
    takenPositions.add(to)
  }

  for (const pipe of currentPipes) {
    if (pipe.toHash === commit.fullHash) {
      nextPipes.push({
        fromHash: pipe.fromHash,
        toHash: pipe.toHash,
        fromPosition: pipe.toPosition,
        toPosition: commitPosition,
        kind: GraphPipeKind.Terminates,
      })
      traverse(pipe.toPosition, commitPosition)
    } else if (pipe.toPosition < commitPosition) {
      const availablePosition = nextAvailableContinuingPosition()
      nextPipes.push({
        ...pipe,
        fromPosition: pipe.toPosition,
        toPosition: availablePosition,
        kind: GraphPipeKind.Continues,
      })
      traverse(pipe.toPosition, availablePosition)
    }
  }

  for (const parent of commit.parents.slice(1)) {
    const availablePosition = nextAvailableNewPosition()
    nextPipes.push({
      fromHash: commit.fullHash,
      toHash: parent,
      fromPosition: commitPosition,
      toPosition: availablePosition,
      kind: GraphPipeKind.Starts,
    })
    takenPositions.add(availablePosition)
  }

  for (const pipe of currentPipes) {
    if (pipe.toHash === commit.fullHash || pipe.toPosition <= commitPosition) {
      continue
    }
    let availablePosition = pipe.toPosition
    for (
      let position = pipe.toPosition;
      position > commitPosition;
      position -= 1
    ) {
      if (
        takenPositions.has(position) || traversedPositions.has(position)
      ) {
        break
      }
      availablePosition = position
    }
    nextPipes.push({
      ...pipe,
      fromPosition: pipe.toPosition,
      toPosition: availablePosition,
      kind: GraphPipeKind.Continues,
    })
    traverse(pipe.toPosition, availablePosition)
  }

  return nextPipes.sort(
    (left, right) =>
      left.toPosition - right.toPosition || left.kind - right.kind,
  )
}

function graphCellCharacters(cell: GraphCell) {
  const { up, down, left, right } = cell
  if (up && down && left && right) return ["│", "─"]
  if (up && down && left) return ["│", " "]
  if (up && down && right) return ["│", "─"]
  if (up && down) return ["│", " "]
  if (up && left && right) return ["┴", "─"]
  if (up && left) return ["╯", " "]
  if (up && right) return ["╰", "─"]
  if (up) return ["╵", " "]
  if (down && left && right) return ["┬", "─"]
  if (down && left) return ["╮", " "]
  if (down && right) return ["╭", "─"]
  if (down) return ["╷", " "]
  if (left && right) return ["─", "─"]
  if (left) return ["─", " "]
  if (right) return ["╶", "─"]
  return [" ", " "]
}

function renderGraphPipes(pipes: GraphPipe[]) {
  let maxPosition = 0
  let commitPosition = 0
  let startingPipeCount = 0
  for (const pipe of pipes) {
    if (pipe.kind === GraphPipeKind.Starts) {
      startingPipeCount += 1
      commitPosition = pipe.fromPosition
    } else if (pipe.kind === GraphPipeKind.Terminates) {
      commitPosition = pipe.toPosition
    }
    maxPosition = Math.max(
      maxPosition,
      pipe.fromPosition,
      pipe.toPosition,
    )
  }

  const cells: GraphCell[] = Array.from(
    { length: maxPosition + 1 },
    () => ({
      up: false,
      down: false,
      left: false,
      right: false,
      kind: "connection",
    }),
  )
  const renderPipe = (pipe: GraphPipe) => {
    const left = Math.min(pipe.fromPosition, pipe.toPosition)
    const right = Math.max(pipe.fromPosition, pipe.toPosition)
    if (left !== right) {
      for (let position = left + 1; position < right; position += 1) {
        const cell = cells[position]
        if (cell) {
          cell.left = true
          cell.right = true
        }
      }
      const leftCell = cells[left]
      const rightCell = cells[right]
      if (leftCell) leftCell.right = true
      if (rightCell) rightCell.left = true
    }
    if (
      pipe.kind === GraphPipeKind.Starts ||
      pipe.kind === GraphPipeKind.Continues
    ) {
      const cell = cells[pipe.toPosition]
      if (cell) cell.down = true
    }
    if (
      pipe.kind === GraphPipeKind.Terminates ||
      pipe.kind === GraphPipeKind.Continues
    ) {
      const cell = cells[pipe.fromPosition]
      if (cell) cell.up = true
    }
  }

  for (const pipe of pipes) {
    if (pipe.kind === GraphPipeKind.Starts) renderPipe(pipe)
  }
  for (const pipe of pipes) {
    const terminatesOnCommit =
      pipe.kind === GraphPipeKind.Terminates &&
      pipe.fromPosition === commitPosition &&
      pipe.toPosition === commitPosition
    if (pipe.kind !== GraphPipeKind.Starts && !terminatesOnCommit) {
      renderPipe(pipe)
    }
  }

  const commitCell = cells[commitPosition]
  if (commitCell) {
    commitCell.kind = startingPipeCount > 1 ? "merge" : "commit"
  }

  return cells
    .map((cell) => {
      const [first, second] = graphCellCharacters(cell)
      const marker = cell.kind === "merge"
        ? "◎"
        : cell.kind === "commit"
          ? "○"
          : first
      return `${marker}${second}`
    })
    .join("")
    .trimEnd()
}

function buildCommitGraph(commits: GitCommit[]) {
  if (!commits.length) return []
  let pipes: GraphPipe[] = [{
    fromHash: "__START__",
    toHash: commits[0]?.fullHash ?? "",
    fromPosition: 0,
    toPosition: 0,
    kind: GraphPipeKind.Starts,
  }]
  return commits.map((commit) => {
    pipes = nextGraphPipes(pipes, commit)
    return {
      id: commit.fullHash,
      graph: renderGraphPipes(pipes),
      commitHash: commit.fullHash,
    }
  })
}

function graphLaneColor(column: number) {
  return GIT_GRAPH_COLORS[column % GIT_GRAPH_COLORS.length] ?? COLORS.git
}

function commitLaneColor(graph: string) {
  const commitPosition = graph.indexOf("○")
  const mergePosition = graph.indexOf("◎")
  const markerPosition = commitPosition === -1 ? mergePosition : commitPosition
  return graphLaneColor(Math.floor(Math.max(0, markerPosition) / 2))
}

function styledGraph(
  graph: string,
  width: number,
  background: string,
) {
  const formatted = fillLine(formatGraph(graph), width)
  const bg = RGBA.fromHex(background)
  return new StyledText(
    Array.from(formatted).map((character, index) => {
      const lane = character === "╰" || character === "╯"
        ? Math.ceil(index / 2)
        : Math.floor(index / 2)
      return {
        __isChunk: true,
        text: character,
        fg: RGBA.fromHex(graphLaneColor(lane)),
        bg,
      }
    }),
  )
}

function formatDecorations(decorations: string) {
  return decorations
    .split(",")
    .map((decoration) => decoration.trim().replace(/^HEAD -> /, ""))
    .filter(Boolean)
    .join(" · ")
}

function fitLine(line: string, width: number) {
  const clean = line.replace(/\t/g, "  ").replace(/\r/g, "")
  if (clean.length <= width) return clean
  return `${clean.slice(0, Math.max(0, width - 1))}…`
}

function fillLine(line: string, width: number) {
  return fitLine(line, width).padEnd(width, " ")
}

function parseUnifiedDiff(diff: string): ParsedDiffLine[] {
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

    if (
      rawLine.startsWith("index ") ||
      rawLine.startsWith("--- ") ||
      rawLine.startsWith("+++ ")
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

    if (rawLine.startsWith("+") && !rawLine.startsWith("+++")) {
      result.push({
        kind: "added",
        content: rawLine.slice(1),
        oldLine: null,
        newLine,
      })
      if (newLine !== null) newLine += 1
      continue
    }

    if (rawLine.startsWith("-") && !rawLine.startsWith("---")) {
      result.push({
        kind: "removed",
        content: rawLine.slice(1),
        oldLine,
        newLine: null,
      })
      if (oldLine !== null) oldLine += 1
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
    : [{ kind: "meta", content: "Sem alterações textuais para exibir.", oldLine: null, newLine: null }]
}

function fallbackChangedRanges(oldText: string, newText: string): CharacterRange[] {
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

function findChangedRanges(oldText: string, newText: string): CharacterRange[] {
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
    for (let newIndex = newCharacters.length - 1; newIndex >= 0; newIndex -= 1) {
      lcs[oldIndex][newIndex] =
        oldCharacters[oldIndex] === newCharacters[newIndex]
          ? (lcs[oldIndex + 1]?.[newIndex + 1] ?? 0) + 1
          : Math.max(
              lcs[oldIndex + 1]?.[newIndex] ?? 0,
              lcs[oldIndex]?.[newIndex + 1] ?? 0,
            )
    }
  }

  const changedIndexes: number[] = []
  let oldIndex = 0
  let newIndex = 0
  while (oldIndex < oldCharacters.length && newIndex < newCharacters.length) {
    if (oldCharacters[oldIndex] === newCharacters[newIndex]) {
      oldIndex += 1
      newIndex += 1
    } else if (
      (lcs[oldIndex + 1]?.[newIndex] ?? 0) >=
      (lcs[oldIndex]?.[newIndex + 1] ?? 0)
    ) {
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

function parseInlineRows(lines: string[]): InlineDiffRow[] {
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
    } else if (insideHunk && line.startsWith("-") && !line.startsWith("--- ")) {
      removed.push({ content: line.slice(1), lineNumber: oldLine })
      oldLine += 1
    } else if (insideHunk && line.startsWith("+") && !line.startsWith("+++ ")) {
      added.push({ content: line.slice(1), lineNumber: newLine })
      newLine += 1
    }
  }
  flushChanges()
  return rows
}

function highlightChangedChunks(
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
        bg: segmentChanged ? highlightBackground : chunk.bg,
      })
      segment = ""
    }

    for (const character of Array.from(chunk.text)) {
      while (ranges[rangeIndex] && ranges[rangeIndex].end <= absoluteIndex) {
        rangeIndex += 1
      }
      const range = ranges[rangeIndex]
      const changed = Boolean(
        range && absoluteIndex >= range.start && absoluteIndex < range.end,
      )
      if (segment && changed !== segmentChanged) flushSegment()
      segmentChanged = changed
      segment += character
      absoluteIndex += 1
    }
    flushSegment()
  }
  return result
}

const InlineDiffLine = memo(function InlineDiffLine({
  row,
  filetype,
}: {
  row: InlineDiffRow
  filetype: string
}) {
  const isRemoved = row.kind === "removed"
  const isChanged = row.kind !== "context"
  const lineBackground =
    row.kind === "removed"
      ? COLORS.diffRemovedBg
      : isChanged
        ? COLORS.diffModifiedBg
        : COLORS.panel
  const accent =
    row.kind === "removed"
      ? COLORS.danger
      : row.kind === "context"
        ? COLORS.muted
        : COLORS.success
  const marker =
    row.kind === "modified"
      ? "~"
      : row.kind === "added"
        ? "+"
        : row.kind === "removed"
          ? "−"
          : " "

  return (
    <box style={{ flexDirection: "row", width: "100%", height: 1, flexShrink: 0 }}>
      <text
        content={`${String(row.lineNumber).padStart(4)} ${marker} `}
        style={{ fg: accent, bg: lineBackground }}
      />
      <code
        content={row.content}
        filetype={filetype}
        syntaxStyle={DIFF_SYNTAX_STYLE}
        bg={lineBackground}
        wrapMode="none"
        truncate
        onChunks={
          isChanged
            ? (chunks) =>
                highlightChangedChunks(
                  chunks,
                  row.changedRanges,
                  isRemoved ? INLINE_REMOVED_CHANGED_BG : INLINE_CHANGED_BG,
                )
            : undefined
        }
        style={{ flexGrow: 1, width: "100%", height: 1 }}
      />
    </box>
  )
})

function parseDiffDocuments(input: string, selectedPath?: string): DiffDocument[] {
  const documents: DiffDocument[] = []
  let section = "ALTERAÇÕES"
  let lines: string[] = []

  const flush = () => {
    if (!lines.length) return
    const source = lines.join("\n")
    const path = selectedPath ?? lines[0]?.match(/ b\/(.+)$/)?.[1] ?? "arquivo"
    const unifiedLineCount = lines.filter(
      (line) =>
        (/^[- +]/.test(line) &&
          !line.startsWith("--- ") &&
          !line.startsWith("+++ ")),
    ).length
    let splitLineCount = 0
    let removedLines = 0
    let addedLines = 0
    let insideHunk = false
    const flushChangedLines = () => {
      splitLineCount += Math.max(removedLines, addedLines)
      removedLines = 0
      addedLines = 0
    }

    for (const line of lines) {
      if (line.startsWith("@@")) {
        flushChangedLines()
        insideHunk = true
      } else if (insideHunk && line.startsWith(" ")) {
        flushChangedLines()
        splitLineCount += 1
      } else if (insideHunk && line.startsWith("-") && !line.startsWith("--- ")) {
        removedLines += 1
      } else if (insideHunk && line.startsWith("+") && !line.startsWith("+++ ")) {
        addedLines += 1
      }
    }
    flushChangedLines()

    documents.push({
      key: `${section}:${path}`,
      source,
      path,
      filetype: pathToFiletype(path) ?? "text",
      section,
      unifiedLineCount,
      splitLineCount,
      inlineRows: parseInlineRows(lines),
    })
    lines = []
  }

  for (const line of input.split("\n")) {
    if (line.startsWith("──")) {
      flush()
      section = line.replace(/─/g, "").trim()
    } else if (line.startsWith("diff --git ")) {
      flush()
      lines = [line]
    } else if (lines.length) {
      lines.push(line)
    }
  }
  flush()

  return documents
}

function documentLineCount(document: DiffDocument, layout: DiffLayout) {
  if (layout === "split") return document.splitLineCount
  if (layout === "inline") return document.inlineRows.length
  return document.unifiedLineCount
}

function commitTitle(commit: GitCommit, selected: boolean, width: number) {
  const marker = selected ? "◆" : commit.parents.length > 1 ? "◉" : "●"
  return fillLine(`${marker} ${commit.hash}  ${commit.subject}`, width)
}

export function GitViewer({ active }: { active: boolean }) {
  const terminal = useTerminalDimensions()
  const fileListRef = useRef<SelectRenderable | null>(null)
  const diffScrollRef = useRef<ScrollBoxRenderable | null>(null)
  const loadedDiffTargetRef = useRef<string | null>(null)
  const [snapshot, setSnapshot] = useState<GitSnapshot | null>(null)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [selectedTreeValue, setSelectedTreeValue] = useState<string | null>(null)
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(
    () => new Set(),
  )
  const [selectedCommitIndex, setSelectedCommitIndex] = useState(0)
  const [diff, setDiff] = useState("")
  const [commitDiff, setCommitDiff] = useState("")
  const [view, setView] = useState<ViewMode>("diff")
  const [diffLayout, setDiffLayout] = useState<DiffLayout>("unified")
  const [diffOffset, setDiffOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [diffLoading, setDiffLoading] = useState(false)
  const [commitLoading, setCommitLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [motionFrame, setMotionFrame] = useState(0)
  const [refreshSequence, setRefreshSequence] = useState(0)

  const selectedFile = useMemo(
    () => snapshot?.files.find((file) => file.path === selectedPath) ?? null,
    [selectedPath, snapshot],
  )
  const selectedFilePath = selectedFile?.path
  const selectedFileIndexStatus = selectedFile?.indexStatus
  const selectedFileWorktreeStatus = selectedFile?.worktreeStatus
  const selectedFileStaged = selectedFile?.staged
  const selectedFileUnstaged = selectedFile?.unstaged
  const selectedFileUntracked = selectedFile?.untracked
  const diffTarget = useMemo<GitFile | null>(() => {
    if (!selectedFilePath) return null
    return {
      path: selectedFilePath,
      indexStatus: selectedFileIndexStatus ?? " ",
      worktreeStatus: selectedFileWorktreeStatus ?? " ",
      staged: selectedFileStaged ?? false,
      unstaged: selectedFileUnstaged ?? false,
      untracked: selectedFileUntracked ?? false,
    }
  }, [
    selectedFileIndexStatus,
    selectedFilePath,
    selectedFileStaged,
    selectedFileUnstaged,
    selectedFileUntracked,
    selectedFileWorktreeStatus,
  ])
  const selectedCommit = snapshot?.commits[selectedCommitIndex] ?? null
  const stagedCount = snapshot?.files.filter((file) => file.staged).length ?? 0
  const unstagedCount = snapshot?.files.filter((file) => file.unstaged).length ?? 0

  const fileOptions = useMemo(
    () => createFileTreeOptions(snapshot?.files ?? [], collapsedFolders),
    [collapsedFolders, snapshot?.files],
  )

  const selectedTreeIndex = Math.max(
    0,
    fileOptions.findIndex(
      (option) =>
        option.value === selectedTreeValue ||
        (!selectedTreeValue && option.value === fileOptionValue(selectedPath ?? "")),
    ),
  )
  const commitByHash = useMemo(
    () => new Map((snapshot?.commits ?? []).map((commit) => [commit.fullHash, commit])),
    [snapshot?.commits],
  )

  const visibleHeight = Math.max(5, terminal.height - 13)
  const previewWidth = Math.max(24, terminal.width - FILES_PANEL_WIDTH - 9)
  const compactGraphHeight = Math.max(
    5,
    Math.min(8, Math.floor(visibleHeight * 0.4)),
  )
  const compactGraphRowLimit = Math.max(1, compactGraphHeight - 4)
  const fileTreeHeight = Math.max(4, visibleHeight - compactGraphHeight + 1)

  const refresh = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true)
    setError(null)
    try {
      const nextSnapshot = await loadGitSnapshot()
      setSnapshot(nextSnapshot)
      setRefreshSequence((current) => current + 1)
      setSelectedPath((current) => {
        if (current && nextSnapshot.files.some((file) => file.path === current)) {
          return current
        }
        return nextSnapshot.files[0]?.path ?? null
      })
      setSelectedCommitIndex((current) =>
        Math.min(current, Math.max(0, nextSnapshot.commits.length - 1)),
      )
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Não foi possível carregar o repositório.",
      )
    } finally {
      if (showLoading) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!active) return
    const interval = setInterval(() => void refresh(false), 5000)
    return () => clearInterval(interval)
  }, [active, refresh])

  useEffect(() => {
    if (active && snapshot?.isRepository) fileListRef.current?.focus()
  }, [active, snapshot?.isRepository])

  useEffect(() => {
    if (!message) return
    const timeout = setTimeout(() => setMessage(null), 2200)
    return () => clearTimeout(timeout)
  }, [message])

  useEffect(() => {
    if (!loading && !diffLoading && !commitLoading && !busy) {
      setMotionFrame(0)
      return
    }

    const interval = setInterval(() => {
      setMotionFrame((current) => (current + 1) % LOADING_FRAMES.length)
    }, 80)
    return () => clearInterval(interval)
  }, [busy, commitLoading, diffLoading, loading])

  useEffect(() => {
    void refreshSequence
    const root = snapshot?.root
    if (!root || !diffTarget) {
      loadedDiffTargetRef.current = null
      setDiff("")
      return
    }

    const targetKey = `${root}:${diffTarget.path}:${diffTarget.indexStatus}:${diffTarget.worktreeStatus}`
    const targetChanged = loadedDiffTargetRef.current !== targetKey
    let cancelled = false
    if (targetChanged) {
      setDiffOffset(0)
      setDiffLoading(true)
    }
    void loadGitDiff(root, diffTarget)
      .then((nextDiff) => {
        if (!cancelled) setDiff(nextDiff)
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setDiff(loadError instanceof Error ? loadError.message : "Não foi possível carregar o diff.")
        }
      })
      .finally(() => {
        if (!cancelled) {
          loadedDiffTargetRef.current = targetKey
          if (targetChanged) setDiffLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [diffTarget, refreshSequence, snapshot?.root])

  useEffect(() => {
    const commitHash = selectedCommit?.fullHash
    if (view !== "commit" || !snapshot?.root || !commitHash) return
    let cancelled = false
    setDiffOffset(0)
    setCommitLoading(true)
    void loadCommitDiff(snapshot.root, commitHash)
      .then((nextDiff) => {
        if (!cancelled) setCommitDiff(nextDiff)
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setCommitDiff(
            loadError instanceof Error ? loadError.message : "Não foi possível carregar o commit.",
          )
        }
      })
      .finally(() => {
        if (!cancelled) setCommitLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedCommit?.fullHash, snapshot?.root, view])

  const runStageAction = useCallback(
    async (allFiles: boolean) => {
      const targetFile = selectedFile
      if (!snapshot?.root || busy) return
      if (!allFiles && selectedTreeValue?.startsWith(FOLDER_OPTION_PREFIX)) {
        setMessage("Selecione um arquivo para alterar o stage.")
        return
      }
      if (!allFiles && !targetFile) return
      setBusy(true)
      setError(null)
      setMessage(null)
      try {
        let nextMessage: string
        if (allFiles) {
          nextMessage = await toggleAllGitFiles(snapshot.root, snapshot.files)
        } else {
          if (!targetFile) return
          nextMessage = await toggleGitFile(snapshot.root, targetFile)
        }
        setMessage(nextMessage)
        await refresh(false)
      } catch (stageError) {
        setError(
          stageError instanceof Error
            ? stageError.message
            : "Não foi possível alterar o stage.",
        )
      } finally {
        setBusy(false)
      }
    },
    [busy, refresh, selectedFile, selectedTreeValue, snapshot],
  )

  const activeDiff = view === "commit" ? commitDiff : diff
  const parsedDiff = useMemo(() => parseUnifiedDiff(activeDiff), [activeDiff])
  const diffDocuments = useMemo(
    () => parseDiffDocuments(activeDiff, view === "diff" ? selectedFile?.path : undefined),
    [activeDiff, selectedFile?.path, view],
  )
  const additions = parsedDiff.filter((line) => line.kind === "added").length
  const deletions = parsedDiff.filter((line) => line.kind === "removed").length
  const diffRowCount = diffDocuments.reduce(
    (total, document) =>
      total + Math.max(2, documentLineCount(document, diffLayout) + 1),
    0,
  )
  const maxDiffOffset = Math.max(0, diffRowCount - visibleHeight)
  const maxCommitRows = Math.max(1, Math.floor(visibleHeight / 2))
  const commitWindowStart = Math.max(
    0,
    Math.min(
      selectedCommitIndex - Math.floor(maxCommitRows / 2),
      (snapshot?.commits.length ?? 0) - maxCommitRows,
    ),
  )
  const visibleCommits = snapshot?.commits.slice(
    commitWindowStart,
    commitWindowStart + maxCommitRows,
  ) ?? []
  const graphRows = useMemo(
    () => buildCommitGraph(snapshot?.commits ?? []),
    [snapshot?.commits],
  )
  const selectedGraphRowIndex = Math.max(
    0,
    graphRows.findIndex(
      (row) => row.commitHash === selectedCommit?.fullHash,
    ),
  )
  const maxGraphRows = Math.max(4, visibleHeight + 1)
  const graphWindowStart = Math.max(
    0,
    Math.min(
      selectedGraphRowIndex - Math.floor(maxGraphRows / 2),
      graphRows.length - maxGraphRows,
    ),
  )
  const visibleGraphRows = graphRows.slice(
    graphWindowStart,
    graphWindowStart + maxGraphRows,
  )
  const compactGraphRows = graphRows.slice(0, compactGraphRowLimit)
  const compactGraphColumnWidth = Math.min(
    8,
    Math.max(
      3,
      ...compactGraphRows.map((row) =>
        formatGraph(row.graph).length,
      ),
    ),
  )
  const fullGraphColumnWidth = Math.min(
    14,
    Math.max(
      3,
      ...visibleGraphRows.map((row) =>
        formatGraph(row.graph).length,
      ),
    ),
  )

  useEffect(() => {
    diffScrollRef.current?.scrollTo({ x: 0, y: diffOffset })
  }, [diffOffset])

  useKeyboard((key) => {
    if (!active) return

    switch (key.name) {
      case "r":
        void refresh()
        break
      case "space":
        if (view === "diff") {
          key.preventDefault()
          void runStageAction(false)
        }
        break
      case "a":
        if (view === "diff") void runStageAction(true)
        break
      case "d":
        setView("diff")
        setDiffOffset(0)
        break
      case "l":
        setView("log")
        setDiffOffset(0)
        break
      case "g":
        setView((current) => (current === "graph" ? "diff" : "graph"))
        setDiffOffset(0)
        break
      case "v":
        if (view !== "log" && view !== "graph") {
          setDiffLayout((current) =>
            current === "unified"
              ? "split"
              : current === "split"
                ? "inline"
                : "unified",
          )
          setDiffOffset(0)
        }
        break
      case "n":
        if (view === "log" || view === "graph") {
          setSelectedCommitIndex((current) =>
            Math.min((snapshot?.commits.length ?? 1) - 1, current + 1),
          )
        }
        break
      case "p":
        if (view === "log" || view === "graph") {
          setSelectedCommitIndex((current) => Math.max(0, current - 1))
        }
        break
      case "return":
      case "enter":
      case "linefeed":
        if ((view === "log" || view === "graph") && selectedCommit) {
          setView("commit")
        }
        break
      case "[":
      case "left":
        if (view !== "log" && view !== "graph") {
          setDiffOffset((current) => Math.max(0, current - 5))
        }
        break
      case "]":
      case "right":
        if (view !== "log" && view !== "graph") {
          setDiffOffset((current) => Math.min(maxDiffOffset, current + 5))
        }
        break
    }
  })

  const headerTitle =
    view === "graph"
      ? "ÁRVORE DE COMMITS  ·  TODOS OS BRANCHES"
      : view === "log"
      ? "HISTÓRICO DO BRANCH"
      : view === "commit" && selectedCommit
        ? `● ${selectedCommit.hash}  ${selectedCommit.subject}`
        : selectedFile
          ? `∆ ${displayPath(selectedFile.path)}`
          : "DIFF"
  const headerMeta =
    view === "graph" || view === "log"
      ? `${Math.min(selectedCommitIndex + 1, snapshot?.commits.length ?? 0)}/${snapshot?.commits.length ?? 0}  [N/P]`
      : `+${additions}  −${deletions}  ${Math.min(diffOffset + 1, Math.max(1, diffRowCount))}/${Math.max(1, diffRowCount)}`
  const helpText =
    view === "graph"
      ? "[N/P] COMMIT  [↵] ABRIR  [G/D] VOLTAR  [L] LISTA"
      : view === "log"
      ? "[N/P] COMMIT  [↵] ABRIR  [D] DIFF"
      : view === "commit"
        ? "[V] VIEW  [G] ÁRVORE  [L] LOG  [D] DIFF  [←/→] ROLAR"
        : "[V] VIEW  [G] ÁRVORE  [␠] STG  [A] TODOS  [L] LOG"

  return (
    <box
      style={{
        flexGrow: 1,
        backgroundColor: COLORS.canvas,
        padding: 1,
        gap: 1,
      }}
    >
      <box
        style={{
          border: true,
          borderStyle: "rounded",
          borderColor: COLORS.border,
          backgroundColor: COLORS.panel,
          paddingLeft: 1,
          paddingRight: 1,
          flexDirection: "row",
          justifyContent: "space-between",
        }}
      >
        <text
          content={
            snapshot?.isRepository
              ? `◆ ${snapshot.repositoryName}  /  ${snapshot.branch}`
              : "◆ GIT WORKSPACE"
          }
          style={{ fg: COLORS.git }}
        />
        <text
          content={
            loading
              ? `${LOADING_FRAMES[motionFrame]} ATUALIZANDO`
              : snapshot?.isRepository
                ? `${snapshot.files.length} ALT  ●${stagedCount} ○${unstagedCount}  ↑${snapshot.ahead} ↓${snapshot.behind}`
                : "◇ FORA DE UM REPOSITÓRIO"
          }
          style={{ fg: loading ? COLORS.git : COLORS.muted }}
        />
      </box>

      {!loading && snapshot && !snapshot.isRepository ? (
        <box
          style={{
            flexGrow: 1,
            border: true,
            borderStyle: "rounded",
            borderColor: COLORS.border,
            backgroundColor: COLORS.panel,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <text content="Nenhum repositório Git encontrado" style={{ fg: COLORS.text }} />
          <text content="Inicie o Tuiminal dentro de um projeto versionado." style={{ fg: COLORS.muted }} />
          <text content={snapshot.launchDirectory} style={{ fg: COLORS.git }} />
        </box>
      ) : (
        <box style={{ flexGrow: 1, flexDirection: "row", gap: 1 }}>
          <box
            style={{
              width: FILES_PANEL_WIDTH,
              border: true,
              borderStyle: "rounded",
              borderColor: active ? COLORS.git : COLORS.border,
              backgroundColor: COLORS.panel,
              paddingLeft: 1,
              paddingRight: 1,
            }}
          >
            <text
              content={`ARQUIVOS ${snapshot?.files.length ?? 0}  ●${stagedCount}  ○${unstagedCount}`}
              style={{ fg: COLORS.git }}
            />
            {fileOptions.length ? (
              <select
                ref={fileListRef}
                id="git-file-list"
                options={fileOptions}
                selectedIndex={selectedTreeIndex}
                onChange={(_index, option) => {
                  if (typeof option?.value === "string") {
                    setSelectedTreeValue(option.value)
                    if (option.value.startsWith(FILE_OPTION_PREFIX)) {
                      setSelectedPath(option.value.slice(FILE_OPTION_PREFIX.length))
                      setView("diff")
                    }
                  }
                }}
                onSelect={(_index, option) => {
                  if (
                    view !== "diff" ||
                    typeof option?.value !== "string" ||
                    !option.value.startsWith(FOLDER_OPTION_PREFIX)
                  ) {
                    return
                  }
                  const folder = option.value.slice(FOLDER_OPTION_PREFIX.length)
                  setCollapsedFolders((current) => {
                    const next = new Set(current)
                    if (next.has(folder)) next.delete(folder)
                    else next.add(folder)
                    return next
                  })
                }}
                showDescription={false}
                showScrollIndicator
                wrapSelection
                style={{
                  width: FILES_PANEL_WIDTH - 4,
                  height: fileTreeHeight,
                  backgroundColor: COLORS.panel,
                  focusedBackgroundColor: COLORS.panel,
                  textColor: COLORS.muted,
                  focusedTextColor: COLORS.text,
                  selectedBackgroundColor: COLORS.panelRaised,
                  selectedTextColor: COLORS.git,
                }}
              />
            ) : (
              <box style={{ height: fileTreeHeight, justifyContent: "center" }}>
                <text content="✓ Working tree limpo" style={{ fg: COLORS.success }} />
              </box>
            )}

            <box
              style={{
                height: compactGraphHeight,
                flexShrink: 0,
                border: true,
                borderStyle: "rounded",
                borderColor: view === "graph" ? COLORS.database : COLORS.border,
                backgroundColor: COLORS.canvas,
                paddingLeft: 1,
                paddingRight: 1,
              }}
            >
              <box style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <text content="ÁRVORE GIT" style={{ fg: COLORS.database }} />
                <text content="[G] ABRIR" style={{ fg: COLORS.muted }} />
              </box>
              {compactGraphRows.length ? (
                compactGraphRows.map((row) => {
                  const commit = row.commitHash
                    ? commitByHash.get(row.commitHash)
                    : undefined
                  const selected = row.commitHash === selectedCommit?.fullHash
                  const rowBackground = selected
                    ? COLORS.panelRaised
                    : COLORS.canvas
                  const graph = styledGraph(
                    row.graph,
                    compactGraphColumnWidth,
                    rowBackground,
                  )
                  const initials = commit ? authorInitials(commit.author) : ""
                  const label = commit
                    ? `${commit.hash} ${commit.subject}`
                    : ""
                  const commitColor = commitLaneColor(row.graph)
                  return (
                    <box
                      key={row.id}
                      style={{ flexDirection: "row", height: 1, flexShrink: 0 }}
                    >
                      <text
                        content={graph}
                        style={{
                          width: compactGraphColumnWidth,
                          flexShrink: 0,
                          bg: rowBackground,
                        }}
                      />
                      <text
                        content={commit ? ` ${initials.padEnd(2, " ")} ` : "    "}
                        style={{
                          fg: commitColor,
                          bg: commit && !selected
                            ? COLORS.diffHunkBg
                            : rowBackground,
                        }}
                      />
                      <text
                        content={fillLine(
                          label,
                          FILES_PANEL_WIDTH - compactGraphColumnWidth - 10,
                        )}
                        style={{
                          fg: selected ? COLORS.text : COLORS.muted,
                          bg: selected ? COLORS.panelRaised : COLORS.canvas,
                        }}
                      />
                    </box>
                  )
                })
              ) : (
                <text content="Sem commits" style={{ fg: COLORS.muted }} />
              )}
            </box>
          </box>

          <box
            style={{
              flexGrow: 1,
              border: true,
              borderStyle: "rounded",
              borderColor: COLORS.border,
              backgroundColor: COLORS.panel,
              paddingLeft: 1,
              paddingRight: 1,
            }}
          >
            <box
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                backgroundColor: COLORS.panelRaised,
                paddingLeft: 1,
                paddingRight: 1,
              }}
            >
              <text
                content={fitLine(headerTitle, Math.max(12, previewWidth - headerMeta.length - 1))}
                style={{ fg: COLORS.git }}
              />
              <text content={headerMeta} style={{ fg: COLORS.muted }} />
            </box>

            {view !== "log" && view !== "graph" ? (
              <box
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  backgroundColor: COLORS.diffGutterBg,
                  paddingLeft: 1,
                  paddingRight: 1,
                }}
              >
                <text
                  content="[V]"
                  style={{ fg: COLORS.border }}
                />
                <text
                  content={`${diffLayout === "unified" ? "◆" : "◇"} UNIFIC.`}
                  style={{
                    fg: diffLayout === "unified" ? COLORS.database : COLORS.muted,
                  }}
                />
                <text
                  content={`${diffLayout === "split" ? "◆" : "◇"} 2 COL.`}
                  style={{
                    fg: diffLayout === "split" ? COLORS.database : COLORS.muted,
                  }}
                />
                <text
                  content={`${diffLayout === "inline" ? "◆" : "◇"} INLINE`}
                  style={{
                    fg: diffLayout === "inline" ? COLORS.database : COLORS.muted,
                  }}
                />
              </box>
            ) : null}

            <box style={{ flexGrow: 1 }}>
              {view === "graph" ? (
                visibleGraphRows.length ? (
                  visibleGraphRows.map((row) => {
                    const commit = row.commitHash
                      ? commitByHash.get(row.commitHash)
                      : undefined
                    const selected = row.commitHash === selectedCommit?.fullHash
                    const rowBackground = selected
                      ? COLORS.panelRaised
                      : COLORS.panel
                    const graph = styledGraph(
                      row.graph,
                      fullGraphColumnWidth,
                      rowBackground,
                    )
                    const initials = commit ? authorInitials(commit.author) : ""
                    const refs = commit ? formatDecorations(commit.decorations) : ""
                    const label = commit
                      ? `${commit.hash}${refs ? `  ‹${refs}›` : ""}  ${commit.subject}`
                      : ""
                    const metaWidth = Math.min(
                      24,
                      Math.max(0, Math.floor(previewWidth * 0.25)),
                    )
                    const meta = commit
                      ? fitLine(`${commit.date} · ${commit.author}`, metaWidth)
                      : ""
                    const labelWidth = Math.max(
                      4,
                      previewWidth - fullGraphColumnWidth - metaWidth - 6,
                    )
                    const commitColor = commitLaneColor(row.graph)
                    return (
                      <box
                        key={row.id}
                        style={{ flexDirection: "row", height: 1, flexShrink: 0 }}
                      >
                        <text
                          content={graph}
                          style={{
                            width: fullGraphColumnWidth,
                            flexShrink: 0,
                            bg: rowBackground,
                          }}
                        />
                        <text
                          content={commit ? ` ${initials.padEnd(2, " ")} ` : "    "}
                          style={{
                            fg: commitColor,
                            bg: commit && !selected
                              ? COLORS.diffHunkBg
                              : rowBackground,
                          }}
                        />
                        <text
                          content={` ${fillLine(label, labelWidth)} `}
                          style={{
                            fg: COLORS.text,
                            bg: rowBackground,
                          }}
                        />
                        <text
                          content={fillLine(meta, metaWidth)}
                          style={{ fg: COLORS.muted, bg: rowBackground }}
                        />
                      </box>
                    )
                  })
                ) : (
                  <text content="Este repositório ainda não possui commits." style={{ fg: COLORS.muted }} />
                )
              ) : view === "log" ? (
                visibleCommits.length ? (
                  visibleCommits.map((commit, windowIndex) => {
                    const index = commitWindowStart + windowIndex
                    const selected = index === selectedCommitIndex
                    const details = `│  ${commit.date} · ${commit.author}  +${commit.additions} −${commit.deletions}`
                    return (
                      <box key={commit.fullHash}>
                        <text
                          content={commitTitle(commit, selected, previewWidth)}
                          style={{
                            fg: selected ? COLORS.git : COLORS.text,
                            bg: selected ? COLORS.panelRaised : COLORS.panel,
                          }}
                        />
                        <text
                          content={fillLine(details, previewWidth)}
                          style={{
                            fg: selected ? COLORS.muted : COLORS.border,
                            bg: selected ? COLORS.panelRaised : COLORS.panel,
                          }}
                        />
                      </box>
                    )
                  })
                ) : (
                  <text content="Este branch ainda não possui commits." style={{ fg: COLORS.muted }} />
                )
              ) : diffLoading || commitLoading ? (
                <text
                  content={`${LOADING_FRAMES[motionFrame]} MONTANDO PREVIEW`}
                  style={{ fg: COLORS.git }}
                />
              ) : (selectedFile || view === "commit") && diffDocuments.length ? (
                <scrollbox
                  ref={diffScrollRef}
                  scrollY
                  scrollX
                  viewportCulling
                  style={{ flexGrow: 1, width: "100%", height: "100%" }}
                  verticalScrollbarOptions={{
                    trackOptions: {
                      backgroundColor: COLORS.panel,
                      foregroundColor: COLORS.border,
                    },
                  }}
                  horizontalScrollbarOptions={{
                    trackOptions: {
                      backgroundColor: COLORS.panel,
                      foregroundColor: COLORS.border,
                    },
                  }}
                >
                  {diffDocuments.map((document) => (
                    <box
                      key={document.key}
                      style={{
                        width: "100%",
                        height: Math.max(
                          2,
                          documentLineCount(document, diffLayout) + 1,
                        ),
                        flexShrink: 0,
                      }}
                    >
                      <text
                        content={`◆ ${document.path}  ·  ${document.section}  ·  ${document.filetype.toUpperCase()}`}
                        style={{ fg: COLORS.git, bg: COLORS.panelRaised }}
                      />
                      {document.unifiedLineCount && diffLayout === "inline" ? (
                        document.inlineRows.map((row) => (
                          <InlineDiffLine
                            key={row.key}
                            row={row}
                            filetype={document.filetype}
                          />
                        ))
                      ) : document.unifiedLineCount ? (
                        <diff
                          diff={document.source}
                          filetype={document.filetype}
                          syntaxStyle={DIFF_SYNTAX_STYLE}
                          view={diffLayout === "split" ? "split" : "unified"}
                          syncScroll={diffLayout === "split"}
                          wrapMode="none"
                          showLineNumbers
                          lineNumberFg={COLORS.muted}
                          lineNumberBg={COLORS.diffGutterBg}
                          addedBg={COLORS.diffAddedBg}
                          removedBg={COLORS.diffRemovedBg}
                          contextBg={COLORS.panel}
                          addedSignColor={COLORS.success}
                          removedSignColor={COLORS.danger}
                          addedLineNumberBg={COLORS.diffAddedBg}
                          removedLineNumberBg={COLORS.diffRemovedBg}
                          style={{
                            width: "100%",
                            height: documentLineCount(document, diffLayout),
                            flexShrink: 0,
                          }}
                        />
                      ) : (
                        <text
                          content="Alteração binária ou sem linhas textuais."
                          style={{ fg: COLORS.muted }}
                        />
                      )}
                    </box>
                  ))}
                </scrollbox>
              ) : (
                <text content="Selecione uma alteração para ver o diff." style={{ fg: COLORS.muted }} />
              )}
            </box>

            <text
              content={fitLine(
                busy
                  ? `${LOADING_FRAMES[motionFrame]} APLICANDO ALTERAÇÃO`
                  : error ?? message ?? helpText,
                previewWidth,
              )}
              style={{
                fg: error
                  ? COLORS.danger
                  : busy
                    ? COLORS.git
                    : message
                      ? COLORS.success
                      : COLORS.muted,
              }}
            />
          </box>
        </box>
      )}
    </box>
  )
}
