import { responseBodyText } from "./response"
import type { HttpDocumentState } from "./types"

export const HTTP_JSON_TREE_CHARACTER_LIMIT = 50_000
const HTTP_JSON_TREE_NODE_LIMIT = 2_000
const treeCache = new WeakMap<Uint8Array, Map<string, HttpJsonTree>>()
const MAX_CACHED_SHAPES = 8

export type HttpJsonTokenKind =
  | "plain"
  | "marker"
  | "property"
  | "string"
  | "number"
  | "constant"
  | "punctuation"
  | "summary"

export type HttpJsonTreeToken = { text: string; kind: HttpJsonTokenKind }
export type HttpJsonTreeLine = { path: string | null; tokens: HttpJsonTreeToken[] }
export type HttpJsonTreeNode = {
  path: string
  parentPath: string | null
  line: number
  childCount: number
  collapsed: boolean
}
export type HttpJsonTree = {
  lines: HttpJsonTreeLine[]
  nodes: HttpJsonTreeNode[]
  selectedPath: string
  selectedLine: number
}
export type HttpJsonTreeAction = "previous" | "next" | "collapse" | "expand" | "toggle"

const JSON_TREE_KEY_ACTIONS: Partial<Record<string, HttpJsonTreeAction>> = {
  up: "previous",
  k: "previous",
  down: "next",
  j: "next",
  left: "collapse",
  right: "expand",
  enter: "toggle",
  return: "toggle",
  space: "toggle",
}

export function httpJsonTreeActionForKey(name: string) {
  return JSON_TREE_KEY_ACTIONS[name] ?? null
}

function pointerSegment(value: string) {
  return value.replaceAll("~", "~0").replaceAll("/", "~1")
}

function valueToken(value: unknown): HttpJsonTreeToken {
  if (typeof value === "string") return { text: JSON.stringify(value), kind: "string" }
  if (typeof value === "number") return { text: String(value), kind: "number" }
  return { text: String(value), kind: "constant" }
}

function propertyTokens(key: string | null): HttpJsonTreeToken[] {
  return key === null
    ? []
    : [
        { text: JSON.stringify(key), kind: "property" },
        { text: ": ", kind: "punctuation" },
      ]
}

function containerDetails(value: object) {
  return Array.isArray(value)
    ? { entries: value.map((item, index) => [String(index), item] as const), open: "[", close: "]" }
    : { entries: Object.entries(value), open: "{", close: "}" }
}

function childPropertyKey(parent: object, key: string) {
  return Array.isArray(parent) ? null : key
}

function trailingCommaTokens(comma: boolean): HttpJsonTreeToken[] {
  return comma ? [{ text: ",", kind: "punctuation" }] : []
}

function buildJsonTree(
  value: object,
  selectedPath: string | null,
  collapsedPaths: readonly string[],
): HttpJsonTree | null {
  const lines: HttpJsonTreeLine[] = []
  const nodes: HttpJsonTreeNode[] = []
  const collapsed = new Set(collapsedPaths)

  const visit = (
    current: unknown,
    key: string | null,
    path: string,
    parentPath: string | null,
    depth: number,
    comma: boolean,
  ) => {
    if (nodes.length > HTTP_JSON_TREE_NODE_LIMIT) throw new Error("json-tree-limit")
    const indent: HttpJsonTreeToken = { text: "  ".repeat(depth), kind: "plain" }
    if (current === null || typeof current !== "object") {
      lines.push({
        path: null,
        tokens: [
          indent,
          ...propertyTokens(key),
          valueToken(current),
          ...trailingCommaTokens(comma),
        ],
      })
      return
    }

    const details = containerDetails(current)
    const isCollapsed = collapsed.has(path) && details.entries.length > 0
    const line = lines.length
    nodes.push({
      path,
      parentPath,
      line,
      childCount: details.entries.length,
      collapsed: isCollapsed,
    })
    const marker = details.entries.length ? (isCollapsed ? "▸ " : "▾ ") : "  "
    const opening: HttpJsonTreeToken[] = [
      indent,
      { text: marker, kind: "marker" },
      ...propertyTokens(key),
      { text: details.open, kind: "punctuation" },
    ]
    if (isCollapsed) {
      opening.push(
        { text: `… ${details.entries.length}`, kind: "summary" },
        { text: `${details.close}${comma ? "," : ""}`, kind: "punctuation" },
      )
      lines.push({ path, tokens: opening })
      return
    }

    lines.push({ path, tokens: opening })
    details.entries.forEach(([childKey, child], index) => {
      const childPath = `${path}/${pointerSegment(childKey)}`
      visit(
        child,
        childPropertyKey(current, childKey),
        childPath,
        path,
        depth + 1,
        index < details.entries.length - 1,
      )
    })
    lines.push({
      path: null,
      tokens: [
        { text: "  ".repeat(depth), kind: "plain" },
        { text: `${details.close}${comma ? "," : ""}`, kind: "punctuation" },
      ],
    })
  }

  try {
    visit(value, null, "", null, 0, false)
  } catch {
    return null
  }
  const selected = nodes.some((node) => node.path === selectedPath)
    ? (selectedPath ?? "")
    : (nodes[0]?.path ?? "")
  const selectedLine = nodes.find((node) => node.path === selected)?.line ?? 0
  return { lines, nodes, selectedPath: selected, selectedLine }
}

export function httpJsonTreeForDocument(document: HttpDocumentState): HttpJsonTree | null {
  if (
    document.execution.status !== "success" ||
    document.responseView !== "pretty" ||
    document.execution.response.bodyKind !== "json" ||
    document.responsePresentation.foldDepth !== null ||
    document.responsePresentation.jsonPath.trim() ||
    (document.responsePresentation.searchOpen && document.responsePresentation.searchQuery.trim())
  ) {
    return null
  }
  const response = document.execution.response
  const collapsedPaths = document.responsePresentation.jsonCollapsedPaths
  const shapeKey = JSON.stringify([response.encoding, collapsedPaths])
  const cachedShapes = treeCache.get(response.body)
  const cached = cachedShapes?.get(shapeKey)
  if (cached) return selectJsonTreeNode(cached, document.responsePresentation.jsonSelectedPath)
  const source = responseBodyText(response, false, HTTP_JSON_TREE_CHARACTER_LIMIT)
  if (source.length > HTTP_JSON_TREE_CHARACTER_LIMIT) return null
  try {
    const value: unknown = JSON.parse(source)
    if (value === null || typeof value !== "object") return null
    const tree = buildJsonTree(value, null, collapsedPaths)
    if (!tree) return null
    const shapes = cachedShapes ?? new Map<string, HttpJsonTree>()
    if (shapes.size >= MAX_CACHED_SHAPES) shapes.delete(shapes.keys().next().value ?? "")
    shapes.set(shapeKey, tree)
    if (!cachedShapes) treeCache.set(response.body, shapes)
    return selectJsonTreeNode(tree, document.responsePresentation.jsonSelectedPath)
  } catch {
    return null
  }
}

function selectJsonTreeNode(tree: HttpJsonTree, selectedPath: string | null) {
  const node = tree.nodes.find((candidate) => candidate.path === selectedPath) ?? tree.nodes[0]
  if (!node || node.path === tree.selectedPath) return tree
  return { ...tree, selectedPath: node.path, selectedLine: node.line }
}

function withoutPath(paths: readonly string[], path: string) {
  return paths.filter((candidate) => candidate !== path)
}

type JsonTreeUpdateContext = {
  tree: HttpJsonTree
  current: HttpJsonTreeNode
  currentIndex: number
  collapsedPaths: string[]
}

function moveJsonTreeSelection(context: JsonTreeUpdateContext, offset: -1 | 1) {
  const nextIndex = Math.max(
    0,
    Math.min(context.tree.nodes.length - 1, context.currentIndex + offset),
  )
  return {
    jsonSelectedPath: context.tree.nodes[nextIndex]?.path ?? context.current.path,
    jsonCollapsedPaths: context.collapsedPaths,
  }
}

function toggleJsonTreeNode(context: JsonTreeUpdateContext) {
  const collapsedPaths = context.current.collapsed
    ? withoutPath(context.collapsedPaths, context.current.path)
    : [...context.collapsedPaths, context.current.path]
  return {
    jsonSelectedPath: context.current.path,
    jsonCollapsedPaths: context.current.childCount > 0 ? collapsedPaths : context.collapsedPaths,
  }
}

function collapseJsonTreeNode(context: JsonTreeUpdateContext) {
  const canCollapse = context.current.childCount > 0 && !context.current.collapsed
  return {
    jsonSelectedPath:
      canCollapse || context.current.parentPath === null
        ? context.current.path
        : context.current.parentPath,
    jsonCollapsedPaths: canCollapse
      ? [...context.collapsedPaths, context.current.path]
      : context.collapsedPaths,
  }
}

function expandJsonTreeNode(context: JsonTreeUpdateContext) {
  if (context.current.collapsed) {
    return {
      jsonSelectedPath: context.current.path,
      jsonCollapsedPaths: withoutPath(context.collapsedPaths, context.current.path),
    }
  }
  return {
    jsonSelectedPath:
      context.tree.nodes.find((node) => node.parentPath === context.current.path)?.path ??
      context.current.path,
    jsonCollapsedPaths: context.collapsedPaths,
  }
}

const JSON_TREE_UPDATES = {
  previous: (context: JsonTreeUpdateContext) => moveJsonTreeSelection(context, -1),
  next: (context: JsonTreeUpdateContext) => moveJsonTreeSelection(context, 1),
  collapse: collapseJsonTreeNode,
  expand: expandJsonTreeNode,
  toggle: toggleJsonTreeNode,
} satisfies Record<
  HttpJsonTreeAction,
  (context: JsonTreeUpdateContext) => {
    jsonSelectedPath: string
    jsonCollapsedPaths: string[]
  }
>

export function updateHttpJsonTree(
  document: HttpDocumentState,
  action: HttpJsonTreeAction,
  visibleTree?: HttpJsonTree | null,
): Pick<
  HttpDocumentState["responsePresentation"],
  "jsonSelectedPath" | "jsonCollapsedPaths"
> | null {
  const tree = visibleTree === undefined ? httpJsonTreeForDocument(document) : visibleTree
  if (!tree) return null
  const currentIndex = tree.nodes.findIndex((node) => node.path === tree.selectedPath)
  const current = tree.nodes[Math.max(0, currentIndex)]
  if (!current) return null
  return JSON_TREE_UPDATES[action]({
    tree,
    current,
    currentIndex,
    collapsedPaths: document.responsePresentation.jsonCollapsedPaths,
  })
}

export function httpJsonPathAtLine(tree: HttpJsonTree, line: number) {
  let candidate = tree.nodes[0]
  for (const node of tree.nodes) {
    if (node.line > line) break
    candidate = node
  }
  return candidate?.path ?? null
}
