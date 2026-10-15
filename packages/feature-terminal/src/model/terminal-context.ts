export type TerminalRepositoryState = "loading" | "clean" | "dirty" | "no-git"

export type TerminalRepositoryContext = {
  directory: string
  projectName: string
  branch?: string
  state: TerminalRepositoryState
}
