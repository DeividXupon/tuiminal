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
  relativeDate: string
  author: string
  authorEmail: string
  decorations: string
  parents: string[]
  subject: string
  body: string
  filesChanged: number
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
