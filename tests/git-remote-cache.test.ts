import { expect, test } from "bun:test"
import { rememberRemoteCacheEntry } from "../packages/feature-git/src/services/remote-cache"

test("remote cache updates recency and evicts only its oldest entry", () => {
  const cache = new Map<string, number>()
  rememberRemoteCacheEntry(cache, "first", 1, 2)
  rememberRemoteCacheEntry(cache, "second", 2, 2)
  rememberRemoteCacheEntry(cache, "first", 3, 2)
  rememberRemoteCacheEntry(cache, "third", 4, 2)
  expect([...cache]).toEqual([
    ["first", 3],
    ["third", 4],
  ])
})
