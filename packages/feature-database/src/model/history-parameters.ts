import type { DatabaseQueryHistoryParameter, DatabaseQueryHistorySessionParameter } from "./types"
import {
  DEFAULT_SENSITIVE_TERMS,
  isSensitiveColumnName,
} from "@xupon/tuiminal-core/security/sensitive-data"

export const DATABASE_QUERY_HISTORY_PARAMETER_LIMIT = 64
export const DATABASE_QUERY_HISTORY_PARAMETER_NAME_LIMIT = 128
export const DATABASE_QUERY_HISTORY_PARAMETER_VALUE_LIMIT = 240
export const DATABASE_QUERY_HISTORY_SENSITIVE_TERMS = DEFAULT_SENSITIVE_TERMS.map((term) =>
  term
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[\s._-]+/g, ""),
)

export function limitQueryHistoryParameterText(value: string, limit: number) {
  const characters = Array.from(value)
  return characters.length <= limit
    ? value
    : `${characters.slice(0, Math.max(1, limit - 1)).join("")}…`
}

export function queryHistoryParameterValue(value: unknown) {
  if (value === null) return "NULL"
  if (value === undefined) return "undefined"
  if (typeof value === "bigint") return `${value}n`
  if (typeof value === "number" && !Number.isFinite(value)) return String(value)
  if (ArrayBuffer.isView(value)) return `${value.constructor.name}(${value.byteLength} bytes)`
  if (value instanceof ArrayBuffer) return `ArrayBuffer(${value.byteLength} bytes)`
  try {
    const serialized = JSON.stringify(value, (_key, nested) =>
      typeof nested === "bigint" ? `${nested}n` : nested,
    )
    return serialized ?? String(value)
  } catch {
    return String(value)
  }
}

export function queryHistoryParameterIsSensitive(name: string) {
  if (isSensitiveColumnName(name)) return true
  const comparableName = name
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[\s._-]+/g, "")
  return DATABASE_QUERY_HISTORY_SENSITIVE_TERMS.some((term) => comparableName.includes(term))
}

export function databaseQueryHistoryParameterPreview(
  parameters: readonly unknown[],
  names: readonly string[],
): DatabaseQueryHistoryParameter[] {
  return parameters.slice(0, DATABASE_QUERY_HISTORY_PARAMETER_LIMIT).map((value, index) => {
    const name = limitQueryHistoryParameterText(
      names[index]?.trim() || `param_${index + 1}`,
      DATABASE_QUERY_HISTORY_PARAMETER_NAME_LIMIT,
    )
    const masked = queryHistoryParameterIsSensitive(name)
    return {
      position: index + 1,
      name,
      value: masked
        ? "<mascarado>"
        : limitQueryHistoryParameterText(
            queryHistoryParameterValue(value),
            DATABASE_QUERY_HISTORY_PARAMETER_VALUE_LIMIT,
          ),
      masked,
    }
  })
}

export function databaseQueryHistorySessionParameterPreview(
  parameters: readonly unknown[],
  preview: readonly DatabaseQueryHistoryParameter[],
): DatabaseQueryHistorySessionParameter[] {
  return preview
    .filter((parameter) => parameter.masked)
    .map((parameter) => ({
      position: parameter.position,
      value: limitQueryHistoryParameterText(
        queryHistoryParameterValue(parameters[parameter.position - 1]),
        DATABASE_QUERY_HISTORY_PARAMETER_VALUE_LIMIT,
      ),
    }))
}

export function normalizeQueryHistoryParameterPreview(
  value: unknown,
): DatabaseQueryHistoryParameter[] {
  if (!Array.isArray(value)) return []
  return value
    .slice(0, DATABASE_QUERY_HISTORY_PARAMETER_LIMIT)
    .map((item, index): DatabaseQueryHistoryParameter | null => {
      if (!item || typeof item !== "object") return null
      const candidate = item as Partial<DatabaseQueryHistoryParameter>
      if (typeof candidate.name !== "string" || typeof candidate.value !== "string") {
        return null
      }
      const masked = candidate.masked === true
      return {
        position:
          typeof candidate.position === "number" &&
          Number.isSafeInteger(candidate.position) &&
          candidate.position > 0
            ? candidate.position
            : index + 1,
        name: limitQueryHistoryParameterText(
          candidate.name,
          DATABASE_QUERY_HISTORY_PARAMETER_NAME_LIMIT,
        ),
        value: masked
          ? "<mascarado>"
          : limitQueryHistoryParameterText(
              candidate.value,
              DATABASE_QUERY_HISTORY_PARAMETER_VALUE_LIMIT,
            ),
        masked,
      }
    })
    .filter((item): item is DatabaseQueryHistoryParameter => Boolean(item))
}
