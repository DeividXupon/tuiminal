import type { DatabaseQueryHistoryEntry, DatabaseQueryHistoryParameter } from "../model/types"
import { translateUi, truncateDisplay } from "../../../shared/i18n/index"
import type { SensitiveVisibility } from "../../../shared/security/sensitive-data"

export function historyDuration(durationMs: number) {
  return durationMs >= 1_000
    ? `${(durationMs / 1_000).toFixed(2)} s`
    : `${durationMs.toFixed(1)} ms`
}

export function historyAmount(entry: DatabaseQueryHistoryEntry) {
  if (entry.status === "error") return translateUi("ERRO")
  if (entry.affectedRows !== null) {
    return `${entry.affectedRows} ${translateUi("linha(s) afetada(s)")}`
  }
  return `${entry.rowCount ?? 0} ${translateUi("linha(s)")}`
}

export function historySqlPreview(sql: string, width: number) {
  return truncateDisplay(sql.replace(/\s+/g, " ").trim(), width)
}

export function historyParameterText(
  parameter: DatabaseQueryHistoryParameter,
  sensitiveVisibility: SensitiveVisibility,
) {
  let value = parameter.value
  if (parameter.masked) {
    const revealable = parameter.revealedValue !== undefined
    if (revealable && sensitiveVisibility === "visible") {
      value = parameter.revealedValue ?? parameter.value
    } else if (revealable && sensitiveVisibility === "confirm") {
      value = translateUi("<confirmar [V]>")
    } else {
      value = translateUi(revealable ? "<mascarada [V]>" : "<mascarada>")
    }
  }
  return `$${parameter.position} ${parameter.name} = ${value}`
}

export function historySqlText(entry: DatabaseQueryHistoryEntry | null) {
  return entry?.sql || translateUi("SQL disponível apenas na sessão original.")
}

export function historyRerunUnavailableReason(entry: DatabaseQueryHistoryEntry) {
  if (entry.storage === "metadata-only" && !entry.sql)
    return "SQL disponível apenas na sessão original."
  return entry.rerunnable
    ? "Reexecução indisponível neste modo ou porque a conexão original mudou."
    : "Reexecução desativada: alterações da grade exigem nova revisão."
}
