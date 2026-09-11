import { directionalShortcutDirection } from "../../../shared/ui/directional-shortcut"
import type { HttpBodyKind } from "./types"

export const HTTP_BODY_KINDS: readonly HttpBodyKind[] = [
  "none",
  "json",
  "text",
  "xml",
  "form",
  "multipart",
  "file",
]

export function httpBodyKindCycleDirection(key: {
  name: string
  ctrl?: boolean
  shift?: boolean
  option?: boolean
  meta?: boolean
}) {
  return directionalShortcutDirection(key, "nested")
}

export function nextHttpBodyKind(current: HttpBodyKind, direction: -1 | 1): HttpBodyKind {
  const index = HTTP_BODY_KINDS.indexOf(current)
  const next = (index + direction + HTTP_BODY_KINDS.length) % HTTP_BODY_KINDS.length
  return HTTP_BODY_KINDS[next] ?? "none"
}
