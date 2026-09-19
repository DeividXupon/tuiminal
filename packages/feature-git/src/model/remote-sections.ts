const SECTION_ID_PATTERN = /[^a-z0-9]+/g

type Identified = { id: string }
type DatedItem = { updatedAt: string; identity: { number: number } }

export type RemoteSectionSort = "updated-desc" | "updated-asc" | "number-desc" | "number-asc"

/** Pure section transitions shared by PR and Issue selectors; query policy stays local. */
export function createRemoteSectionId(title: string, sections: readonly Identified[]) {
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

export function normalizeRemoteColumns<Column extends string>(
  columns: readonly string[],
  allowed: readonly Column[],
) {
  return [...new Set(columns)].filter((column): column is Column =>
    allowed.includes(column as Column),
  )
}

export function parseRemoteSectionOptions<Column extends string, Sort extends string>(
  values: { columns: string; sort: string; limit: string },
  allowedColumns: readonly Column[],
  allowedSorts: readonly Sort[],
) {
  const columns = normalizeRemoteColumns(
    values.columns.split(/[\s,]+/).filter(Boolean),
    allowedColumns,
  )
  const sort = allowedSorts.includes(values.sort as Sort) ? (values.sort as Sort) : null
  const limit = Number(values.limit)
  if (!columns.length) throw new Error("At least one valid column is required")
  if (!sort) throw new Error("Invalid section sort")
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Section limit must be between 1 and 100")
  }
  return { columns, sort, limit }
}

export function orderRemoteItems<Item extends DatedItem>(
  items: readonly Item[],
  sort: RemoteSectionSort = "updated-desc",
) {
  return [...items].sort((left, right) => {
    if (sort === "updated-asc") return left.updatedAt.localeCompare(right.updatedAt)
    if (sort === "number-desc") return right.identity.number - left.identity.number
    if (sort === "number-asc") return left.identity.number - right.identity.number
    return right.updatedAt.localeCompare(left.updatedAt)
  })
}

export function moveRemoteSection<Section extends Identified>(
  sections: readonly Section[],
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

export function removeRemoteSection<Section extends Identified>(
  sections: readonly Section[],
  id: string,
) {
  if (sections.length <= 1) throw new Error("At least one section is required")
  return sections.filter((section) => section.id !== id)
}
