type PaginatedSectionCacheEntry = {
  root: string
  section: { id: string; query: string }
  profile: { sections: readonly { id: string; query: string }[] }
  pageDepth: number
}

export function cachedSectionPageDepth(
  entries: Iterable<PaginatedSectionCacheEntry>,
  root: string,
  sectionId: string | undefined,
  queryOverride: string | null,
) {
  let depth = 1
  for (const entry of entries) {
    const configuredQuery = entry.profile.sections.find(
      (section) => section.id === sectionId,
    )?.query
    if (
      entry.root === root &&
      entry.section.id === sectionId &&
      entry.section.query === (queryOverride ?? configuredQuery)
    ) {
      depth = Math.max(depth, entry.pageDepth)
    }
  }
  return depth
}
