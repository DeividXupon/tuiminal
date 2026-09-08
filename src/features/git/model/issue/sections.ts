import { ISSUE_COLUMNS, ISSUE_SORTS } from "./config"
import { normalizeIssueQuery } from "./query"
import type { IssueColumn, IssueSection, IssueSort, IssueSummary } from "./types"

export type IssueSectionManagerTab = "sections" | "repositories"
export type IssueSectionManagerAction =
  | { type: "close" }
  | { type: "select-tab"; tab: IssueSectionManagerTab }
  | { type: "move-selection"; delta: -1 | 1 }
  | { type: "create" | "edit" | "duplicate" | "delete" | "add-repository" }
  | { type: "move-section"; delta: -1 | 1 }

const SECTION_ID_PATTERN = /[^a-z0-9]+/g

export function createIssueSectionId(title: string, sections: readonly IssueSection[]) {
  const base =
    title
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(SECTION_ID_PATTERN, "-")
      .replace(/^-|-$/g, "") || "section"
  const identifiers = new Set(sections.map((section) => section.id))
  if (!identifiers.has(base)) return base
  let suffix = 2
  while (identifiers.has(`${base}-${suffix}`)) suffix += 1
  return `${base}-${suffix}`
}

export function makeIssueSection({
  title,
  query,
  columns,
  sort,
  limit,
  sections,
}: {
  title: string
  query: string
  columns?: IssueColumn[]
  sort?: IssueSort
  limit?: number
  sections: readonly IssueSection[]
}): IssueSection {
  const normalizedTitle = title.trim()
  const normalizedQuery = normalizeIssueQuery(query)
  if (!normalizedTitle) throw new Error("Section title is required")
  if (!normalizedQuery) throw new Error("Section query is required")
  return {
    id: createIssueSectionId(normalizedTitle, sections),
    title: normalizedTitle,
    query: normalizedQuery,
    ...(columns?.length ? { columns: normalizeIssueColumns(columns) } : {}),
    ...(sort ? { sort } : {}),
    ...(limit ? { limit: Math.min(100, Math.max(1, Math.floor(limit))) } : {}),
  }
}

export function updateIssueSection(
  sections: readonly IssueSection[],
  id: string,
  values: Omit<Parameters<typeof makeIssueSection>[0], "sections">,
) {
  const title = values.title.trim()
  const query = normalizeIssueQuery(values.query)
  if (!title) throw new Error("Section title is required")
  if (!query) throw new Error("Section query is required")
  if (!sections.some((section) => section.id === id)) throw new Error("Section not found")
  return sections.map((section) =>
    section.id === id
      ? {
          id,
          title,
          query,
          ...(values.columns?.length ? { columns: normalizeIssueColumns(values.columns) } : {}),
          ...(values.sort ? { sort: values.sort } : {}),
          ...(values.limit ? { limit: values.limit } : {}),
        }
      : section,
  )
}

export function normalizeIssueColumns(columns: readonly string[]) {
  return [...new Set(columns)].filter((column): column is IssueColumn =>
    ISSUE_COLUMNS.includes(column as IssueColumn),
  )
}

export function parseIssueSectionOptions({
  columns,
  sort,
  limit,
}: Record<"columns" | "sort" | "limit", string>) {
  const parsedColumns = normalizeIssueColumns(columns.split(/[\s,]+/).filter(Boolean))
  const parsedSort = ISSUE_SORTS.includes(sort as IssueSort) ? (sort as IssueSort) : null
  const parsedLimit = Number(limit)
  if (!parsedColumns.length) throw new Error("At least one valid column is required")
  if (!parsedSort) throw new Error("Invalid section sort")
  if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
    throw new Error("Section limit must be between 1 and 100")
  }
  return { columns: parsedColumns, sort: parsedSort, limit: parsedLimit }
}

export function orderIssueItems(items: readonly IssueSummary[], sort: IssueSort = "updated-desc") {
  return [...items].sort((left, right) => {
    if (sort === "updated-asc") return left.updatedAt.localeCompare(right.updatedAt)
    if (sort === "number-desc") return right.identity.number - left.identity.number
    if (sort === "number-asc") return left.identity.number - right.identity.number
    return right.updatedAt.localeCompare(left.updatedAt)
  })
}

export function duplicateIssueSection(sections: readonly IssueSection[], id: string) {
  const source = sections.find((section) => section.id === id)
  if (!source) throw new Error("Section not found")
  const copy = makeIssueSection({
    title: `${source.title} (cópia)`,
    query: source.query,
    ...(source.columns ? { columns: source.columns } : {}),
    ...(source.sort ? { sort: source.sort } : {}),
    ...(source.limit ? { limit: source.limit } : {}),
    sections,
  })
  const index = sections.indexOf(source)
  return [...sections.slice(0, index + 1), copy, ...sections.slice(index + 1)]
}

export function moveIssueSection(sections: readonly IssueSection[], id: string, delta: -1 | 1) {
  const source = sections.findIndex((section) => section.id === id)
  if (source < 0 || sections.length < 2) return [...sections]
  const destination = Math.max(0, Math.min(sections.length - 1, source + delta))
  if (destination === source) return [...sections]
  const result = [...sections]
  const [section] = result.splice(source, 1)
  if (section) result.splice(destination, 0, section)
  return result
}

export function removeIssueSection(sections: readonly IssueSection[], id: string) {
  if (sections.length <= 1) throw new Error("At least one section is required")
  return sections.filter((section) => section.id !== id)
}

function issueSectionTabAction(
  key: { name: string; option?: boolean },
  hasSelection: boolean,
): IssueSectionManagerAction | null {
  if (key.name === "n") return { type: "create" }
  if (hasSelection && ["e", "return", "enter"].includes(key.name)) return { type: "edit" }
  if (hasSelection && key.name === "d") return { type: "duplicate" }
  if (hasSelection && key.option && key.name === "up") {
    return { type: "move-section", delta: -1 }
  }
  if (hasSelection && key.option && key.name === "down") {
    return { type: "move-section", delta: 1 }
  }
  return hasSelection && key.name === "x" ? { type: "delete" } : null
}

function issueRepositoryTabAction(
  key: { name: string; sequence?: string },
  hasSelection: boolean,
): IssueSectionManagerAction | null {
  if (key.name === "+" || key.sequence === "+") return { type: "add-repository" }
  return hasSelection && key.name === "x" ? { type: "delete" } : null
}

export function issueSectionManagerAction({
  key,
  tab,
  hasSelection,
}: {
  key: { name: string; sequence?: string; option?: boolean }
  tab: IssueSectionManagerTab
  hasSelection: boolean
}): IssueSectionManagerAction | null {
  if (key.name === "escape") return { type: "close" }
  if (key.name === "1" || key.name === "2") {
    return { type: "select-tab", tab: key.name === "1" ? "sections" : "repositories" }
  }
  if (tab === "sections" && key.option) {
    const reorder = issueSectionTabAction(key, hasSelection)
    if (reorder) return reorder
  }
  if (key.name === "j" || key.name === "down") return { type: "move-selection", delta: 1 }
  if (key.name === "k" || key.name === "up") return { type: "move-selection", delta: -1 }
  return tab === "sections"
    ? issueSectionTabAction(key, hasSelection)
    : issueRepositoryTabAction(key, hasSelection)
}
