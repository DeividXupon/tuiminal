export type GitFile = {
  path: string
  indexStatus: string
  worktreeStatus: string
  staged: boolean
  unstaged: boolean
  untracked: boolean
}

export type GitCommit = {
  fullHash: string
  hash: string
  date: string
  author: string
  decorations: string
  parents: string[]
  subject: string
  additions: number
  deletions: number
}

export type GitSnapshot = {
  isRepository: boolean
  launchDirectory: string
  root: string | null
  repositoryName: string
  branch: string
  upstream: string | null
  ahead: number
  behind: number
  files: GitFile[]
  commits: GitCommit[]
}
