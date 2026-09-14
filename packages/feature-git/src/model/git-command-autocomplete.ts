export type GitCommandCompletionKind =
  | "command"
  | "option"
  | "subcommand"
  | "currentBranch"
  | "localBranch"
  | "remoteBranch"
  | "tag"
  | "remote"
  | "path"

export type GitCommandCompletion = {
  value: string
  kind: GitCommandCompletionKind
}

export type GitCommandCompletionData = {
  branches: Array<{
    name: string
    kind: "local" | "remote"
    current: boolean
  }>
  tags: string[]
  remotes: string[]
  paths: string[]
}

type GitInputToken = {
  value: string
  start: number
  end: number
}

type GitInputScanner = {
  current: string
  start: number
  quote: "'" | '"' | null
  escaped: boolean
}

const COMMANDS = [
  "add",
  "branch",
  "checkout",
  "cherry-pick",
  "clean",
  "clone",
  "commit",
  "diff",
  "fetch",
  "init",
  "log",
  "merge",
  "mv",
  "pull",
  "push",
  "rebase",
  "remote",
  "reset",
  "restore",
  "revert",
  "rm",
  "show",
  "stash",
  "status",
  "switch",
  "tag",
  "worktree",
] as const

const COMMAND_OPTIONS: Readonly<Record<string, readonly string[]>> = {
  add: ["--all", "--patch", "--update", "--intent-to-add", "--"],
  branch: ["--all", "--delete", "--force", "--move", "--remotes", "--verbose"],
  checkout: ["--branch", "--detach", "--force", "--orphan", "--"],
  "cherry-pick": ["--abort", "--continue", "--no-commit", "--skip"],
  clean: ["--dry-run", "--force", "--directories", "--interactive"],
  commit: ["--message", "--amend", "--no-edit", "--all", "--signoff"],
  diff: ["--cached", "--staged", "--stat", "--name-only", "--word-diff", "--"],
  fetch: ["--all", "--prune", "--tags"],
  log: ["--oneline", "--graph", "--decorate", "--all", "--stat"],
  merge: ["--no-ff", "--ff-only", "--squash", "--abort", "--continue"],
  pull: ["--rebase", "--ff-only", "--no-rebase"],
  push: ["--set-upstream", "--force-with-lease", "--tags", "--delete"],
  rebase: ["--interactive", "--onto", "--abort", "--continue", "--skip"],
  reset: ["--soft", "--mixed", "--hard"],
  restore: ["--staged", "--worktree", "--source=", "--"],
  revert: ["--no-commit", "--continue", "--abort"],
  rm: ["--cached", "--force", "--dry-run", "--"],
  show: ["--stat", "--name-only", "--format="],
  stash: ["--include-untracked", "--keep-index", "--patch"],
  status: ["--short", "--branch", "--porcelain", "--ignored", "--untracked-files="],
  switch: ["--create", "--detach", "--force-create", "--no-guess"],
  tag: ["--annotate", "--delete", "--list", "--message"],
  worktree: ["--force", "--detach", "--checkout", "--no-checkout"],
}

const SUBCOMMANDS: Readonly<Record<string, readonly string[]>> = {
  remote: ["add", "get-url", "prune", "remove", "rename", "set-head", "set-url", "show", "update"],
  stash: ["apply", "clear", "drop", "list", "pop", "push", "show"],
  worktree: ["add", "list", "lock", "move", "prune", "remove", "repair", "unlock"],
}

const BRANCH_COMMANDS = new Set(["branch", "checkout", "switch"])
const REF_COMMANDS = new Set(["cherry-pick", "merge", "rebase", "reset", "revert"])
const INSPECTION_COMMANDS = new Set(["diff", "log", "show"])
const PATH_COMMANDS = new Set(["add", "clean", "mv", "restore", "rm"])

function finishInputToken(scanner: GitInputScanner, tokens: GitInputToken[], end: number) {
  if (scanner.start < 0) return
  tokens.push({ value: scanner.current, start: scanner.start, end })
  scanner.current = ""
  scanner.start = -1
}

function consumeInputCharacter(
  scanner: GitInputScanner,
  tokens: GitInputToken[],
  character: string,
  index: number,
) {
  if (scanner.escaped) {
    scanner.current += character
    scanner.escaped = false
  } else if (character === "\\" && scanner.quote !== "'") {
    if (scanner.start < 0) scanner.start = index
    scanner.escaped = true
  } else if (scanner.quote) {
    if (character === scanner.quote) scanner.quote = null
    else scanner.current += character
  } else if (character === "'" || character === '"') {
    if (scanner.start < 0) scanner.start = index
    scanner.quote = character
  } else if (/\s/.test(character)) {
    finishInputToken(scanner, tokens, index)
  } else {
    if (scanner.start < 0) scanner.start = index
    scanner.current += character
  }
}

function scanGitInput(value: string): GitInputToken[] {
  const tokens: GitInputToken[] = []
  const scanner: GitInputScanner = { current: "", start: -1, quote: null, escaped: false }
  for (let index = 0; index < value.length; index += 1) {
    consumeInputCharacter(scanner, tokens, value[index] ?? "", index)
  }
  if (scanner.escaped) scanner.current += "\\"
  finishInputToken(scanner, tokens, value.length)
  return tokens
}

function activeTokenAt(tokens: readonly GitInputToken[], cursorOffset: number) {
  return tokens.find(
    (token) =>
      (cursorOffset >= token.start && cursorOffset < token.end) ||
      (cursorOffset === token.end && cursorOffset > token.start),
  )
}

function completionKind(branch: GitCommandCompletionData["branches"][number]) {
  if (branch.current) return "currentBranch" as const
  return branch.kind === "local" ? ("localBranch" as const) : ("remoteBranch" as const)
}

function branchCompletions(data: GitCommandCompletionData): GitCommandCompletion[] {
  return data.branches.map((branch) => ({ value: branch.name, kind: completionKind(branch) }))
}

function refCompletions(data: GitCommandCompletionData): GitCommandCompletion[] {
  return [
    ...branchCompletions(data),
    ...data.tags.map((value) => ({ value, kind: "tag" as const })),
  ]
}

function optionCompletions(command: string): GitCommandCompletion[] {
  return (COMMAND_OPTIONS[command] ?? []).map((value) => ({ value, kind: "option" }))
}

function argumentCompletions({
  command,
  previousArguments,
  activeValue,
  data,
}: {
  command: string
  previousArguments: readonly string[]
  activeValue: string
  data: GitCommandCompletionData
}): GitCommandCompletion[] {
  if (activeValue.startsWith("-")) return optionCompletions(command)
  const afterPathSeparator = previousArguments.includes("--")
  if (afterPathSeparator || PATH_COMMANDS.has(command)) {
    return data.paths.map((value) => ({ value, kind: "path" }))
  }
  if (command === "push" || command === "pull" || command === "fetch") {
    const positional = previousArguments.filter((value) => !value.startsWith("-"))
    if (!positional.length) {
      return data.remotes.map((value) => ({ value, kind: "remote" }))
    }
    return branchCompletions(data)
  }
  if (command === "remote") {
    if (!previousArguments.length) {
      return (SUBCOMMANDS.remote ?? []).map((value) => ({ value, kind: "subcommand" }))
    }
    return data.remotes.map((value) => ({ value, kind: "remote" }))
  }
  if ((command === "stash" || command === "worktree") && !previousArguments.length) {
    return (SUBCOMMANDS[command] ?? []).map((value) => ({ value, kind: "subcommand" }))
  }
  if (BRANCH_COMMANDS.has(command)) return branchCompletions(data)
  if (REF_COMMANDS.has(command) || INSPECTION_COMMANDS.has(command)) return refCompletions(data)
  return optionCompletions(command)
}

function uniqueCompletions(values: readonly GitCommandCompletion[]) {
  const seen = new Set<string>()
  return values.filter((completion) => {
    const key = completion.value
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function gitCommandCompletions({
  input,
  cursorOffset = input.length,
  data,
  limit = 4,
}: {
  input: string
  cursorOffset?: number
  data: GitCommandCompletionData
  limit?: number
}) {
  const cursor = Math.max(0, Math.min(input.length, cursorOffset))
  const tokens = scanGitInput(input)
  const active = activeTokenAt(tokens, cursor)
  const beforeCursor = tokens.filter((token) => token.end <= cursor && token !== active)
  const leadingGit = tokens[0]?.value === "git"
  const commandIndex = leadingGit ? 1 : 0
  const commandToken = tokens[commandIndex]
  const activeIsCommand = !commandToken || active === commandToken
  const activeValue = active?.value ?? ""
  const candidates = activeIsCommand
    ? COMMANDS.map((value) => ({ value, kind: "command" as const }))
    : argumentCompletions({
        command: commandToken.value,
        previousArguments: beforeCursor.slice(commandIndex + 1).map((token) => token.value),
        activeValue,
        data,
      })
  const filter = activeValue.toLocaleLowerCase()
  return uniqueCompletions(candidates)
    .filter((completion) => !filter || completion.value.toLocaleLowerCase().startsWith(filter))
    .slice(0, Math.max(0, limit))
}

function displayCompletionValue(completion: GitCommandCompletion) {
  if (
    completion.kind === "command" ||
    completion.kind === "option" ||
    completion.kind === "subcommand"
  ) {
    return completion.value
  }
  return /^[\w./:@=-]+$/.test(completion.value)
    ? completion.value
    : `'${completion.value.replaceAll("'", "'\\''")}'`
}

export function applyGitCommandCompletion({
  input,
  cursorOffset = input.length,
  completion,
}: {
  input: string
  cursorOffset?: number
  completion: GitCommandCompletion
}) {
  const cursor = Math.max(0, Math.min(input.length, cursorOffset))
  const active = activeTokenAt(scanGitInput(input), cursor)
  const start = active?.start ?? cursor
  const end = active?.end ?? cursor
  const replacement = displayCompletionValue(completion)
  const suffix = input.slice(end)
  const needsSpace = !replacement.endsWith("=") && (!suffix || !/^\s/.test(suffix))
  const inserted = `${replacement}${needsSpace ? " " : ""}`
  return {
    value: `${input.slice(0, start)}${inserted}${suffix}`,
    cursorOffset: start + inserted.length,
  }
}
