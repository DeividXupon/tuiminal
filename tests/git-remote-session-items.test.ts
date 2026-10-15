import { expect, test } from "bun:test"
import {
  aggregateRemotePages,
  mergeRemoteItems,
} from "../packages/feature-git/src/services/remote-session-items"

const item = (id: string, updatedAt: string) => ({ id, updatedAt })

test("remote page aggregation deduplicates by identity and preserves unknown totals", () => {
  const pages = [
    {
      items: [item("one", "2025-01-01"), item("two", "2025-02-01")],
      totalCount: 3,
      partial: false,
      hasNextPage: true,
    },
    {
      items: [item("one", "2026-01-01")],
      totalCount: null,
      partial: false,
      hasNextPage: false,
    },
  ]
  const result = aggregateRemotePages(pages, (entry) => entry.id)
  expect(result).toEqual({
    items: [item("one", "2026-01-01"), item("two", "2025-02-01")],
    totalCount: null,
    partial: true,
  })
  expect(pages[0]?.items[0]?.updatedAt).toBe("2025-01-01")
})

test("remote item merge replaces duplicate identities and sorts a new array", () => {
  const current = [item("one", "2025-01-01"), item("two", "2025-02-01")]
  const merged = mergeRemoteItems(current, [item("one", "2026-01-01")], (entry) => entry.id)
  expect(merged).toEqual([item("one", "2026-01-01"), item("two", "2025-02-01")])
  expect(current[0]?.updatedAt).toBe("2025-01-01")
})
