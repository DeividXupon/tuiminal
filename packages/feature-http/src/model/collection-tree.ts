import { basename } from "node:path"
import type { HttpProjectRequestItem } from "./types"

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

function addFile(root: CollectionDirectory, filePath: string, items: HttpProjectRequestItem[]) {
  const parts = filePath.split(/[\\/]+/).filter(Boolean)
  const fileName = parts.pop()
  if (!fileName) return
  let directory = root
  for (const part of parts) {
    const path = directory.path ? `${directory.path}/${part}` : part
    const child = directory.directories.get(part) ?? createDirectory(path)
    directory.directories.set(part, child)
    directory = child
  }
  directory.files.set(filePath, items)
}

function requestCount(directory: CollectionDirectory): number {
  let count = [...directory.files.values()].reduce((total, requests) => total + requests.length, 0)
  for (const child of directory.directories.values()) count += requestCount(child)
  return count
}

function flattenDirectory(
  directory: CollectionDirectory,
  depth: number,
  collapsed: ReadonlySet<string>,
  searching: boolean,
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
    if (expanded) rows.push(...flattenDirectory(child, depth + 1, collapsed, searching))
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
      rows.push(
        ...requests.map(
          (item): HttpCollectionTreeRow => ({
            id: `request:${item.request.id}`,
            kind: "request",
            path: filePath,
            depth: depth + 1,
            item,
          }),
        ),
      )
    }
  }
  return rows
}

export function buildHttpCollectionTree(
  items: HttpProjectRequestItem[],
  collapsed: ReadonlySet<string> = new Set(),
  query = "",
) {
  const requests = filteredRequests(items, query)
  const byFile = new Map<string, HttpProjectRequestItem[]>()
  for (const item of requests) {
    const group = byFile.get(item.filePath) ?? []
    group.push(item)
    byFile.set(item.filePath, group)
  }
  const root = createDirectory("")
  for (const [filePath, fileRequests] of byFile) addFile(root, filePath, fileRequests)
  return flattenDirectory(root, 0, collapsed, Boolean(query.trim()))
}
