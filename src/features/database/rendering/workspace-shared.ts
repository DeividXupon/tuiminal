import type { DatabaseConnectionProfile, DatabaseTable } from "../model/types"
import { padDisplayEnd, truncateDisplay } from "../../../shared/i18n/index"

import { CELL_WIDTH } from "./constants"

export function fitCell(value: unknown, width = CELL_WIDTH) {
  let text: string
  if (value === null || value === undefined) {
    text = "NULL"
  } else if (typeof value === "object") {
    try {
      text = JSON.stringify(value)
    } catch {
      text = String(value)
    }
  } else {
    text = String(value)
  }
  text = text.replace(/[\r\n\t]+/g, " ")
  return padDisplayEnd(truncateDisplay(text, width - 1), width)
}

export function shorten(value: string, length: number) {
  return truncateDisplay(value, length)
}

export function detailValue(value: unknown) {
  if (value === null || value === undefined) return "NULL"
  if (typeof value !== "object") return String(value).replace(/[\r\n\t]+/g, " ")
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export function queryPlaceholder(profile: DatabaseConnectionProfile) {
  if (profile.driver === "postgres") {
    return "-- PostgreSQL\nSELECT *\nFROM public.table_name\nLIMIT 100;"
  }
  if (profile.driver === "sqlite") {
    return "-- SQLite\nSELECT *\nFROM table_name\nLIMIT 100;"
  }
  return "-- MySQL\nSELECT *\nFROM table_name\nLIMIT 100;"
}

export function suggestedQueryName(sql: string, selectedTable: DatabaseTable | null) {
  const relation = sql.match(/\bfrom\s+([`"\w.]+)/i)?.[1]?.replace(/[`"]+/g, "")
  if (relation) return `Consulta ${relation}`
  const normalized = sql
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("--"))
  if (normalized) return truncateDisplay(normalized.replace(/\s+/g, " "), 52)
  if (selectedTable) return `Query ${selectedTable.name}`
  return "Nova query"
}
