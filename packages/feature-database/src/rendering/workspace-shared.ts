import { padDisplayEnd, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import type { DatabaseConnectionProfile, DatabaseTable } from "../model/types"
import { tableKey } from "../model/workspace"
import { CELL_WIDTH, TABLE_HISTORY_LIMIT } from "./constants"

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

export function tableHistoryPresentation(
  history: DatabaseTable[],
  selected: DatabaseTable | null,
  areaWidth: number,
  navigationWidth = 12,
) {
  const itemWidth = Math.max(3, Math.min(areaWidth < 72 ? 14 : 18, areaWidth - navigationWidth))
  const visibleCount = Math.max(
    1,
    Math.min(TABLE_HISTORY_LIMIT, Math.floor(Math.max(1, areaWidth - navigationWidth) / itemWidth)),
  )
  const currentIndex = selected
    ? history.findIndex((table) => tableKey(table) === tableKey(selected))
    : -1
  const visibleStart = Math.min(
    Math.max(0, currentIndex - visibleCount + 1),
    Math.max(0, history.length - visibleCount),
  )
  return {
    itemWidth,
    currentIndex,
    visibleStart,
    visible: history.slice(visibleStart, visibleStart + visibleCount),
  }
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
