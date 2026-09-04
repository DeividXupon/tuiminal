import type { GitFile } from "./types"

export type ViewMode = "diff" | "graph" | "log" | "commit"
export type DiffLayout = "unified" | "split" | "inline"
export type NarrowGitPane = "files" | "preview"
export type DiffLineKind = "added" | "removed" | "context" | "hunk" | "file" | "section" | "meta"

export type ParsedDiffLine = {
  kind: DiffLineKind
  content: string
  oldLine: number | null
  newLine: number | null
}

export type DiffDocument = {
  key: string
  source: string
  path: string
  filetype: string
  section: string
  unifiedLineCount: number
  splitLineCount: number
  inlineRows: InlineDiffRow[]
}

export type CharacterRange = {
  start: number
  end: number
}

export type InlineDiffRow = {
  key: string
  kind: "context" | "modified" | "added" | "removed"
  content: string
  lineNumber: number
  changedRanges: CharacterRange[]
}

export type FileTreeNode = {
  directories: Map<string, FileTreeNode>
  files: GitFile[]
}

export type FileTreeOption = {
  name: string
  description: string
  value: string
}
