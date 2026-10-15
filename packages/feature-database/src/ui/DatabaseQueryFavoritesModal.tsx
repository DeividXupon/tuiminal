import { ShortcutText } from "@xupon/tuiminal-core/ui/ShortcutText"
import type { BoxRenderable, InputRenderable, ScrollBoxRenderable } from "@opentui/core"
import type { ButtonRenderable } from "@tuiparts/core/button"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { Button } from "@tuiparts/react/button"
import { useCallback, useEffect, useRef, useState } from "react"
import type { DatabaseSavedQuery } from "../model/types"

import { formatUiDateTime, translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { ModalSurface } from "@xupon/tuiminal-core/ui/ModalSurface"

export type DatabaseQueryFavoritesMode = "save" | "list" | null

type DatabaseQueryFavoritesModalProps = {
  mode: DatabaseQueryFavoritesMode
  connectionName: string
  availableWidth: number
  queries: DatabaseSavedQuery[]
  defaultName: string
  sql: string
  onClose: () => void
  onSave: (name: string) => void
  onLoad: (query: DatabaseSavedQuery) => void
  onDelete: (queryId: string) => void
}

function queryPreview(sql: string) {
  return sql.replace(/\s+/g, " ").trim()
}

function savedAt(value: string) {
  return formatUiDateTime(value, {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function DatabaseQueryFavoritesModal({
  mode,
  connectionName,
  availableWidth,
  queries,
  defaultName,
  sql,
  onClose,
  onSave,
  onLoad,
  onDelete,
}: DatabaseQueryFavoritesModalProps) {
  const renderer = useRenderer()
  const terminal = useTerminalDimensions()
  const nameRef = useRef<InputRenderable | null>(null)
  const dialogRef = useRef<BoxRenderable | null>(null)
  const nameValueRef = useRef(defaultName)
  const listRef = useRef<ScrollBoxRenderable | null>(null)
  const itemRefs = useRef<Array<ButtonRenderable | null>>([])
  const [name, setName] = useState(defaultName)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [deleteConfirmationId, setDeleteConfirmationId] = useState<string | null>(null)

  const submitSave = useCallback(() => {
    if (!nameValueRef.current.trim()) return
    onSave(nameValueRef.current)
  }, [onSave])

  const requestDelete = useCallback(() => {
    const selected = queries[selectedIndex]
    if (!selected) return
    if (deleteConfirmationId === selected.id) {
      onDelete(selected.id)
      setDeleteConfirmationId(null)
      setSelectedIndex((current) => Math.max(0, Math.min(current, queries.length - 2)))
      return
    }
    setDeleteConfirmationId(selected.id)
  }, [deleteConfirmationId, onDelete, queries, selectedIndex])

  useEffect(() => {
    if (!mode) return
    renderer.currentFocusedRenderable?.blur()
    setDeleteConfirmationId(null)
    if (mode === "save") {
      nameValueRef.current = defaultName
      setName(defaultName)
      const timeout = setTimeout(() => nameRef.current?.focus(), 0)
      return () => clearTimeout(timeout)
    }
    setSelectedIndex(0)
    listRef.current?.scrollTo(0)
    const timeout = setTimeout(() => {
      if (queries.length) itemRefs.current[0]?.focus()
      else dialogRef.current?.focus()
    }, 0)
    return () => clearTimeout(timeout)
  }, [defaultName, mode, queries.length, renderer])

  useEffect(() => {
    if (mode !== "list") return
    const lastIndex = Math.max(0, queries.length - 1)
    if (selectedIndex > lastIndex) {
      setSelectedIndex(lastIndex)
      return
    }
    itemRefs.current[selectedIndex]?.focus()
    listRef.current?.scrollChildIntoView(`database-saved-query-${selectedIndex}`)
  }, [mode, queries.length, selectedIndex])

  useEffect(() => {
    if (!deleteConfirmationId) return
    const timeout = setTimeout(() => setDeleteConfirmationId(null), 5_000)
    return () => clearTimeout(timeout)
  }, [deleteConfirmationId])

  useKeyboard((key) => {
    if (!mode) return
    if (key.name === "escape") {
      key.preventDefault()
      key.stopPropagation()
      onClose()
      return
    }
    if (mode === "save") {
      if (key.ctrl && key.name === "s") {
        key.preventDefault()
        key.stopPropagation()
        submitSave()
      }
      return
    }
    if (key.name === "up" || key.name === "k") {
      key.preventDefault()
      key.stopPropagation()
      setDeleteConfirmationId(null)
      setSelectedIndex((current) => Math.max(0, current - 1))
    } else if (key.name === "down" || key.name === "j") {
      key.preventDefault()
      key.stopPropagation()
      setDeleteConfirmationId(null)
      setSelectedIndex((current) => Math.min(Math.max(0, queries.length - 1), current + 1))
    } else if (key.name === "enter" || key.name === "return") {
      key.preventDefault()
      key.stopPropagation()
      const selected = queries[selectedIndex]
      if (selected) onLoad(selected)
    } else if (key.name === "d" || key.name === "delete") {
      key.preventDefault()
      key.stopPropagation()
      requestDelete()
    }
  })

  if (!mode) return null
  const width = Math.max(1, Math.min(94, availableWidth - 2))
  const height = Math.max(1, Math.min(mode === "save" ? 15 : 24, terminal.height - 4))
  const compact = width < 64
  const previewWidth = Math.max(12, width - 8)
  const selectedQuery = queries[selectedIndex] ?? null

  return (
    <ModalSurface
      id="database-saved-query-modal"
      dialogRef={dialogRef}
      width={width}
      height={height}
      zIndex={970}
      borderColor={COLORS.database}
      onBackdropPress={onClose}
    >
      <box
        style={{
          height: 2,
          flexShrink: 0,
          flexDirection: "row",
          justifyContent: "space-between",
          border: ["bottom"],
          borderColor: COLORS.border,
        }}
      >
        <text
          content={translateUi(mode === "save" ? "★ SALVAR QUERY" : "★ QUERIES FAVORITAS")}
          style={{ fg: COLORS.database }}
        />
        <text
          content={truncateDisplay(connectionName, Math.max(8, Math.floor(width * 0.42)))}
          style={{ fg: COLORS.muted }}
        />
      </box>

      {mode === "save" ? (
        <>
          <text
            content={translateUi("Esta query ficará disponível somente nesta conexão.")}
            style={{ fg: COLORS.muted, marginTop: 1 }}
          />
          <box style={{ height: 1, flexShrink: 0, flexDirection: "row", marginTop: 1 }}>
            <text
              content={translateUi("Nome")}
              style={{ width: 8, flexShrink: 0, fg: COLORS.muted }}
            />
            <input
              ref={nameRef}
              id="database-saved-query-name"
              value={name}
              placeholder={translateUi("Ex.: usuários ativos")}
              width={Math.max(4, width - 14)}
              maxLength={80}
              onMouseDown={() => nameRef.current?.focus()}
              onInput={(value) => {
                nameValueRef.current = value
                setName(value)
              }}
              onSubmit={submitSave}
              style={{
                backgroundColor: COLORS.panelRaised,
                focusedBackgroundColor: COLORS.panelRaised,
                textColor: COLORS.text,
                focusedTextColor: COLORS.text,
                cursorColor: COLORS.database,
                placeholderColor: COLORS.muted,
              }}
            />
          </box>
          <box
            style={{
              minHeight: 3,
              flexShrink: 0,
              marginTop: 1,
              paddingLeft: 1,
              paddingRight: 1,
              backgroundColor: COLORS.panel,
            }}
          >
            <text content="SQL" style={{ fg: COLORS.database }} />
            <text
              content={truncateDisplay(queryPreview(sql), previewWidth)}
              style={{ fg: COLORS.text }}
            />
          </box>
          <box
            style={{
              height: 1,
              flexShrink: 0,
              flexDirection: "row",
              justifyContent: "space-between",
              marginTop: 1,
            }}
          >
            <ShortcutText
              content={translateUi(
                compact
                  ? "[Enter] salvar · [Esc] cancelar"
                  : "[Enter]/[Ctrl+S] salvar · [Esc] cancelar",
              )}
              style={{ fg: COLORS.muted }}
            />
            <InlineButton
              label="[Enter] Salvar"
              accent={COLORS.database}
              disabled={!name.trim()}
              onPress={submitSave}
            />
          </box>
        </>
      ) : queries.length ? (
        <>
          <scrollbox
            ref={listRef}
            id="database-saved-query-list"
            scrollY
            viewportCulling
            style={{ flexGrow: 1, backgroundColor: COLORS.panel }}
            verticalScrollbarOptions={{
              trackOptions: {
                backgroundColor: COLORS.panel,
                foregroundColor: COLORS.border,
              },
            }}
          >
            {queries.map((query, index) => {
              const selected = index === selectedIndex
              const confirmingDelete = deleteConfirmationId === query.id
              return (
                <Button
                  key={query.id}
                  id={`database-saved-query-${index}`}
                  ref={(button) => {
                    itemRefs.current[index] = button
                  }}
                  onPress={() => {
                    setSelectedIndex(index)
                    onLoad(query)
                  }}
                  width="100%"
                  height={3}
                  flexShrink={0}
                >
                  {(state) => (
                    <box
                      style={{
                        height: 3,
                        flexShrink: 0,
                        paddingLeft: 1,
                        paddingRight: 1,
                        backgroundColor:
                          selected || state.focused ? COLORS.panelRaised : COLORS.panel,
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
                        <text
                          content={`${selected ? "›" : " "} ★ ${truncateDisplay(query.name, Math.max(8, previewWidth - 20))}`}
                          style={{ fg: confirmingDelete ? COLORS.danger : COLORS.database }}
                        />
                        <text content={savedAt(query.updatedAt)} style={{ fg: COLORS.muted }} />
                      </box>
                      <ShortcutText
                        highlight={confirmingDelete}
                        content={
                          confirmingDelete
                            ? translateUi("Pressione [D] novamente para excluir")
                            : truncateDisplay(queryPreview(query.sql), previewWidth)
                        }
                        style={{ fg: confirmingDelete ? COLORS.danger : COLORS.muted }}
                      />
                    </box>
                  )}
                </Button>
              )
            })}
          </scrollbox>
          <box
            style={{
              height: 1,
              flexShrink: 0,
              flexDirection: "row",
              justifyContent: "space-between",
            }}
          >
            <ShortcutText
              content={translateUi(
                compact
                  ? "[↑↓] · [Enter] abrir"
                  : "[↑↓] navegar · [Enter] abrir · [D] excluir · [Esc] voltar",
              )}
              style={{ fg: COLORS.muted }}
            />
            <InlineButton
              label={
                deleteConfirmationId === selectedQuery?.id
                  ? compact
                    ? "[D] Confirmar"
                    : "[D] Confirmar exclusão"
                  : "[D] Excluir"
              }
              accent={COLORS.danger}
              disabled={!selectedQuery}
              onPress={requestDelete}
            />
          </box>
        </>
      ) : (
        <box style={{ flexGrow: 1, alignItems: "center", justifyContent: "center" }}>
          <text
            content={translateUi("Nenhuma query favorita nesta conexão.")}
            style={{ fg: COLORS.text }}
          />
          <ShortcutText
            content={translateUi("Use [Ctrl+S] no editor para salvar a primeira.")}
            style={{ fg: COLORS.muted }}
          />
          <InlineButton label="[Esc] Voltar" accent={COLORS.database} onPress={onClose} />
        </box>
      )}
    </ModalSurface>
  )
}
