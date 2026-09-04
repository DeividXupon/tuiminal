import { ShortcutText } from "../../../shared/ui/ShortcutText"
import type { BoxRenderable, ScrollBoxRenderable } from "@opentui/core"
import { useKeyboard, useTerminalDimensions } from "@opentui/react"
import { Button } from "@tuiparts/react/button"
import { useEffect, useMemo, useRef, useState } from "react"
import type { DatabaseQueryHistoryEntry, DatabaseQueryHistoryParameter } from "../model/types"
import {
  DATABASE_QUERY_HISTORY_READ_LIMIT,
  databaseQueryHistoryEntryIsRead,
  databaseDriverLabel,
  filterDatabaseQueryHistory,
} from "../services/database"
import { formatUiDateTime, translateUi, truncateDisplay } from "../../../shared/i18n/index"
import {
  nextSensitiveVisibility,
  type SensitiveVisibility,
} from "../../../shared/security/sensitive-data"
import { COLORS } from "../../../core/settings/theme"
import { InlineButton } from "../../../shared/ui/InlineButton"

function historyDuration(durationMs: number) {
  return durationMs >= 1_000
    ? `${(durationMs / 1_000).toFixed(2)} s`
    : `${durationMs.toFixed(1)} ms`
}

function historyAmount(entry: DatabaseQueryHistoryEntry) {
  if (entry.status === "error") return translateUi("ERRO")
  if (entry.affectedRows !== null) {
    return `${entry.affectedRows} ${translateUi("linha(s) afetada(s)")}`
  }
  return `${entry.rowCount ?? 0} ${translateUi("linha(s)")}`
}

function historySqlPreview(sql: string, width: number) {
  return truncateDisplay(sql.replace(/\s+/g, " ").trim(), width)
}

function historyParameterText(
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

export function DatabaseQueryHistoryModal({
  open,
  entries,
  canRerun,
  onClose,
  onRerun,
}: {
  open: boolean
  entries: DatabaseQueryHistoryEntry[]
  canRerun: (entry: DatabaseQueryHistoryEntry) => boolean
  onClose: () => void
  onRerun: (entry: DatabaseQueryHistoryEntry) => void
}) {
  const terminal = useTerminalDimensions()
  const modalRef = useRef<BoxRenderable | null>(null)
  const listRef = useRef<ScrollBoxRenderable | null>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [showReads, setShowReads] = useState(true)
  const [sensitiveState, setSensitiveState] = useState<{
    entryId: string | null
    visibility: SensitiveVisibility
  }>({ entryId: null, visibility: "hidden" })
  const visibleEntries = useMemo(
    () => filterDatabaseQueryHistory(entries, showReads),
    [entries, showReads],
  )
  const selectedEntry = visibleEntries[selectedIndex] ?? null
  const sensitiveVisibility =
    sensitiveState.entryId === selectedEntry?.id ? sensitiveState.visibility : "hidden"
  const hasRevealableSensitive =
    selectedEntry?.parameterPreview.some(
      (parameter) => parameter.masked && parameter.revealedValue !== undefined,
    ) ?? false
  const selectedCanRerun = selectedEntry ? canRerun(selectedEntry) : false
  const { readCount, changeCount } = useMemo(() => {
    const reads = entries.filter(databaseQueryHistoryEntryIsRead).length
    return { readCount: reads, changeCount: entries.length - reads }
  }, [entries])
  const width = Math.max(1, Math.min(112, terminal.width - 2))
  const height = Math.max(1, Math.min(30, terminal.height - 1))
  const compact = width < 72 || height < 22
  const retentionSummary = compact
    ? `${translateUi("Leituras")}: ${readCount}/${DATABASE_QUERY_HISTORY_READ_LIMIT} · ${translateUi("Alterações em 6 meses")}: ${changeCount}`
    : `${translateUi("Leituras recentes")}: ${readCount}/${DATABASE_QUERY_HISTORY_READ_LIMIT} · ${translateUi("Alterações nos últimos 6 meses")}: ${changeCount}`
  const parameterSpace = Math.min(selectedEntry?.parameterPreview.length ?? 0, compact ? 2 : 4)
  const listHeight = Math.max(
    4,
    Math.floor((height - 9) * (compact ? 0.52 : 0.58)) - parameterSpace,
  )
  const rowWidth = Math.max(12, width - 8)
  const parameterLimit = compact ? 2 : 4
  const visibleParameters = selectedEntry?.parameterPreview.slice(0, parameterLimit) ?? []
  const hiddenParameterCount = Math.max(
    0,
    (selectedEntry?.parameterPreview.length ?? 0) - visibleParameters.length,
  )
  const sqlLines = useMemo(
    () =>
      (selectedEntry?.sql.split("\n") ?? []).slice(
        0,
        compact ? 2 : selectedEntry?.parameterPreview.length ? 4 : 6,
      ),
    [compact, selectedEntry?.parameterPreview.length, selectedEntry?.sql],
  )

  useEffect(() => {
    if (!open) return
    setSelectedIndex((current) => Math.min(current, Math.max(0, visibleEntries.length - 1)))
    const timeout = setTimeout(() => modalRef.current?.focus(), 0)
    return () => clearTimeout(timeout)
  }, [open, visibleEntries.length])

  useEffect(() => {
    setSensitiveState({
      entryId: open ? (selectedEntry?.id ?? null) : null,
      visibility: "hidden",
    })
  }, [open, selectedEntry?.id])

  useEffect(() => {
    if (!open || sensitiveVisibility !== "confirm" || !selectedEntry) return
    const entryId = selectedEntry.id
    const timeout = setTimeout(() => {
      setSensitiveState((current) =>
        current.entryId === entryId && current.visibility === "confirm"
          ? { entryId, visibility: "hidden" }
          : current,
      )
    }, 8_000)
    return () => clearTimeout(timeout)
  }, [open, selectedEntry, sensitiveVisibility])

  useEffect(() => {
    if (!open || !visibleEntries.length) return
    listRef.current?.scrollChildIntoView(`database-query-history-entry-${selectedIndex}`)
  }, [open, selectedIndex, visibleEntries.length])

  const toggleSensitiveData = () => {
    if (!selectedEntry || !hasRevealableSensitive) return
    setSensitiveState({
      entryId: selectedEntry.id,
      visibility: nextSensitiveVisibility(sensitiveVisibility),
    })
  }

  const toggleReads = () => {
    setSelectedIndex(0)
    setShowReads((current) => !current)
  }

  useKeyboard((key) => {
    if (!open) return
    key.preventDefault()
    key.stopPropagation()
    if (key.name === "escape") {
      onClose()
      return
    }
    if (key.name === "v" && selectedEntry && hasRevealableSensitive) {
      toggleSensitiveData()
      return
    }
    if (key.name === "s") {
      toggleReads()
      return
    }
    if (key.name === "up" || key.name === "k") {
      setSelectedIndex((current) => Math.max(0, current - 1))
      return
    }
    if (key.name === "down" || key.name === "j") {
      setSelectedIndex((current) => Math.min(Math.max(0, visibleEntries.length - 1), current + 1))
      return
    }
    if ((key.name === "enter" || key.name === "return") && selectedEntry && selectedCanRerun) {
      onRerun(selectedEntry)
    }
  })

  if (!open) return null

  return (
    <>
      <Button
        onPress={onClose}
        position="absolute"
        top={0}
        left={0}
        width="100%"
        height="100%"
        zIndex={950}
        backgroundColor="#030509"
        opacity={0.9}
      />
      <box
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          zIndex: 951,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <box
          ref={modalRef}
          id="database-query-history-modal"
          focusable
          style={{
            width,
            height,
            border: true,
            borderStyle: "rounded",
            borderColor: COLORS.database,
            backgroundColor: COLORS.canvas,
            paddingLeft: compact ? 1 : 2,
            paddingRight: compact ? 1 : 2,
          }}
        >
          <box
            style={{
              height: 3,
              flexShrink: 0,
              border: ["bottom"],
              borderColor: COLORS.border,
            }}
          >
            <box
              style={{
                height: 1,
                flexShrink: 0,
                flexDirection: "row",
                justifyContent: "space-between",
              }}
            >
              <text content={`◆ ${translateUi("HISTÓRICO SQL")}`} style={{ fg: COLORS.database }} />
              <text
                content={`${translateUi("Total")}: ${entries.length}`}
                style={{ fg: COLORS.muted }}
              />
            </box>
            <text
              content={truncateDisplay(retentionSummary, Math.max(8, width - 6))}
              style={{ fg: COLORS.muted }}
            />
          </box>

          {visibleEntries.length ? (
            <>
              <scrollbox
                ref={listRef}
                scrollY
                viewportCulling
                style={{ height: listHeight, flexShrink: 0, width: "100%" }}
                verticalScrollbarOptions={{
                  trackOptions: {
                    backgroundColor: COLORS.panel,
                    foregroundColor: COLORS.border,
                  },
                }}
              >
                {visibleEntries.map((entry, index) => {
                  const selected = index === selectedIndex
                  const successful = entry.status === "success"
                  return (
                    <Button
                      key={entry.id}
                      id={`database-query-history-entry-${index}`}
                      onPress={() => setSelectedIndex(index)}
                      height={2}
                      width="100%"
                      flexShrink={0}
                    >
                      {(state) => (
                        <box
                          style={{
                            height: 2,
                            width: "100%",
                            flexShrink: 0,
                            backgroundColor:
                              selected || state.focused
                                ? COLORS.panelRaised
                                : index % 2 === 0
                                  ? COLORS.panel
                                  : COLORS.panelAlt,
                            paddingLeft: 1,
                            paddingRight: 1,
                          }}
                        >
                          <box
                            style={{
                              height: 1,
                              flexShrink: 0,
                              flexDirection: "row",
                              justifyContent: "space-between",
                            }}
                          >
                            <text
                              content={`${selected ? "›" : " "} ${successful ? "✓" : "✕"} ${entry.command} · ${entry.connectionName}`}
                              style={{ fg: successful ? COLORS.success : COLORS.danger }}
                            />
                            <text
                              content={`${historyAmount(entry)} · ${historyDuration(entry.durationMs)}`}
                              style={{ fg: COLORS.muted }}
                            />
                          </box>
                          <text
                            content={`  ${historySqlPreview(entry.sql, rowWidth)}`}
                            style={{ fg: selected ? COLORS.text : COLORS.muted }}
                          />
                        </box>
                      )}
                    </Button>
                  )
                })}
              </scrollbox>

              <box
                style={{
                  flexGrow: 1,
                  border: ["top"],
                  borderColor: COLORS.border,
                  backgroundColor: COLORS.panel,
                  paddingLeft: 1,
                  paddingRight: 1,
                }}
              >
                {selectedEntry ? (
                  <>
                    <box
                      style={{
                        height: 1,
                        flexShrink: 0,
                        flexDirection: "row",
                        justifyContent: "space-between",
                      }}
                    >
                      <text
                        content={`${selectedEntry.status === "success" ? "✓" : "✕"} ${selectedEntry.command} · ${historyAmount(selectedEntry)}`}
                        style={{
                          fg: selectedEntry.status === "success" ? COLORS.success : COLORS.danger,
                        }}
                      />
                      <text
                        content={`${formatUiDateTime(selectedEntry.executedAt, {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })} · ${historyDuration(selectedEntry.durationMs)}`}
                        style={{ fg: COLORS.muted }}
                      />
                    </box>
                    <text
                      content={`${selectedEntry.connectionName} · ${databaseDriverLabel(selectedEntry.driver)}`}
                      style={{ height: 1, flexShrink: 0, fg: COLORS.database }}
                    />
                    <text
                      content={sqlLines
                        .map((line) => truncateDisplay(line || " ", Math.max(8, width - 8)))
                        .join("\n")}
                      style={{ height: sqlLines.length, flexShrink: 0, fg: COLORS.text }}
                    />
                    {visibleParameters.length ? (
                      <>
                        <text
                          content={`${translateUi("PARÂMETROS")} · ${selectedEntry.parameterPreview.length}`}
                          style={{ height: 1, flexShrink: 0, fg: COLORS.database }}
                        />
                        {visibleParameters.map((parameter) => (
                          <text
                            key={`${parameter.position}-${parameter.name}`}
                            content={truncateDisplay(
                              historyParameterText(parameter, sensitiveVisibility),
                              Math.max(8, width - 8),
                            )}
                            style={{ height: 1, flexShrink: 0, fg: COLORS.text }}
                          />
                        ))}
                        {hiddenParameterCount ? (
                          <text
                            content={translateUi(`… +${hiddenParameterCount} parâmetro(s)`)}
                            style={{ height: 1, flexShrink: 0, fg: COLORS.muted }}
                          />
                        ) : null}
                      </>
                    ) : null}
                    {selectedEntry.error ? (
                      <text
                        content={truncateDisplay(
                          `${translateUi("Erro")}: ${selectedEntry.error}`,
                          Math.max(8, width - 8),
                        )}
                        style={{ height: 1, flexShrink: 0, fg: COLORS.danger }}
                      />
                    ) : null}
                    {!selectedCanRerun ? (
                      <text
                        content={translateUi(
                          selectedEntry.rerunnable
                            ? "Reexecução indisponível neste modo ou porque a conexão original mudou."
                            : "Reexecução desativada: alterações da grade exigem nova revisão.",
                        )}
                        style={{ height: 1, flexShrink: 0, fg: COLORS.warning }}
                      />
                    ) : null}
                  </>
                ) : null}
              </box>
            </>
          ) : (
            <box style={{ flexGrow: 1, alignItems: "center", justifyContent: "center" }}>
              <text
                content={translateUi(
                  entries.length
                    ? "SELECT ocultos · nenhuma alteração disponível."
                    : "Nenhuma consulta foi executada ainda.",
                )}
                style={{ fg: COLORS.muted }}
              />
            </box>
          )}

          <box
            style={{
              height: 1,
              flexShrink: 0,
              flexDirection: "row",
              justifyContent: "space-between",
              border: ["top"],
              borderColor: COLORS.border,
            }}
          >
            <ShortcutText content="[↑/↓/J/K]" style={{ fg: COLORS.muted }} />
            <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
              <InlineButton
                label={
                  compact
                    ? "[S]"
                    : translateUi(showReads ? "[S] Ocultar SELECT" : "[S] Mostrar SELECT")
                }
                accent={COLORS.database}
                active={!showReads}
                onPress={toggleReads}
              />
              {hasRevealableSensitive ? (
                <InlineButton
                  label={
                    compact
                      ? sensitiveVisibility === "confirm"
                        ? "[V]!"
                        : "[V]"
                      : translateUi(
                          sensitiveVisibility === "confirm"
                            ? "[V] Confirmar exibição"
                            : sensitiveVisibility === "visible"
                              ? "[V] Ocultar sensíveis"
                              : "[V] Revelar sensíveis",
                        )
                  }
                  accent={sensitiveVisibility === "visible" ? COLORS.database : COLORS.danger}
                  active={sensitiveVisibility !== "visible"}
                  onPress={toggleSensitiveData}
                />
              ) : null}
              <InlineButton
                label={compact ? "[Enter]" : translateUi("[Enter] Reexecutar")}
                accent={COLORS.success}
                disabled={!selectedCanRerun}
                onPress={() => {
                  if (selectedEntry && selectedCanRerun) onRerun(selectedEntry)
                }}
              />
              <InlineButton
                label={compact ? "[Esc]" : translateUi("[Esc] Voltar")}
                accent={COLORS.muted}
                onPress={onClose}
              />
            </box>
          </box>
        </box>
      </box>
    </>
  )
}
