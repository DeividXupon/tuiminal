export type TerminalRepositoryState = "loading" | "clean" | "dirty" | "no-git"

export type TerminalRepositoryChanges = {
  additions: number
  deletions: number
  partial: boolean
}

export type TerminalRepositoryContext = {
  directory: string
  projectName: string
  branch?: string
  state: TerminalRepositoryState
  changes?: TerminalRepositoryChanges
}
