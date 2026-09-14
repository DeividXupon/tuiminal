import { RGBA, StyledText } from "@opentui/core"
import type { GitCommit } from "../services/git"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { fillLine } from "./diff"

export function authorInitials(author: string) {
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

export function formatGraph(graph: string) {
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

export type GraphPipe = {
  fromHash: string
  toHash: string
  fromPosition: number
  toPosition: number
  kind: GraphPipeKind
}

export type GraphCell = {
  up: boolean
  down: boolean
  left: boolean
  right: boolean
  kind: "connection" | "commit" | "merge"
}

export function nextGraphPipes(previousPipes: GraphPipe[], commit: GitCommit) {
  const maxPosition = Math.max(0, ...previousPipes.map((pipe) => pipe.toPosition))
  const currentPipes = previousPipes.filter((pipe) => pipe.kind !== GraphPipeKind.Terminates)
  let commitPosition = maxPosition + 1
  for (const pipe of currentPipes) {
    if (pipe.toHash === commit.fullHash) {
      commitPosition = pipe.toPosition
      break
    }
  }

  const nextPipes: GraphPipe[] = [
    {
      fromHash: commit.fullHash,
      toHash: commit.parents[0] ?? "__EMPTY_TREE__",
      fromPosition: commitPosition,
      toPosition: commitPosition,
      kind: GraphPipeKind.Starts,
    },
  ]
  const takenPositions = new Set<number>()
  const traversedPositions = new Set<number>()
  const continuingPositions = new Set(
    currentPipes.filter((pipe) => pipe.toHash !== commit.fullHash).map((pipe) => pipe.toPosition),
  )

  const nextAvailableContinuingPosition = () => {
    let position = 0
    while (traversedPositions.has(position)) position += 1
    return position
  }
  const nextAvailableNewPosition = () => {
    let position = 0
    while (takenPositions.has(position) || continuingPositions.has(position)) {
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
    for (let position = pipe.toPosition; position > commitPosition; position -= 1) {
      if (takenPositions.has(position) || traversedPositions.has(position)) {
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
    (left, right) => left.toPosition - right.toPosition || left.kind - right.kind,
  )
}

export function graphCellCharacters(cell: GraphCell) {
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

export function renderGraphPipes(pipes: GraphPipe[]) {
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
    maxPosition = Math.max(maxPosition, pipe.fromPosition, pipe.toPosition)
  }

  const cells: GraphCell[] = Array.from({ length: maxPosition + 1 }, () => ({
    up: false,
    down: false,
    left: false,
    right: false,
    kind: "connection",
  }))
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
    if (pipe.kind === GraphPipeKind.Starts || pipe.kind === GraphPipeKind.Continues) {
      const cell = cells[pipe.toPosition]
      if (cell) cell.down = true
    }
    if (pipe.kind === GraphPipeKind.Terminates || pipe.kind === GraphPipeKind.Continues) {
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
      const marker = cell.kind === "merge" ? "◎" : cell.kind === "commit" ? "○" : first
      return `${marker}${second}`
    })
    .join("")
    .trimEnd()
}

export function buildCommitGraph(commits: GitCommit[]) {
  if (!commits.length) return []
  let pipes: GraphPipe[] = [
    {
      fromHash: "__START__",
      toHash: commits[0]?.fullHash ?? "",
      fromPosition: 0,
      toPosition: 0,
      kind: GraphPipeKind.Starts,
    },
  ]
  return commits.map((commit) => {
    pipes = nextGraphPipes(pipes, commit)
    return {
      id: commit.fullHash,
      graph: renderGraphPipes(pipes),
      commitHash: commit.fullHash,
    }
  })
}

export function graphLaneColor(column: number) {
  const colors = [
    COLORS.git,
    COLORS.database,
    COLORS.graphAccent,
    COLORS.success,
    COLORS.focus,
    "#f78c6c",
    "#82aaff",
    "#c3e88d",
  ]
  return colors[column % colors.length] ?? COLORS.git
}

export function commitLaneColor(graph: string) {
  const commitPosition = graph.indexOf("○")
  const mergePosition = graph.indexOf("◎")
  const markerPosition = commitPosition === -1 ? mergePosition : commitPosition
  return graphLaneColor(Math.floor(Math.max(0, markerPosition) / 2))
}

export function styledGraph(graph: string, width: number, background: string) {
  const formatted = fillLine(formatGraph(graph), width)
  const bg = RGBA.fromHex(background)
  return new StyledText(
    Array.from(formatted).map((character, index) => {
      const lane =
        character === "╰" || character === "╯" ? Math.ceil(index / 2) : Math.floor(index / 2)
      return {
        __isChunk: true,
        text: character,
        fg: RGBA.fromHex(graphLaneColor(lane)),
        bg,
      }
    }),
  )
}

export function formatDecorations(decorations: string) {
  return decorations
    .split(",")
    .map((decoration) => decoration.trim().replace(/^HEAD -> /, ""))
    .filter(Boolean)
    .join(" · ")
}
