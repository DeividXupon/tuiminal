import { ISSUE_COLUMNS, ISSUE_SORTS } from "./config"
import { normalizeIssueQuery } from "./query"
import type { IssueColumn, IssueSection, IssueSort, IssueSummary } from "./types"
import {
  createRemoteSectionId,
  moveRemoteSection,
  normalizeRemoteColumns,
  orderRemoteItems,
  parseRemoteSectionOptions,
  removeRemoteSection,
} from "../remote-sections"

export function createIssueSectionId(title: string, sections: readonly IssueSection[]) {
  return createRemoteSectionId(title, sections)
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
  return normalizeRemoteColumns(columns, ISSUE_COLUMNS)
}

export function parseIssueSectionOptions({
  columns,
  sort,
  limit,
}: Record<"columns" | "sort" | "limit", string>) {
  return parseRemoteSectionOptions({ columns, sort, limit }, ISSUE_COLUMNS, ISSUE_SORTS)
}

export function orderIssueItems(items: readonly IssueSummary[], sort: IssueSort = "updated-desc") {
  return orderRemoteItems(items, sort)
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
  return moveRemoteSection(sections, id, delta)
}

export function removeIssueSection(sections: readonly IssueSection[], id: string) {
  return removeRemoteSection(sections, id)
}
