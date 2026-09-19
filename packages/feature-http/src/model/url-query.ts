import type { HttpKeyValue } from "./types"

function parts(source: string) {
  const hash = source.indexOf("#")
  const beforeHash = hash < 0 ? source : source.slice(0, hash)
  const question = beforeHash.indexOf("?")
  return {
    base: question < 0 ? beforeHash : beforeHash.slice(0, question),
    query: question < 0 ? "" : beforeHash.slice(question + 1),
    fragment: hash < 0 ? "" : source.slice(hash),
  }
}

export function urlQueryEntryPrefix(requestId: string) {
  return `${requestId}-url-query-`
}

export function syncHttpUrlQuery(source: string, entries: HttpKeyValue[], requestId: string) {
  const prefix = urlQueryEntryPrefix(requestId)
  const retained = entries.filter((entry) => !entry.id.startsWith(prefix))
  const parsed = [...new URLSearchParams(parts(source).query)].map(([name, value], index) => ({
    id: `${prefix}${index}`,
    enabled: true,
    name,
    value,
    sensitivity: "normal" as const,
  }))
  return [...parsed, ...retained]
}

export function applyHttpUrlQueryEdit(source: string, entries: HttpKeyValue[], requestId: string) {
  const prefix = urlQueryEntryPrefix(requestId)
  const query = new URLSearchParams()
  const retained: HttpKeyValue[] = []
  for (const entry of entries) {
    if (!entry.id.startsWith(prefix)) {
      retained.push(entry)
    } else if (entry.enabled) {
      query.append(entry.name, entry.value)
    } else {
      retained.push({ ...entry, id: `${requestId}-query-${crypto.randomUUID()}` })
    }
  }
  const { base, fragment } = parts(source)
  const nextUrl = `${base}${query.size ? `?${query.toString()}` : ""}${fragment}`
  return { url: nextUrl, query: syncHttpUrlQuery(nextUrl, retained, requestId) }
}

export function urlVariableCompletion(source: string, cursor: number, names: readonly string[]) {
  const before = source.slice(0, cursor)
  const match = before.match(/\{\{?([\w$.-]*)$/u)
  if (!match) return null
  const prefix = match[1] ?? ""
  const start = cursor - match[0].length
  const suggestions = names
    .filter((name) => name.toLowerCase().startsWith(prefix.toLowerCase()))
    .slice(0, 4)
  return suggestions.length ? { start, end: cursor, suggestions } : null
}

export function applyUrlVariableCompletion(
  source: string,
  start: number,
  end: number,
  name: string,
) {
  let suffix = end
  while (suffix < source.length && suffix - end < 2 && source[suffix] === "}") suffix += 1
  return `${source.slice(0, start)}{{${name}}}${source.slice(suffix)}`
}
