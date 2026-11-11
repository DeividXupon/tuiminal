import {
  CONNECTION_TEXT_FIELDS,
  expandConnectionEnvironment,
  hasEnvironmentReference,
} from "../model/connection-environment"
import type { DatabaseConnectionDraft } from "../model/types"

export function connectionEnvironmentNames() {
  return Object.keys(process.env).filter((name) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(name))
}

export function resolveConnectionPassword(value: string) {
  return expandConnectionEnvironment(value, process.env)
}

/** Keep references, never their expanded values, in saved connection metadata. */
export function preserveConnectionReferences(
  draft: DatabaseConnectionDraft,
  normalized: DatabaseConnectionDraft,
) {
  const saved = { ...normalized }
  for (const field of CONNECTION_TEXT_FIELDS) {
    const value = draft[field]
    if (normalized[field] !== undefined && value && hasEnvironmentReference(value)) {
      saved[field] = value
    }
  }
  if (
    normalized.port !== undefined &&
    draft.portExpression &&
    hasEnvironmentReference(draft.portExpression)
  ) {
    saved.portExpression = draft.portExpression
    delete saved.port
  }
  return saved
}
