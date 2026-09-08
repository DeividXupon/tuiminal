import { PULL_REQUEST_COLUMNS, PULL_REQUEST_SORTS } from "./config"
import { normalizePullRequestQuery } from "./query"
import type { PullRequestColumn, PullRequestSection, PullRequestSort } from "./types"

const SECTION_ID_PATTERN = /[^a-z0-9]+/g

export function createPullRequestSectionId(title: string, sections: readonly PullRequestSection[]) {
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

export function makePullRequestSection({
  title,
  query,
  columns,
  sort,
  limit,
  sections,
}: {
  title: string
  query: string
  columns?: PullRequestColumn[]
  sort?: PullRequestSort
  limit?: number
  sections: readonly PullRequestSection[]
}): PullRequestSection {
  const normalizedTitle = title.trim()
  const normalizedQuery = normalizePullRequestQuery(query)
  if (!normalizedTitle) throw new Error("Section title is required")
  if (!normalizedQuery) throw new Error("Section query is required")
  return {
    id: createPullRequestSectionId(normalizedTitle, sections),
    title: normalizedTitle,
    query: normalizedQuery,
    ...(columns?.length ? { columns: normalizePullRequestColumns(columns) } : {}),
    ...(sort ? { sort } : {}),
    ...(limit ? { limit: Math.min(100, Math.max(1, Math.floor(limit))) } : {}),
  }
}

export function updatePullRequestSection(
  sections: readonly PullRequestSection[],
  id: string,
  values: {
    title: string
    query: string
    columns?: PullRequestColumn[]
    sort?: PullRequestSort
    limit?: number
  },
) {
  const title = values.title.trim()
  const query = normalizePullRequestQuery(values.query)
  if (!title) throw new Error("Section title is required")
  if (!query) throw new Error("Section query is required")
  if (!sections.some((section) => section.id === id)) throw new Error("Section not found")
  return sections.map((section) => {
    if (section.id !== id) return section
    const { columns: _columns, sort: _sort, limit: _limit, ...base } = section
    return {
      ...base,
      title,
      query,
      ...(values.columns?.length ? { columns: normalizePullRequestColumns(values.columns) } : {}),
      ...(values.sort ? { sort: values.sort } : {}),
      ...(values.limit ? { limit: values.limit } : {}),
    }
  })
}

export function normalizePullRequestColumns(columns: readonly string[]) {
  return [...new Set(columns)].filter((column): column is PullRequestColumn =>
    PULL_REQUEST_COLUMNS.includes(column as PullRequestColumn),
  )
}

export function parsePullRequestSectionOptions({
  columns,
  sort,
  limit,
}: {
  columns: string
  sort: string
  limit: string
}) {
  const parsedColumns = normalizePullRequestColumns(columns.split(/[\s,]+/).filter(Boolean))
  const parsedSort = PULL_REQUEST_SORTS.includes(sort as PullRequestSort)
    ? (sort as PullRequestSort)
    : null
  const parsedLimit = Number(limit)
  if (!parsedColumns.length) throw new Error("At least one valid column is required")
  if (!parsedSort) throw new Error("Invalid section sort")
  if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
    throw new Error("Section limit must be between 1 and 100")
  }
  return { columns: parsedColumns, sort: parsedSort, limit: parsedLimit }
}

export function orderPullRequestItems(
  items: readonly import("./types").PullRequestSummary[],
  sort: PullRequestSort = "updated-desc",
) {
  return [...items].sort((left, right) => {
    if (sort === "updated-asc") return left.updatedAt.localeCompare(right.updatedAt)
    if (sort === "number-desc") return right.identity.number - left.identity.number
    if (sort === "number-asc") return left.identity.number - right.identity.number
    return right.updatedAt.localeCompare(left.updatedAt)
  })
}

export function duplicatePullRequestSection(sections: readonly PullRequestSection[], id: string) {
  const source = sections.find((section) => section.id === id)
  if (!source) throw new Error("Section not found")
  const copy = makePullRequestSection({
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

export function movePullRequestSection(
  sections: readonly PullRequestSection[],
  id: string,
  delta: -1 | 1,
) {
  const source = sections.findIndex((section) => section.id === id)
  if (source < 0 || sections.length < 2) return [...sections]
  const destination = Math.max(0, Math.min(sections.length - 1, source + delta))
  if (destination === source) return [...sections]
  const result = [...sections]
  const [section] = result.splice(source, 1)
  if (section) result.splice(destination, 0, section)
  return result
}

export function removePullRequestSection(sections: readonly PullRequestSection[], id: string) {
  if (sections.length <= 1) throw new Error("At least one section is required")
  return sections.filter((section) => section.id !== id)
}
