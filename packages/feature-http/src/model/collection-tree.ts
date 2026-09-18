import { basename } from "node:path"
import type { HttpProjectRequestItem } from "./types"
import type { PostmanCollectionFolder } from "../postman/sync"

export type HttpCollectionTreeRow =
  | {
      id: string
      kind: "directory" | "file"
      path: string
      name: string
      depth: number
      expanded: boolean
      requestCount: number
    }
  | {
      id: string
      kind: "request"
      path: string
      depth: number
      item: HttpProjectRequestItem
      folderPath?: string
    }
  | {
      id: string
      kind: "folder"
      path: string
      folderPath: string
      folderId: string
      name: string
      depth: number
      expanded: boolean
      requestCount: number
    }

type CollectionDirectory = {
  path: string
  directories: Map<string, CollectionDirectory>
  files: Map<string, HttpProjectRequestItem[]>
}

export function httpCollectionNodeId(kind: "directory" | "file", path: string) {
  return `${kind}:${path}`
}

function normalizedSearch(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase()
}

function requestMatches(item: HttpProjectRequestItem, search: string) {
  if (!search) return true
  const haystack = normalizedSearch(
    `${item.filePath}\n${item.request.method}\n${item.request.name}`,
  )
  return search.split(/\s+/).every((term) => haystack.includes(term))
}

function filteredRequests(items: HttpProjectRequestItem[], query: string) {
  const search = normalizedSearch(query.trim())
  return search ? items.filter((item) => requestMatches(item, search)) : items
}

function createDirectory(path: string): CollectionDirectory {
  return { path, directories: new Map(), files: new Map() }
}

function addDirectory(root: CollectionDirectory, path: string) {
  const parts = path.split(/[\\/]+/).filter(Boolean)
  let directory = root
  for (const part of parts) {
    const path = directory.path ? `${directory.path}/${part}` : part
    const child = directory.directories.get(part) ?? createDirectory(path)
    directory.directories.set(part, child)
    directory = child
  }
  return directory
}

function addFile(root: CollectionDirectory, filePath: string, items: HttpProjectRequestItem[]) {
  const parts = filePath.split(/[\\/]+/).filter(Boolean)
  const fileName = parts.pop()
  if (!fileName) return
  const directory = addDirectory(root, parts.join("/"))
  directory.files.set(filePath, items)
}

function requestCount(directory: CollectionDirectory): number {
  let count = [...directory.files.values()].reduce((total, requests) => total + requests.length, 0)
  for (const child of directory.directories.values()) count += requestCount(child)
  return count
}

function directPostmanFolders(folders: readonly PostmanCollectionFolder[], parentPath: string) {
  return folders
    .filter((folder) => {
      const separator = folder.path.lastIndexOf(" / ")
      return (separator < 0 ? "" : folder.path.slice(0, separator)) === parentPath
    })
    .sort((left, right) => left.path.localeCompare(right.path))
}

function requestFolderPath(item: HttpProjectRequestItem, folderPaths: readonly string[]) {
  return folderPaths
    .filter((candidate) => item.request.name.startsWith(`${candidate} / `))
    .sort((left, right) => right.length - left.length)[0]
}

function folderLeafName(path: string) {
  const separator = path.lastIndexOf(" / ")
  return separator < 0 ? path : path.slice(separator + 3)
}

function postmanFileRows(
  filePath: string,
  requests: HttpProjectRequestItem[],
  folders: readonly PostmanCollectionFolder[],
  depth: number,
  collapsed: ReadonlySet<string>,
  searching: boolean,
): HttpCollectionTreeRow[] {
  const relevant = folders.filter((folder) => folder.filePath === filePath)
  const byPath = new Map(relevant.map((folder) => [folder.path, folder]))
  const rows: HttpCollectionTreeRow[] = []
  const append = (parentPath: string, currentDepth: number) => {
    const children = directPostmanFolders(relevant, parentPath)
    for (const folder of children) {
      const id = `folder:${filePath}:${folder.id}`
      const expanded = searching || !collapsed.has(id)
      const prefix = `${folder.path} / `
      const count = requests.filter((item) => item.request.name.startsWith(prefix)).length
      if (!searching || count) {
        rows.push({
          id,
          kind: "folder",
          path: filePath,
          folderPath: folder.path,
          folderId: folder.id,
          name: folderLeafName(folder.path),
          depth: currentDepth,
          expanded,
          requestCount: count,
        })
        if (expanded) append(folder.path, currentDepth + 1)
      }
    }
    for (const item of requests) {
      const path = requestFolderPath(item, [...byPath.keys()])
      if ((path ?? "") !== parentPath) continue
      rows.push({
        id: `request:${item.request.id}`,
        kind: "request",
        path: filePath,
        depth: currentDepth,
        item,
        ...(path ? { folderPath: path } : {}),
      })
    }
  }
  append("", depth)
  return rows
}

function flattenDirectory(
  directory: CollectionDirectory,
  depth: number,
  collapsed: ReadonlySet<string>,
  searching: boolean,
  folders: readonly PostmanCollectionFolder[],
): HttpCollectionTreeRow[] {
  const rows: HttpCollectionTreeRow[] = []
  for (const child of [...directory.directories.values()].sort((left, right) =>
    left.path.localeCompare(right.path),
  )) {
    const id = httpCollectionNodeId("directory", child.path)
    const expanded = searching || !collapsed.has(id)
    rows.push({
      id,
      kind: "directory",
      path: child.path,
      name: basename(child.path),
      depth,
      expanded,
      requestCount: requestCount(child),
    })
    if (expanded) rows.push(...flattenDirectory(child, depth + 1, collapsed, searching, folders))
  }
  for (const [filePath, requests] of [...directory.files].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    const id = httpCollectionNodeId("file", filePath)
    const expanded = searching || !collapsed.has(id)
    rows.push({
      id,
      kind: "file",
      path: filePath,
      name: basename(filePath),
      depth,
      expanded,
      requestCount: requests.length,
    })
    if (expanded) {
      rows.push(...postmanFileRows(filePath, requests, folders, depth + 1, collapsed, searching))
    }
  }
  return rows
}

export function buildHttpCollectionTree(
  items: HttpProjectRequestItem[],
  collapsed: ReadonlySet<string> = new Set(),
  query = "",
  directories: readonly string[] = [],
  files: readonly string[] = [],
  postmanFolders: readonly PostmanCollectionFolder[] = [],
  hidePostmanRoot = false,
) {
  const requests = filteredRequests(items, query)
  const byFile = new Map<string, HttpProjectRequestItem[]>()
  for (const item of requests) {
    const group = byFile.get(item.filePath) ?? []
    group.push(item)
    byFile.set(item.filePath, group)
  }
  const root = createDirectory("")
  if (!query.trim()) {
    for (const path of directories) addDirectory(root, path)
    for (const path of files) byFile.set(path, byFile.get(path) ?? [])
  }
  for (const [filePath, fileRequests] of byFile) addFile(root, filePath, fileRequests)
  return flattenDirectory(
    hidePostmanRoot ? (root.directories.get("postman") ?? createDirectory("postman")) : root,
    0,
    collapsed,
    Boolean(query.trim()),
    postmanFolders,
  )
}
