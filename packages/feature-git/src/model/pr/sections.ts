import { PULL_REQUEST_COLUMNS, PULL_REQUEST_SORTS } from "./config"
import { normalizePullRequestQuery } from "./query"
import type { PullRequestColumn, PullRequestSection, PullRequestSort } from "./types"
import {
  createRemoteSectionId,
  moveRemoteSection,
  normalizeRemoteColumns,
  orderRemoteItems,
  parseRemoteSectionOptions,
  removeRemoteSection,
} from "../remote-sections"

export function createPullRequestSectionId(title: string, sections: readonly PullRequestSection[]) {
  return createRemoteSectionId(title, sections)
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
  return normalizeRemoteColumns(columns, PULL_REQUEST_COLUMNS)
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
  return parseRemoteSectionOptions(
    { columns, sort, limit },
    PULL_REQUEST_COLUMNS,
    PULL_REQUEST_SORTS,
  )
}

export function orderPullRequestItems(
  items: readonly import("./types").PullRequestSummary[],
  sort: PullRequestSort = "updated-desc",
) {
  return orderRemoteItems(items, sort)
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
  return moveRemoteSection(sections, id, delta)
}

export function removePullRequestSection(sections: readonly PullRequestSection[], id: string) {
  return removeRemoteSection(sections, id)
}
