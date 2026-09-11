import type { GitFile } from "./types"

export type ViewMode = "diff" | "graph" | "log" | "commit"
export type DiffLayout = "unified" | "split" | "inline"
export type NarrowGitPane = "files" | "preview"
export type GitFocusPane = NarrowGitPane | "terminal"
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
  kind: "folder" | "file"
  path: string
  depth: number
  indexStatus?: string
  worktreeStatus?: string
}

export function resolveDiffDocumentPath(header: string, selectedPath?: string) {
  if (selectedPath) return selectedPath
  const plainMarker = header.lastIndexOf(" b/")
  if (plainMarker >= 0) return header.slice(plainMarker + 3)
  const quoted = [...header.matchAll(/"((?:\\.|[^"\\])*)"/g)].at(-1)?.[0]
  if (!quoted) return "arquivo"
  try {
    const decoded = JSON.parse(quoted) as string
    return decoded.startsWith("b/") ? decoded.slice(2) : decoded
  } catch {
    return "arquivo"
  }
}
