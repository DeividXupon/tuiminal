import type { FileTreeNode, FileTreeOption } from "../model/view"
import type { GitFile } from "../services/git"

export const FILE_OPTION_PREFIX = "file:"
export const FOLDER_OPTION_PREFIX = "folder:"

export function fileCode(file: GitFile) {
  if (file.untracked) return "??"
  return `${file.indexStatus}${file.worktreeStatus}`
}

export function displayPath(path: string) {
  return path.replace(/[\r\n\t]/g, "�")
}

export function fileOptionValue(path: string) {
  return `${FILE_OPTION_PREFIX}${path}`
}

export function folderOptionValue(path: string) {
  return `${FOLDER_OPTION_PREFIX}${path}`
}

type PathTreeNode = {
  directories: Map<string, PathTreeNode>
  files: string[]
}

export function createPathTreeOptions(
  paths: string[],
  collapsedFolders: Set<string>,
): FileTreeOption[] {
  const root: PathTreeNode = { directories: new Map(), files: [] }

  for (const path of paths) {
    const parts = path.split("/")
    let node = root
    for (const directory of parts.slice(0, -1)) {
      const child = node.directories.get(directory) ?? {
        directories: new Map(),
        files: [],
      }
      node.directories.set(directory, child)
      node = child
    }
    node.files.push(path)
  }

  const options: FileTreeOption[] = []
  const appendNode = (node: PathTreeNode, parentPath: string, depth: number) => {
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
        kind: "folder",
        path,
        depth,
      })
      if (!collapsed) appendNode(child, path, depth + 1)
    }

    for (const path of [...node.files].sort((left, right) => left.localeCompare(right))) {
      const name = path.split("/").at(-1) ?? path
      options.push({
        name: `${indent}${displayPath(name)}`,
        description: "",
        value: fileOptionValue(path),
        kind: "file",
        path,
        depth,
      })
    }
  }

  appendNode(root, "", 0)
  return options
}

export function createFileTreeOptions(
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
        kind: "folder",
        path,
        depth,
      })
      if (!collapsed) appendNode(child, path, depth + 1)
    }

    for (const file of [...node.files].sort((left, right) => left.path.localeCompare(right.path))) {
      const name = file.path.split("/").at(-1) ?? file.path
      options.push({
        name: `${indent}${fileCode(file)} ${displayPath(name)}`,
        description: "",
        value: fileOptionValue(file.path),
        kind: "file",
        path: file.path,
        depth,
        indexStatus: file.indexStatus,
        worktreeStatus: file.worktreeStatus,
      })
    }
  }

  appendNode(root, "", 0)
  return options
}
