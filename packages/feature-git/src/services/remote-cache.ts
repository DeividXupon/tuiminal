/** Refresh LRU recency and evict only the oldest entry after the configured bound. */
export function rememberRemoteCacheEntry<Value>(
  cache: Map<string, Value>,
  key: string,
  value: Value,
  limit: number,
) {
  cache.delete(key)
  cache.set(key, value)
  while (cache.size > limit) {
    const oldest = cache.keys().next().value
    if (typeof oldest !== "string") break
    cache.delete(oldest)
  }
}
