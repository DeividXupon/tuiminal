import { record } from "./shared"

function descriptionText(value: unknown): string | undefined {
  if (typeof value === "string") return value
  const content = record(value)?.content
  return typeof content === "string" ? content : undefined
}

export function postmanRequestDescription(item: Record<string, unknown>) {
  return (
    descriptionText(record(item.request)?.description) ?? descriptionText(item.description) ?? ""
  )
}
