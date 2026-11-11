import type { HttpProjectRequestItem, HttpRequestDefinition } from "./types"

export function httpChainingRequests(
  items: HttpProjectRequestItem[],
  drafts: HttpRequestDefinition[] = [],
) {
  const requests = new Map(items.map((item) => [item.request.id, item]))
  for (const request of drafts)
    requests.set(request.id, {
      filePath: request.source.kind === "file" ? request.source.path : "",
      request,
    })
  return [...requests.values()]
}

export function resolveHttpChainRequest(
  items: HttpProjectRequestItem[],
  selector: string,
  owner?: HttpRequestDefinition,
) {
  const exact = items.find((item) => item.request.id === selector)
  if (exact) return exact
  const matches = items.filter(
    ({ request }) =>
      request.name === selector ||
      (request.source.kind === "file" && request.source.blockId.split("#").at(-1) === selector),
  )
  const local =
    owner?.source.kind === "file"
      ? matches.filter(
          (item) => item.filePath === (owner.source.kind === "file" ? owner.source.path : ""),
        )
      : []
  const candidates = local.length ? local : matches
  if (candidates.length > 1) throw new Error("Dependência ambígua. Escolha o request pela lista.")
  return candidates[0]
}

export function planHttpRequestChain(items: HttpProjectRequestItem[], selector?: string) {
  const selected = selector ? resolveHttpChainRequest(items, selector) : undefined
  if (selector && !selected) throw new Error(`Request não encontrado: ${selector}.`)
  const included = new Set<string>()
  const visiting = new Set<string>()
  const ordered: HttpProjectRequestItem[] = []
  const visit = (item: HttpProjectRequestItem) => {
    const { request } = item
    if (included.has(request.id)) return
    if (visiting.has(request.id))
      throw new Error(`Ciclo de dependência detectado em ${request.name}.`)
    visiting.add(request.id)
    const dependency = request.chain?.dependsOn
    if (dependency) {
      const parent = resolveHttpChainRequest(items, dependency, request)
      if (!parent) throw new Error(`Dependência não encontrada: ${dependency}.`)
      visit(parent)
    }
    visiting.delete(request.id)
    included.add(request.id)
    ordered.push(item)
  }
  for (const target of selected ? [selected] : items) visit(target)
  return ordered
}

export function httpChainPlan(request: HttpRequestDefinition, items: HttpProjectRequestItem[]) {
  try {
    return {
      items: planHttpRequestChain(httpChainingRequests(items, [request]), request.id),
      error: null,
    }
  } catch (error) {
    return { items: [], error: error instanceof Error ? error.message : String(error) }
  }
}
