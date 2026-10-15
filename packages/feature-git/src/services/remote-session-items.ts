type UpdatedItem = { updatedAt: string }
type RemotePage<Item> = {
  items: readonly Item[]
  totalCount: number | null
  partial: boolean
  hasNextPage: boolean
}

function newestFirst<Item extends UpdatedItem>(items: Iterable<Item>) {
  return [...items].sort((left, right) => {
    if (left.updatedAt === right.updatedAt) return 0
    return left.updatedAt > right.updatedAt ? -1 : 1
  })
}

/** Pure page aggregation shared by PR and Issue sessions; I/O ownership stays separate. */
export function aggregateRemotePages<Item extends UpdatedItem>(
  pages: readonly RemotePage<Item>[],
  identityKey: (item: Item) => string,
) {
  const items = new Map<string, Item>()
  let totalCount = 0
  let totalKnown = true
  let partial = false
  for (const page of pages) {
    partial ||= page.partial || page.hasNextPage
    if (page.totalCount === null) totalKnown = false
    else totalCount += page.totalCount
    for (const item of page.items) items.set(identityKey(item), item)
  }
  return {
    items: newestFirst(items.values()),
    totalCount: totalKnown ? totalCount : null,
    partial,
  }
}

export function mergeRemoteItems<Item extends UpdatedItem>(
  current: readonly Item[],
  additions: readonly Item[],
  identityKey: (item: Item) => string,
) {
  const items = new Map<string, Item>()
  for (const item of current) items.set(identityKey(item), item)
  for (const item of additions) items.set(identityKey(item), item)
  return newestFirst(items.values())
}
