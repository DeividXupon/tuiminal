import type { GitFile } from "./types"

export type GitCommandConsoleLine = {
  id: number
  text: string
  tone: "command" | "success" | "error" | "muted"
}

type GitCommandParserState = {
  args: string[]
  current: string
  quote: "'" | '"' | null
  escaped: boolean
  started: boolean
}

function consumeCommandCharacter(state: GitCommandParserState, character: string) {
  if (state.escaped) {
    state.current += character
    state.escaped = false
    state.started = true
  } else if (character === "\\" && state.quote !== "'") {
    state.escaped = true
    state.started = true
  } else if (state.quote) {
    if (character === state.quote) state.quote = null
    else state.current += character
    state.started = true
  } else if (character === "'" || character === '"') {
    state.quote = character
    state.started = true
  } else if (/\s/.test(character)) {
    if (state.started) {
      state.args.push(state.current)
      state.current = ""
      state.started = false
    }
  } else {
    state.current += character
    state.started = true
  }
}

export function parseGitCommandInput(value: string) {
  const state: GitCommandParserState = {
    args: [],
    current: "",
    quote: null,
    escaped: false,
    started: false,
  }
  for (const character of value.trim()) consumeCommandCharacter(state, character)
  if (state.escaped) throw new Error("A barra invertida final está incompleta.")
  if (state.quote) throw new Error("Feche as aspas antes de executar o comando.")
  if (state.started) state.args.push(state.current)
  if (state.args[0] === "git") state.args.shift()
  if (!state.args.length) throw new Error("Digite um comando Git.")
  return state.args
}

function displayArgument(argument: string) {
  return /^[\w./:@=-]+$/.test(argument) ? argument : `'${argument.replaceAll("'", "'\\''")}'`
}

export function displayGitCommand(args: readonly string[]) {
  return ["git", ...args.map(displayArgument)].join(" ")
}

export function filesInsideGitFolder(files: readonly GitFile[], folder: string) {
  const prefix = `${folder.replace(/\/+$/, "")}/`
  return files.filter((file) => file.path.startsWith(prefix))
}

function stagedFile(file: GitFile): GitFile {
  if (!file.unstaged) return file
  const indexStatus = file.untracked
    ? "A"
    : file.indexStatus !== " "
      ? file.indexStatus
      : file.worktreeStatus
  return {
    ...file,
    indexStatus,
    worktreeStatus: " ",
    staged: true,
    unstaged: false,
    untracked: false,
  }
}

function unstagedFile(file: GitFile): GitFile {
  if (!file.staged) return file
  if (file.indexStatus === "A") {
    return {
      ...file,
      indexStatus: "?",
      worktreeStatus: "?",
      staged: false,
      unstaged: true,
      untracked: true,
    }
  }
  return {
    ...file,
    indexStatus: " ",
    worktreeStatus: file.indexStatus,
    staged: false,
    unstaged: true,
    untracked: false,
  }
}

export function optimisticGitStage(
  files: readonly GitFile[],
  targets: readonly GitFile[],
  mode: "stage" | "unstage",
) {
  const targetPaths = new Set(targets.map((file) => file.path))
  return files.map((file) => {
    if (!targetPaths.has(file.path)) return file
    return mode === "stage" ? stagedFile(file) : unstagedFile(file)
  })
}

export function optimisticGitDiscard(files: readonly GitFile[], targets: readonly GitFile[]) {
  const targetPaths = new Set(targets.map((file) => file.path))
  return files.filter((file) => !targetPaths.has(file.path))
}
