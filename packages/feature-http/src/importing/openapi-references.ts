import { record, text } from "./shared"

export type OpenApiRecordResolver = (
  value: unknown,
  label: string,
) => Record<string, unknown> | null

function pointerToken(value: string) {
  try {
    return decodeURIComponent(value).replaceAll("~1", "/").replaceAll("~0", "~")
  } catch {
    return value.replaceAll("~1", "/").replaceAll("~0", "~")
  }
}

function localPointer(document: Record<string, unknown>, reference: string) {
  if (!reference.startsWith("#/")) return undefined
  let current: unknown = document
  for (const token of reference.slice(2).split("/").map(pointerToken)) {
    current = record(current)?.[token]
    if (current === undefined) return undefined
  }
  return current
}

export function createOpenApiRecordResolver(
  document: Record<string, unknown>,
  warnings: string[],
): OpenApiRecordResolver {
  const reported = new Set<string>()
  const warn = (message: string) => {
    if (!reported.has(message)) warnings.push(message)
    reported.add(message)
  }

  const resolveRecord = (
    value: unknown,
    label: string,
    references = new Set<string>(),
  ): Record<string, unknown> | null => {
    const source = record(value)
    if (!source) return null
    const reference = text(source.$ref)
    if (!reference) return source
    if (!reference.startsWith("#/")) {
      warn(`${label}: referência externa não suportada.`)
      return null
    }
    if (references.has(reference) || references.size >= 24) {
      warn(`${label}: referência local circular ou profunda demais (${reference}).`)
      return null
    }
    const target = localPointer(document, reference)
    if (target === undefined) {
      warn(`${label}: referência local não encontrada (${reference}).`)
      return null
    }
    const next = new Set(references)
    next.add(reference)
    return resolveRecord(target, label, next)
  }

  return resolveRecord
}
