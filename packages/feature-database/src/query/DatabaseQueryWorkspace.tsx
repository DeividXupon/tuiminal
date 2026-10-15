import type { BoxRenderable, ScrollBoxRenderable, TextareaRenderable } from "@opentui/core"
import { RenderableEvents, RGBA } from "@opentui/core"
import { useKeyboard, useTerminalDimensions } from "@opentui/react"
import { Button } from "@tuiparts/react/button"
import { translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import {
  DEFAULT_SENSITIVE_VISIBILITY,
  nextSensitiveVisibility,
  type SensitiveVisibility,
  sensitiveDataIsMasked,
} from "@xupon/tuiminal-core/security/sensitive-data"
import { COLORS, databaseSelectionColors } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { ShortcutText } from "@xupon/tuiminal-core/ui/ShortcutText"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useDatabaseQueryNotifications } from "../hooks/use-database-notifications"
import { useDatabaseQueryWindow } from "../hooks/use-database-query-window"
import { useDatabaseSelectionSweep } from "../hooks/use-database-selection-sweep"
import { useIdentifiedQueryRows } from "../hooks/use-identified-query-rows"
import { useQueryResultHorizontalNavigation } from "../hooks/use-query-result-horizontal-navigation"
import {
  type DatabaseBatchSelectedRow,
  databaseBatchRowIdentity,
  databaseBatchSweepShortcut,
  toggleDatabaseBatchRow,
} from "../model/batch"
import { databaseResultScrollTop } from "../model/layout"
import {
  databaseEditableQueryTable,
  databaseQueryResultColumns,
  databaseQueryResultRowKey,
  databaseQueryTableWriteBlockReason,
} from "../model/query-edit"
import { getSqlCompletionContext, sqlAutocompleteTableKey } from "../model/sql-autocomplete"
import { sqlStatementAtOffset } from "../model/sql-statements"
import {
  resizeSqlEditorRatio,
  type SqlWorkspaceMode,
  sqlSplitEditorHeight,
  toggleSqlWorkspaceMode,
} from "../model/sql-workspace"
import type {
  DatabaseColumn,
  DatabaseConnectionProfile,
  DatabaseQueryResult,
  DatabaseSavedQuery,
  DatabaseTable,
} from "../model/types"
import {
  batchRow,
  changeTableKey,
  type DatabaseGridRow,
  type DatabaseQueryRerunRequest,
  type DatabaseSqlTab,
  rowKeyFingerprint,
  type SqlAutocompleteState,
  type StagedDatabaseChange,
  stageBatchDeletes,
  stageBatchUpdates,
  tableKey,
  valuesMatch,
} from "../model/workspace"
import {
  BATCH_SELECTOR_WIDTH,
  COMPACT_ACTIONS_BREAKPOINT,
  QUERY_CELL_WIDTH,
  SQL_SYNTAX_STYLE,
  SQL_TAB_LIMIT,
} from "../rendering/constants"
import {
  queryCompletionPresentation,
  queryResultSummary,
  queryWindowLoadingLabel,
} from "../rendering/query-presentation"
import { applySqlSyntaxHighlights, sqlEditorGutterWidth } from "../rendering/sql-highlight"
import {
  fitCell,
  queryPlaceholder,
  shorten,
  suggestedQueryName,
} from "../rendering/workspace-shared"
import {
  DatabaseQueryCancelledError,
  databaseConnectionCanWrite,
  databaseDriverLabel,
  databaseSavedQueryIsDirty,
  executeDatabaseQuery,
  listDatabaseSavedQueries,
  loadDatabaseTableColumns,
  previewDatabaseQuery,
  removeDatabaseSavedQuery,
  saveDatabaseQuery,
} from "../services/database"
import { DatabaseBatchExportModal } from "../ui/DatabaseBatchExportModal"
import { DatabaseCellEditor } from "../ui/DatabaseCellEditor"
import { DatabaseGridRowView } from "../ui/DatabaseGridRowView"
import {
  DatabaseQueryFavoritesModal,
  type DatabaseQueryFavoritesMode,
} from "../ui/DatabaseQueryFavoritesModal"
import { RowInspector } from "../ui/RowInspector"

export function DatabaseQueryWorkspace({
  active,
  tabId,
  tabs,
  activeTabId,
  connection,
  connectionId,
  tables,
  selectedTable,
  selectedTableColumns,
  availableWidth,
  rerunRequest,
  onRerunRequestHandled,
  onClose,
  onReturnToCatalog,
  onDatabaseChanged,
  stagedChanges,
  setStagedChanges,
  changesModalOpen,
  onOpenChangesReview,
  writeBusy,
  dataRevision,
  maskingTermsSignature,
  onSelectTab,
  onNewTab,
  onCloseTab,
  onSwitchTab,
}: {
  active: boolean
  tabId: string
  tabs: DatabaseSqlTab[]
  activeTabId: string
  connection: DatabaseConnectionProfile
  connectionId: string
  tables: DatabaseTable[]
  selectedTable: DatabaseTable | null
  selectedTableColumns: DatabaseColumn[] | null
  availableWidth: number
  rerunRequest: DatabaseQueryRerunRequest | null
  onRerunRequestHandled: () => void
  onClose: () => void
  onReturnToCatalog: () => void
  onDatabaseChanged: () => void
  stagedChanges: StagedDatabaseChange[]
  setStagedChanges: (update: (current: StagedDatabaseChange[]) => StagedDatabaseChange[]) => void
  changesModalOpen: boolean
  onOpenChangesReview: () => void
  writeBusy: boolean
  dataRevision: number
  maskingTermsSignature: string
  onSelectTab: (tabId: string) => void
  onNewTab: () => void
  onCloseTab: (tabId: string) => void
  onSwitchTab: (direction: -1 | 1) => void
}) {
  const workspaceRef = useRef<BoxRenderable | null>(null)
  const editorRef = useRef<TextareaRenderable | null>(null)
  const resultScrollRef = useRef<ScrollBoxRenderable | null>(null)
  const resultInspectorRef = useRef<ScrollBoxRenderable | null>(null)
  const queryChangeCounterRef = useRef(0)
  const selectedResultRowIndexRef = useRef(0)
  const selectedResultColumnIndexRef = useRef(0)
  const resultDeleteSequenceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const resultDeleteSequenceArmedRef = useRef(false)
  const lastDataRevisionRef = useRef(dataRevision)
  const lastMaskingTermsSignatureRef = useRef(maskingTermsSignature)
  const autocompleteRef = useRef<SqlAutocompleteState | null>(null)
  const loadingAutocompleteColumnsRef = useRef(new Set<string>())
  const autocompleteMountedRef = useRef(true)
  const suppressAutocompleteRef = useRef(false)
  const suppressWorkspaceEscapeRef = useRef(false)
  const handledRerunRequestRef = useRef<string | null>(null)
  const queryAbortRef = useRef<AbortController | null>(null)
  const lastExecutedSqlRef = useRef<string | null>(null)
  const lastAutoFocusedResultRef = useRef<DatabaseQueryResult | null>(null)
  const terminal = useTerminalDimensions()
  const [result, setResult] = useState<DatabaseQueryResult | null>(null)
  const [queryError, setQueryError] = useState("")
  const [busy, setBusy] = useState(false)
  const [editorMode, setEditorMode] = useState(true)
  const [columnOffset, setColumnOffset] = useState(0)
  const [selectedResultRowIndex, setSelectedResultRowIndex] = useState(0)
  const [selectedResultColumnIndex, setSelectedResultColumnIndex] = useState(0)
  const [resultPane, setResultPane] = useState<"grid" | "inspector">("grid")
  const [resultInspectorOnly, setResultInspectorOnly] = useState(false)
  const [resultCellEditorOpen, setResultCellEditorOpen] = useState(false)
  const [resultDeleteSequenceArmed, setResultDeleteSequenceArmed] = useState(false)
  const [resultBatchRows, setResultBatchRows] = useState<DatabaseBatchSelectedRow[]>([])
  const [resultBatchExportOpen, setResultBatchExportOpen] = useState(false)
  const [resultNotice, setResultNotice] = useState("")
  const [resultTable, setResultTable] = useState<DatabaseTable | null>(null)
  const [resultTableColumns, setResultTableColumns] = useState<DatabaseColumn[] | null>(null)
  const [autocomplete, setAutocomplete] = useState<SqlAutocompleteState | null>(null)
  const [autocompleteColumns, setAutocompleteColumns] = useState(
    () => new Map<string, DatabaseColumn[]>(),
  )
  const [writeConfirmation, setWriteConfirmation] = useState<{
    sql: string
    command: string
  } | null>(null)
  const [savedQueries, setSavedQueries] = useState<DatabaseSavedQuery[]>(() =>
    listDatabaseSavedQueries(connectionId),
  )
  const [favoriteMode, setFavoriteMode] = useState<DatabaseQueryFavoritesMode>(null)
  const [activeSavedQueryId, setActiveSavedQueryId] = useState<string | null>(null)
  const [editorText, setEditorText] = useState("")
  const [querySensitiveVisibility, setQuerySensitiveVisibility] = useState<SensitiveVisibility>(
    DEFAULT_SENSITIVE_VISIBILITY,
  )
  const [editorRatio, setEditorRatio] = useState(40)
  const [workspaceMode, setWorkspaceMode] = useState<SqlWorkspaceMode>("split")
  useDatabaseQueryNotifications(queryError, resultNotice)
  const [executedStatementPosition, setExecutedStatementPosition] = useState<{
    index: number
    total: number
  } | null>(null)
  const queryWindow = useDatabaseQueryWindow({
    connectionId,
    result,
    sqlRef: lastExecutedSqlRef,
    revealSensitive: querySensitiveVisibility === "visible",
    requestRef: queryAbortRef,
    scrollRef: resultScrollRef,
    setBusy,
    setNotice: setResultNotice,
    setResult,
    selectRow: (index) => {
      selectedResultRowIndexRef.current = index
      setSelectedResultRowIndex(index)
    },
  })
  const identifiedRows = useIdentifiedQueryRows(result?.rows ?? [])
  const splitEditorHeight = sqlSplitEditorHeight(terminal.height, editorRatio)
  const editorHeight =
    workspaceMode === "editor" ? Math.max(8, terminal.height - 13) : splitEditorHeight
  const editorVisible = workspaceMode !== "result"
  const resultVisible = workspaceMode !== "editor"
  const editorGutterWidth = sqlEditorGutterWidth(editorText)
  const canWrite = databaseConnectionCanWrite(connection)
  const resultSideInspectorVisible = availableWidth >= 82 && Boolean(result?.columns.length)
  const resultInspectorVisible = resultSideInspectorVisible || resultInspectorOnly
  const resultInspectorWidth = Math.max(24, Math.min(34, Math.floor(availableWidth * 0.32)))
  const resultGridWidth = Math.max(
    18,
    availableWidth - (resultSideInspectorVisible ? resultInspectorWidth + 1 : 0),
  )
  const queryCellWidth = resultGridWidth < 72 ? 18 : QUERY_CELL_WIDTH
  const visibleColumnCount = Math.max(
    1,
    Math.floor(
      Math.max(queryCellWidth, resultGridWidth - BATCH_SELECTOR_WIDTH - 2) / queryCellWidth,
    ),
  )
  const maxColumnOffset = Math.max(0, (result?.columns.length ?? 0) - visibleColumnCount)
  const visibleColumns = useMemo(
    () => result?.columns.slice(columnOffset, columnOffset + visibleColumnCount) ?? [],
    [columnOffset, result?.columns, visibleColumnCount],
  )
  const resultColumnMetadata = useMemo(
    () => databaseQueryResultColumns(result?.columns ?? [], resultTableColumns ?? []),
    [result?.columns, resultTableColumns],
  )
  const resultChangeKey = resultTable ? changeTableKey(connectionId, resultTable) : ""
  const resultTableChanges = useMemo(
    () =>
      resultChangeKey
        ? stagedChanges.filter(
            (change) => changeTableKey(change.connectionId, change.table) === resultChangeKey,
          )
        : [],
    [resultChangeKey, stagedChanges],
  )
  const connectionStagedChangeCount = useMemo(
    () => stagedChanges.filter((change) => change.connectionId === connectionId).length,
    [connectionId, stagedChanges],
  )
  const queryGridRows = useMemo<DatabaseGridRow[]>(() => {
    const changesByRowKey = new Map<string, StagedDatabaseChange>()
    for (const change of resultTableChanges) {
      if (change.mutation.kind !== "insert") {
        changesByRowKey.set(rowKeyFingerprint(change.mutation.rowKey), change)
      }
    }
    const persistedRows = identifiedRows.map(({ id, row }) => {
      const rowKey = resultTableColumns ? databaseQueryResultRowKey(row, resultTableColumns) : null
      const change = rowKey ? (changesByRowKey.get(rowKeyFingerprint(rowKey)) ?? null) : null
      return {
        id,
        data: change?.mutation.kind === "update" ? { ...row, ...change.mutation.values } : row,
        rowKey,
        change,
      }
    })
    const insertedRows = resultTableChanges
      .filter((change) => change.mutation.kind === "insert")
      .map((change) => ({
        id: change.id,
        data: change.mutation.kind === "insert" ? change.mutation.values : {},
        rowKey: null,
        change,
      }))
    return [...persistedRows, ...insertedRows]
  }, [identifiedRows, resultTableChanges, resultTableColumns])
  const resultBatchRowIds = useMemo(
    () => new Set(resultBatchRows.map((row) => row.id)),
    [resultBatchRows],
  )
  const selectedResultGridRow = queryGridRows[selectedResultRowIndex] ?? null
  const selectedResultBatchRowId = selectedResultGridRow
    ? databaseBatchRowIdentity(selectedResultGridRow.rowKey, selectedResultGridRow.id)
    : null
  const selectedResultRowMarked = selectedResultBatchRowId
    ? resultBatchRowIds.has(selectedResultBatchRowId)
    : false
  const resultBatchChangeKeys = new Set(
    resultBatchRows.flatMap((row) => (row.rowKey ? [rowKeyFingerprint(row.rowKey)] : [])),
  )
  const resultBatchHasChanges = resultTableChanges.some(
    (change) =>
      change.mutation.kind !== "insert" &&
      resultBatchChangeKeys.has(rowKeyFingerprint(change.mutation.rowKey)),
  )
  const selectedResultRow = selectedResultGridRow?.data ?? null
  const resultInspectorColumns =
    selectedResultGridRow?.change?.mutation.kind === "insert"
      ? (resultTableColumns ?? resultColumnMetadata)
      : resultColumnMetadata
  const selectedResultColumn = resultInspectorColumns[selectedResultColumnIndex] ?? null
  const selectedResultGridColumnIndex = Math.max(
    0,
    result?.columns.indexOf(selectedResultColumn?.field ?? "") ?? 0,
  )
  const writableSelectedResultColumn = selectedResultColumn
    ? (resultTableColumns?.find((column) => column.field === selectedResultColumn.field) ?? null)
    : null
  const resultHasPrimaryKey = resultTableColumns?.some((column) => column.key === "PRI") ?? false
  const resultBaseWriteBlockReason = databaseQueryTableWriteBlockReason(
    canWrite,
    resultTable,
    resultTableColumns,
    result?.columns ?? [],
  )
  const resultTableCanWrite = resultBaseWriteBlockReason === null
  const selectedResultRowCanWrite =
    resultTableCanWrite &&
    Boolean(writableSelectedResultColumn) &&
    (selectedResultGridRow?.change?.mutation.kind === "insert" ||
      (resultHasPrimaryKey && Boolean(selectedResultGridRow?.rowKey)))
  const resultBatchCanWrite =
    resultBatchRows.length > 0 &&
    resultTableCanWrite &&
    resultHasPrimaryKey &&
    resultBatchRows.every((row) => Boolean(row.rowKey && Object.keys(row.rowKey).length))
  const resultWriteBlockReason =
    resultBaseWriteBlockReason ??
    (!selectedResultGridRow
      ? "Selecione uma linha antes de editar ou excluir."
      : !writableSelectedResultColumn
        ? "Esta coluna do resultado não corresponde a uma coluna editável."
        : selectedResultGridRow.change?.mutation.kind === "insert"
          ? null
          : !resultHasPrimaryKey || !selectedResultGridRow.rowKey
            ? "Inclua a chave primária no SELECT para editar ou excluir linhas."
            : null)
  const resultBatchWriteBlockReason =
    resultBaseWriteBlockReason ??
    (!resultHasPrimaryKey
      ? "Inclua a chave primária no SELECT para alterar as linhas selecionadas."
      : resultBatchRows.some((row) => !row.rowKey || !Object.keys(row.rowKey).length)
        ? "Uma ou mais linhas selecionadas não puderam ser identificadas pela chave primária."
        : !writableSelectedResultColumn
          ? "Esta coluna do resultado não corresponde a uma coluna editável."
          : null)
  const compactActions = availableWidth < COMPACT_ACTIONS_BREAKPOINT
  const selectionColors = databaseSelectionColors()
  const autocompleteVisibleLimit = Math.max(2, Math.min(6, editorHeight - 3))
  const autocompleteWindowStart = autocomplete
    ? Math.max(
        0,
        Math.min(
          autocomplete.selectedIndex - autocompleteVisibleLimit + 1,
          autocomplete.items.length - autocompleteVisibleLimit,
        ),
      )
    : 0
  const visibleAutocompleteItems =
    autocomplete?.items.slice(
      autocompleteWindowStart,
      autocompleteWindowStart + autocompleteVisibleLimit,
    ) ?? []
  const autocompleteWidth = Math.max(18, Math.min(66, availableWidth - editorGutterWidth - 4))
  const autocompleteHeight = visibleAutocompleteItems.length + 1
  const autocompleteTop = autocomplete
    ? autocomplete.anchorRow + 1 + autocompleteHeight < editorHeight
      ? autocomplete.anchorRow + 1
      : Math.max(0, autocomplete.anchorRow - autocompleteHeight)
    : 0
  const autocompleteLeft = autocomplete
    ? Math.max(
        editorGutterWidth,
        Math.min(
          editorGutterWidth + autocomplete.anchorColumn,
          Math.max(editorGutterWidth, availableWidth - autocompleteWidth - 2),
        ),
      )
    : 0
  const queryElementId = useCallback(
    (suffix: string) => `database-query-${tabId}-${suffix}`,
    [tabId],
  )

  const updateAutocomplete = useCallback((next: SqlAutocompleteState | null) => {
    autocompleteRef.current = next
    setAutocomplete(next)
  }, [])

  const ensureAutocompleteColumns = useCallback(
    (table: DatabaseTable) => {
      const key = sqlAutocompleteTableKey(table)
      if (autocompleteColumns.has(key) || loadingAutocompleteColumnsRef.current.has(key)) return
      loadingAutocompleteColumnsRef.current.add(key)
      void loadDatabaseTableColumns(connectionId, table)
        .then((columns) => {
          if (!autocompleteMountedRef.current) return
          setAutocompleteColumns((current) => {
            if (current.has(key)) return current
            const next = new Map(current)
            next.set(key, columns)
            return next
          })
        })
        .catch(() => undefined)
        .finally(() => loadingAutocompleteColumnsRef.current.delete(key))
    },
    [autocompleteColumns, connectionId],
  )

  const refreshAutocomplete = useCallback(
    (force = false) => {
      const editor = editorRef.current
      if (!editor || suppressAutocompleteRef.current) {
        updateAutocomplete(null)
        return
      }
      const context = getSqlCompletionContext({
        sql: editor.plainText,
        cursorOffset: editor.cursorOffset,
        driver: connection.driver,
        tables,
        columnsByTable: autocompleteColumns,
        selectedTable,
        force,
      })
      for (const table of context?.metadataTables ?? []) ensureAutocompleteColumns(table)
      if (!context?.items.length) {
        updateAutocomplete(null)
        return
      }
      const cursor = editor.visualCursor
      updateAutocomplete({
        ...context,
        selectedIndex: 0,
        anchorRow: cursor.visualRow,
        anchorColumn: cursor.visualCol,
        forced: force,
      })
    },
    [
      autocompleteColumns,
      connection.driver,
      ensureAutocompleteColumns,
      selectedTable,
      tables,
      updateAutocomplete,
    ],
  )

  const acceptAutocomplete = useCallback(
    (index?: number) => {
      const state = autocompleteRef.current
      const editor = editorRef.current
      if (!state || !editor) return
      const selectedIndex = index ?? state.selectedIndex
      const item = state.items[selectedIndex]
      if (!item) return
      suppressAutocompleteRef.current = true
      editor.setSelection(state.replaceStart, state.replaceEnd)
      editor.insertText(item.insertText)
      editor.focus()
      updateAutocomplete(null)
      setTimeout(() => {
        suppressAutocompleteRef.current = false
      }, 0)
    },
    [updateAutocomplete],
  )

  const focusQueryEditor = useCallback(() => {
    setWorkspaceMode((current) => (current === "result" ? "split" : current))
    setEditorMode(true)
    editorRef.current?.focus()
  }, [])

  const setEditorRef = useCallback(
    (editor: TextareaRenderable | null) => {
      editorRef.current = editor
      if (editor) applySqlSyntaxHighlights(editor, SQL_SYNTAX_STYLE, connection.driver)
    },
    [connection.driver],
  )

  useEffect(() => {
    autocompleteMountedRef.current = true
    return () => {
      autocompleteMountedRef.current = false
    }
  }, [])

  useEffect(() => {
    void result
    setResultBatchRows([])
    setResultBatchExportOpen(false)
  }, [result])

  useEffect(() => {
    if (!selectedTable || !selectedTableColumns) return
    const key = sqlAutocompleteTableKey(selectedTable)
    setAutocompleteColumns((current) => {
      if (current.get(key) === selectedTableColumns) return current
      const next = new Map(current)
      next.set(key, selectedTableColumns)
      return next
    })
  }, [selectedTable, selectedTableColumns])

  useEffect(() => {
    if (!resultTable) {
      setResultTableColumns(null)
      return
    }
    let cancelled = false
    setResultTableColumns(null)
    void loadDatabaseTableColumns(connectionId, resultTable)
      .then((columns) => {
        if (!cancelled) setResultTableColumns(columns)
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setResultNotice(
            loadError instanceof Error
              ? loadError.message
              : "Não foi possível carregar a estrutura da tabela.",
          )
        }
      })
    return () => {
      cancelled = true
    }
  }, [connectionId, resultTable])

  useEffect(() => {
    const lastRowIndex = Math.max(0, queryGridRows.length - 1)
    setSelectedResultRowIndex((current) => {
      const next = Math.min(current, lastRowIndex)
      selectedResultRowIndexRef.current = next
      return next
    })
  }, [queryGridRows.length])

  useEffect(() => {
    const lastColumnIndex = Math.max(0, resultInspectorColumns.length - 1)
    setSelectedResultColumnIndex((current) => {
      const next = Math.min(current, lastColumnIndex)
      selectedResultColumnIndexRef.current = next
      return next
    })
  }, [resultInspectorColumns.length])

  useEffect(() => {
    const scroll = resultScrollRef.current
    if (!result?.columns.length || !scroll) return
    scroll.scrollTo(
      databaseResultScrollTop({
        selectedRowIndex: selectedResultRowIndex,
        currentScrollTop: scroll.scrollTop,
        viewportHeight: scroll.viewport.height,
        rowCount: queryGridRows.length,
      }),
    )
    resultDeleteSequenceArmedRef.current = false
    setResultDeleteSequenceArmed(false)
  }, [queryGridRows.length, result?.columns.length, selectedResultRowIndex])

  useEffect(() => {
    if (resultPane !== "inspector") return
    resultInspectorRef.current?.scrollChildIntoView(
      queryElementId(`inspector-field-${selectedResultColumnIndex}`),
    )
  }, [queryElementId, resultPane, selectedResultColumnIndex])

  useEffect(
    () => () => {
      if (resultDeleteSequenceTimeoutRef.current) {
        clearTimeout(resultDeleteSequenceTimeoutRef.current)
      }
    },
    [],
  )

  useEffect(() => {
    if (!editorRef.current?.focused) return
    refreshAutocomplete(autocompleteRef.current?.forced ?? false)
  }, [refreshAutocomplete])

  const handleResultFocus = useCallback(() => setEditorMode(false), [])
  const setResultScrollRef = useCallback(
    (nextScroll: ScrollBoxRenderable | null) => {
      const previousScroll = resultScrollRef.current
      if (previousScroll === nextScroll) return
      previousScroll?.off(RenderableEvents.FOCUSED, handleResultFocus)
      resultScrollRef.current = nextScroll
      nextScroll?.on(RenderableEvents.FOCUSED, handleResultFocus)
    },
    [handleResultFocus],
  )

  const clearQuery = useCallback(() => {
    editorRef.current?.editBuffer.setText("")
    setEditorText("")
    setResult(null)
    setResultTable(null)
    setResultTableColumns(null)
    setResultNotice("")
    setQueryError("")
    setColumnOffset(0)
    setWriteConfirmation(null)
    setActiveSavedQueryId(null)
    lastExecutedSqlRef.current = null
    setExecutedStatementPosition(null)
    focusQueryEditor()
  }, [focusQueryEditor])

  const openSaveFavorite = useCallback(() => {
    const sql = editorRef.current?.plainText.trim() ?? ""
    if (!sql) {
      setQueryError("Escreva uma query antes de salvar.")
      return
    }
    updateAutocomplete(null)
    editorRef.current?.blur()
    setEditorMode(false)
    setFavoriteMode("save")
  }, [updateAutocomplete])

  const openFavorites = useCallback(() => {
    updateAutocomplete(null)
    editorRef.current?.blur()
    setEditorMode(false)
    setFavoriteMode("list")
  }, [updateAutocomplete])

  const closeFavorites = useCallback(() => {
    suppressWorkspaceEscapeRef.current = true
    setFavoriteMode(null)
    setTimeout(() => {
      focusQueryEditor()
      suppressWorkspaceEscapeRef.current = false
    }, 0)
  }, [focusQueryEditor])

  const saveFavorite = useCallback(
    (name: string) => {
      const sql = editorRef.current?.plainText ?? ""
      try {
        const saved = saveDatabaseQuery(connectionId, {
          ...(activeSavedQueryId === null ? {} : { id: activeSavedQueryId }),
          name,
          sql,
        })
        setSavedQueries(listDatabaseSavedQueries(connectionId))
        setActiveSavedQueryId(saved.id)
        setEditorText(sql)
        setFavoriteMode(null)
        setQueryError("")
        setTimeout(focusQueryEditor, 0)
      } catch (saveError) {
        setQueryError(
          saveError instanceof Error ? saveError.message : "Não foi possível salvar a query.",
        )
        setFavoriteMode(null)
      }
    },
    [activeSavedQueryId, connectionId, focusQueryEditor],
  )

  const loadFavorite = useCallback(
    (query: DatabaseSavedQuery) => {
      suppressAutocompleteRef.current = true
      editorRef.current?.editBuffer.setText(query.sql)
      if (editorRef.current) {
        applySqlSyntaxHighlights(editorRef.current, SQL_SYNTAX_STYLE, connection.driver)
      }
      setActiveSavedQueryId(query.id)
      setEditorText(query.sql)
      setResult(null)
      setResultTable(null)
      setResultTableColumns(null)
      setResultNotice("")
      setQueryError("")
      setColumnOffset(0)
      setWriteConfirmation(null)
      lastExecutedSqlRef.current = null
      setExecutedStatementPosition(null)
      setFavoriteMode(null)
      setTimeout(() => {
        suppressAutocompleteRef.current = false
        focusQueryEditor()
      }, 0)
    },
    [connection.driver, focusQueryEditor],
  )

  const deleteFavorite = useCallback(
    (queryId: string) => {
      try {
        removeDatabaseSavedQuery(connectionId, queryId)
        setSavedQueries(listDatabaseSavedQueries(connectionId))
        if (activeSavedQueryId === queryId) setActiveSavedQueryId(null)
      } catch (deleteError) {
        setQueryError(
          deleteError instanceof Error ? deleteError.message : "Não foi possível excluir a query.",
        )
        setFavoriteMode(null)
      }
    },
    [activeSavedQueryId, connectionId],
  )

  const runQuery = useCallback(
    async ({
      revealSensitive = querySensitiveVisibility === "visible",
      sql: sqlOverride,
      forceWriteConfirmation = false,
    }: {
      revealSensitive?: boolean
      sql?: string
      forceWriteConfirmation?: boolean
    } = {}) => {
      if (queryAbortRef.current) return
      const editorSql = editorRef.current?.plainText ?? ""
      const statement = sqlOverride
        ? null
        : sqlStatementAtOffset(editorSql, editorRef.current?.cursorOffset ?? 0)
      const sql = sqlOverride ?? statement?.sql ?? ""
      let plan: ReturnType<typeof previewDatabaseQuery>
      try {
        plan = previewDatabaseQuery(connectionId, sql)
      } catch (previewError) {
        setWriteConfirmation(null)
        setQueryError(
          previewError instanceof Error
            ? previewError.message
            : "Não foi possível validar a consulta.",
        )
        return
      }
      if (plan.mutating && (forceWriteConfirmation || writeConfirmation?.sql !== plan.sql)) {
        setWriteConfirmation({ sql: plan.sql, command: plan.command })
        setQueryError("")
        return
      }

      setWriteConfirmation(null)
      const controller = new AbortController()
      queryAbortRef.current = controller
      setBusy(true)
      setQueryError("")
      setResultNotice("")
      try {
        const nextResult = await executeDatabaseQuery(connectionId, sql, revealSensitive, {
          signal: controller.signal,
        })
        const nextResultTable = nextResult.mutating
          ? null
          : databaseEditableQueryTable(plan.sql, tables, connection.driver)
        lastExecutedSqlRef.current = plan.sql
        setExecutedStatementPosition(
          statement ? { index: statement.index, total: statement.total } : null,
        )
        setResult(nextResult)
        const keepsCurrentTableSchema = Boolean(
          resultTable && nextResultTable && tableKey(resultTable) === tableKey(nextResultTable),
        )
        setResultTable(nextResultTable)
        if (!keepsCurrentTableSchema) setResultTableColumns(null)
        setResultNotice("")
        setColumnOffset(0)
        selectedResultRowIndexRef.current = 0
        setSelectedResultRowIndex(0)
        selectedResultColumnIndexRef.current = 0
        setSelectedResultColumnIndex(0)
        setResultPane("grid")
        setResultInspectorOnly(false)
        resultScrollRef.current?.scrollTo(0)
        if (nextResult.mutating) {
          setAutocompleteColumns(new Map())
          onDatabaseChanged()
        }
      } catch (executionError) {
        if (controller.signal.aborted || executionError instanceof DatabaseQueryCancelledError) {
          setQueryError("")
          setResultNotice("Consulta cancelada.")
          return
        }
        setResult(null)
        setResultTable(null)
        setResultTableColumns(null)
        setQueryError(
          executionError instanceof Error
            ? executionError.message
            : "Não foi possível executar a consulta.",
        )
      } finally {
        if (queryAbortRef.current === controller) queryAbortRef.current = null
        setBusy(false)
      }
    },
    [
      connection.driver,
      connectionId,
      onDatabaseChanged,
      querySensitiveVisibility,
      resultTable,
      tables,
      writeConfirmation?.sql,
    ],
  )

  const cancelQuery = useCallback(() => {
    if (!queryAbortRef.current) return
    setResultNotice("Cancelando consulta…")
    queryAbortRef.current.abort()
  }, [])

  const rerunLastQuery = useCallback(() => {
    const sql = lastExecutedSqlRef.current
    if (sql) void runQuery({ sql })
  }, [runQuery])

  useEffect(() => {
    if (
      !active ||
      !rerunRequest ||
      handledRerunRequestRef.current === rerunRequest.id ||
      !editorRef.current
    ) {
      return
    }
    handledRerunRequestRef.current = rerunRequest.id
    suppressAutocompleteRef.current = true
    editorRef.current.editBuffer.setText(rerunRequest.sql)
    applySqlSyntaxHighlights(editorRef.current, SQL_SYNTAX_STYLE, connection.driver)
    setEditorText(rerunRequest.sql)
    setResult(null)
    setResultTable(null)
    setResultTableColumns(null)
    setResultNotice("")
    setQueryError("")
    setColumnOffset(0)
    setWriteConfirmation(null)
    setActiveSavedQueryId(null)
    setQuerySensitiveVisibility(DEFAULT_SENSITIVE_VISIBILITY)
    onRerunRequestHandled()
    setTimeout(() => {
      suppressAutocompleteRef.current = false
      focusQueryEditor()
      void runQuery({
        revealSensitive: true,
        sql: rerunRequest.sql,
        forceWriteConfirmation: true,
      })
    }, 0)
  }, [active, connection.driver, focusQueryEditor, onRerunRequestHandled, rerunRequest, runQuery])

  const toggleQuerySensitiveData = useCallback(() => {
    if (querySensitiveVisibility === "hidden") {
      setQuerySensitiveVisibility("confirm")
      return
    }
    const nextVisibility = nextSensitiveVisibility(querySensitiveVisibility)
    setResultBatchRows([])
    setResultBatchExportOpen(false)
    setQuerySensitiveVisibility(nextVisibility)
    if (!result) return
    const lastSql = lastExecutedSqlRef.current
    if (!lastSql) return
    try {
      const plan = previewDatabaseQuery(connectionId, lastSql)
      if (!plan.mutating) {
        void runQuery({ sql: lastSql, revealSensitive: nextVisibility === "visible" })
      }
    } catch {
      // The normal query validation will display a useful error on the next execution.
    }
  }, [connectionId, querySensitiveVisibility, result, runQuery])

  const focusResultPane = useCallback(
    (pane: "grid" | "inspector") => {
      editorRef.current?.blur()
      setEditorMode(false)
      setResultPane(pane)
      if (!resultSideInspectorVisible) setResultInspectorOnly(pane === "inspector")
      if (pane === "grid") setTimeout(() => resultScrollRef.current?.focus(), 0)
    },
    [resultSideInspectorVisible],
  )

  const moveResultRow = useCallback(
    (delta: number) => {
      const current = selectedResultRowIndexRef.current
      const next = Math.max(0, Math.min(queryGridRows.length - 1, current + delta))
      const atBoundary = delta < 0 ? current === 0 : current === queryGridRows.length - 1
      if (next === current && atBoundary) {
        void queryWindow.load(delta < 0 ? -1 : 1)
        return
      }
      selectedResultRowIndexRef.current = next
      setSelectedResultRowIndex(next)
    },
    [queryGridRows.length, queryWindow],
  )

  const moveResultColumn = useCallback(
    (delta: number) => {
      setSelectedResultColumnIndex((current) => {
        const next = Math.max(0, Math.min(resultInspectorColumns.length - 1, current + delta))
        selectedResultColumnIndexRef.current = next
        const resultColumnIndex =
          result?.columns.indexOf(resultInspectorColumns[next]?.field ?? "") ?? -1
        if (resultColumnIndex >= 0) {
          setColumnOffset((currentOffset) => {
            if (resultColumnIndex < currentOffset) return resultColumnIndex
            if (resultColumnIndex >= currentOffset + visibleColumnCount) {
              return resultColumnIndex - visibleColumnCount + 1
            }
            return currentOffset
          })
        }
        return next
      })
    },
    [result?.columns, resultInspectorColumns, visibleColumnCount],
  )

  const selectResultGridColumn = useCallback(
    (gridColumnIndex: number) => {
      const field = result?.columns[gridColumnIndex]
      if (!field) return
      const inspectorIndex = resultInspectorColumns.findIndex((column) => column.field === field)
      const nextInspectorIndex = inspectorIndex >= 0 ? inspectorIndex : 0
      selectedResultColumnIndexRef.current = nextInspectorIndex
      setSelectedResultColumnIndex(nextInspectorIndex)
      setColumnOffset((currentOffset) => {
        if (gridColumnIndex < currentOffset) return gridColumnIndex
        if (gridColumnIndex >= currentOffset + visibleColumnCount) {
          return gridColumnIndex - visibleColumnCount + 1
        }
        return currentOffset
      })
    },
    [result?.columns, resultInspectorColumns, visibleColumnCount],
  )

  const moveResultGridColumn = useCallback(
    (delta: number) => {
      const lastIndex = Math.max(0, (result?.columns.length ?? 1) - 1)
      selectResultGridColumn(
        Math.max(0, Math.min(lastIndex, selectedResultGridColumnIndex + delta)),
      )
    },
    [result?.columns.length, selectResultGridColumn, selectedResultGridColumnIndex],
  )

  const navigateResultHorizontally = useQueryResultHorizontalNavigation({
    columnCount: result?.columns.length ?? 0,
    selectedColumnIndex: selectedResultGridColumnIndex,
    pane: resultPane,
    inspectorVisible: resultInspectorVisible,
    moveColumn: moveResultGridColumn,
    focusPane: focusResultPane,
    onReturnToCatalog,
  })

  const toggleResultBatchRow = useCallback((gridRow: DatabaseGridRow) => {
    const row = batchRow(gridRow)
    setResultBatchRows((current) => toggleDatabaseBatchRow(current, row))
  }, [])

  const selectResultBatchRow = useCallback(
    (rowIndex: number, gridRow: DatabaseGridRow) => {
      selectedResultRowIndexRef.current = rowIndex
      setSelectedResultRowIndex(rowIndex)
      focusResultPane("grid")
      toggleResultBatchRow(gridRow)
    },
    [focusResultPane, toggleResultBatchRow],
  )

  const selectResultGridCell = useCallback(
    (rowIndex: number, columnIndex: number) => {
      selectedResultRowIndexRef.current = rowIndex
      setSelectedResultRowIndex(rowIndex)
      selectResultGridColumn(columnIndex)
      focusResultPane("grid")
    },
    [focusResultPane, selectResultGridColumn],
  )

  const selectionSweep = useDatabaseSelectionSweep({
    rows: queryGridRows,
    selectedIndexRef: selectedResultRowIndexRef,
    updateSelectedRows: setResultBatchRows,
    moveRow: moveResultRow,
    resetKey: result,
  })

  const stageQueryBatchValue = useCallback(
    (value: unknown) => {
      if (
        !resultTable ||
        !resultTableColumns ||
        !writableSelectedResultColumn ||
        !resultTableCanWrite ||
        !resultHasPrimaryKey
      ) {
        setResultNotice(`⚠ ${resultBatchWriteBlockReason}`)
        return
      }
      const staged = stageBatchUpdates({
        current: stagedChanges,
        rows: resultBatchRows,
        connectionId,
        connectionName: connection.name,
        table: resultTable,
        columns: resultTableColumns,
        column: writableSelectedResultColumn,
        value,
        nextId: () => `query-update-${Date.now()}-${++queryChangeCounterRef.current}`,
      })
      setStagedChanges(() => staged.changes)
      setResultBatchRows((current) =>
        current.map((row) => ({
          ...row,
          data: { ...row.data, [writableSelectedResultColumn.field]: value },
        })),
      )
      setResultCellEditorOpen(false)
      setResultNotice(
        staged.stagedCount
          ? `◆ ${staged.stagedCount} linha(s) alterada(s) localmente · [Ctrl+S] para revisar`
          : "Nenhuma linha selecionada pôde ser alterada.",
      )
    },
    [
      connection.name,
      connectionId,
      resultBatchRows,
      resultHasPrimaryKey,
      resultTable,
      resultTableCanWrite,
      resultTableColumns,
      resultBatchWriteBlockReason,
      stagedChanges,
      setStagedChanges,
      writableSelectedResultColumn,
    ],
  )

  const stageDeleteQueryBatch = useCallback(() => {
    if (!resultTable || !resultTableColumns || !resultTableCanWrite || !resultHasPrimaryKey) {
      setResultNotice(`⚠ ${resultBatchWriteBlockReason}`)
      return
    }
    const staged = stageBatchDeletes({
      current: stagedChanges,
      rows: resultBatchRows,
      connectionId,
      connectionName: connection.name,
      table: resultTable,
      columns: resultTableColumns,
      nextId: () => `query-delete-${Date.now()}-${++queryChangeCounterRef.current}`,
    })
    setStagedChanges(() => staged.changes)
    setResultNotice(
      staged.stagedCount
        ? `− ${staged.stagedCount} linha(s) marcada(s) em vermelho · nada foi excluído ainda`
        : "Nenhuma linha selecionada pôde ser excluída.",
    )
  }, [
    connection.name,
    connectionId,
    resultBatchRows,
    resultHasPrimaryKey,
    resultTable,
    resultTableCanWrite,
    resultTableColumns,
    resultBatchWriteBlockReason,
    stagedChanges,
    setStagedChanges,
  ])

  const undoQueryBatchChanges = useCallback(() => {
    if (!resultTable || !resultBatchRows.length) return false
    const rowKeys = new Set(
      resultBatchRows.flatMap((row) => (row.rowKey ? [rowKeyFingerprint(row.rowKey)] : [])),
    )
    const nextChanges = stagedChanges.filter((change) => {
      const matchesTable = changeTableKey(change.connectionId, change.table) === resultChangeKey
      const matchesRow =
        change.mutation.kind !== "insert" && rowKeys.has(rowKeyFingerprint(change.mutation.rowKey))
      return !matchesTable || !matchesRow
    })
    const removedCount = stagedChanges.length - nextChanges.length
    setStagedChanges(() => nextChanges)
    const originals = new Map(
      stagedChanges.flatMap((change) =>
        changeTableKey(change.connectionId, change.table) === resultChangeKey &&
        change.mutation.kind !== "insert" &&
        change.originalRow
          ? [[rowKeyFingerprint(change.mutation.rowKey), change.originalRow] as const]
          : [],
      ),
    )
    setResultBatchRows((current) =>
      current.map((row) => {
        if (!row.rowKey) return row
        const original = originals.get(rowKeyFingerprint(row.rowKey))
        return original ? { ...row, data: original } : row
      }),
    )
    setResultNotice(
      removedCount
        ? `${removedCount} alteração(ões) selecionada(s) desfeita(s)`
        : "As linhas selecionadas não possuem alterações preparadas.",
    )
    return true
  }, [resultBatchRows, resultChangeKey, resultTable, setStagedChanges, stagedChanges])

  const createQueryResultRow = useCallback(() => {
    if (!resultTable || !resultTableColumns || !resultTableCanWrite) {
      setResultNotice(`⚠ ${resultWriteBlockReason}`)
      return
    }
    queryChangeCounterRef.current += 1
    const change: StagedDatabaseChange = {
      id: `query-insert-${Date.now()}-${queryChangeCounterRef.current}`,
      connectionId,
      connectionName: connection.name,
      table: resultTable,
      columns: resultTableColumns,
      mutation: { kind: "insert", values: {} },
      originalRow: null,
      approved: false,
    }
    setStagedChanges((current) => [...current, change])
    selectedResultRowIndexRef.current = queryGridRows.length
    setSelectedResultRowIndex(queryGridRows.length)
    selectedResultColumnIndexRef.current = 0
    setSelectedResultColumnIndex(0)
    focusResultPane("inspector")
    setResultNotice("+ Nova linha preparada · preencha os campos no inspetor e use [Ctrl+S]")
  }, [
    connection.name,
    connectionId,
    focusResultPane,
    queryGridRows.length,
    resultTable,
    resultTableCanWrite,
    resultTableColumns,
    resultWriteBlockReason,
    setStagedChanges,
  ])

  const openQueryResultCellEditor = useCallback(() => {
    const targetRow = queryGridRows[selectedResultRowIndexRef.current] ?? selectedResultGridRow
    const targetColumn =
      resultInspectorColumns[selectedResultColumnIndexRef.current] ?? selectedResultColumn
    const writableColumn = targetColumn
      ? (resultTableColumns?.find((column) => column.field === targetColumn.field) ?? null)
      : null
    if (resultBatchRows.length) {
      const batchCanWrite =
        resultTableCanWrite &&
        resultHasPrimaryKey &&
        Boolean(writableColumn) &&
        resultBatchRows.every((row) => row.rowKey && Object.keys(row.rowKey).length)
      if (!batchCanWrite) {
        setResultNotice(`⚠ ${resultBatchWriteBlockReason}`)
        return
      }
      resultDeleteSequenceArmedRef.current = false
      setResultDeleteSequenceArmed(false)
      setResultCellEditorOpen(true)
      return
    }
    const targetCanWrite =
      resultTableCanWrite &&
      Boolean(writableColumn) &&
      Boolean(targetRow) &&
      (targetRow?.change?.mutation.kind === "insert" ||
        (resultHasPrimaryKey && Boolean(targetRow?.rowKey)))
    if (!targetCanWrite || !targetRow || !writableColumn) {
      setResultNotice(`⚠ ${resultWriteBlockReason}`)
      return
    }
    if (targetRow.change?.mutation.kind === "delete") {
      setResultNotice("Esta linha está marcada para exclusão. Use [U] para desfazer.")
      return
    }
    resultDeleteSequenceArmedRef.current = false
    setResultDeleteSequenceArmed(false)
    setResultCellEditorOpen(true)
  }, [
    queryGridRows,
    resultBatchRows,
    resultBatchWriteBlockReason,
    resultHasPrimaryKey,
    resultInspectorColumns,
    resultTableCanWrite,
    resultTableColumns,
    resultWriteBlockReason,
    selectedResultColumn,
    selectedResultGridRow,
  ])

  const stageQueryResultCellValue = useCallback(
    (value: unknown) => {
      if (
        !resultTableCanWrite ||
        !resultTable ||
        !resultTableColumns ||
        !selectedResultGridRow ||
        !writableSelectedResultColumn
      )
        return

      if (selectedResultGridRow.change?.mutation.kind === "insert") {
        setStagedChanges((current) =>
          current.map((change) =>
            change.id === selectedResultGridRow.change?.id && change.mutation.kind === "insert"
              ? {
                  ...change,
                  approved: false,
                  mutation: {
                    ...change.mutation,
                    values: {
                      ...change.mutation.values,
                      [writableSelectedResultColumn.field]: value,
                    },
                  },
                }
              : change,
          ),
        )
        setResultNotice(`+ ${writableSelectedResultColumn.field} preparada na nova linha`)
        setResultCellEditorOpen(false)
        return
      }

      const rowKey = selectedResultGridRow.rowKey
      if (!rowKey) return
      const fingerprint = rowKeyFingerprint(rowKey)
      const originalRow = selectedResultGridRow.change?.originalRow ?? selectedResultGridRow.data
      const restoredOriginalValue = valuesMatch(
        originalRow[writableSelectedResultColumn.field],
        value,
      )
      setStagedChanges((current) => {
        const existingIndex = current.findIndex(
          (change) =>
            changeTableKey(change.connectionId, change.table) === resultChangeKey &&
            change.mutation.kind !== "insert" &&
            rowKeyFingerprint(change.mutation.rowKey) === fingerprint,
        )
        const existing = existingIndex >= 0 ? current[existingIndex] : null
        const currentValues = existing?.mutation.kind === "update" ? existing.mutation.values : {}
        const nextValues = {
          ...currentValues,
          [writableSelectedResultColumn.field]: value,
        }
        if (restoredOriginalValue) delete nextValues[writableSelectedResultColumn.field]
        if (!Object.keys(nextValues).length) {
          return existingIndex >= 0
            ? current.filter((_change, index) => index !== existingIndex)
            : current
        }
        const nextChange: StagedDatabaseChange = {
          id: existing?.id ?? `query-update-${Date.now()}-${++queryChangeCounterRef.current}`,
          connectionId,
          connectionName: connection.name,
          table: resultTable,
          columns: resultTableColumns,
          mutation: { kind: "update", rowKey, values: nextValues },
          originalRow,
          approved: false,
        }
        if (existingIndex < 0) return [...current, nextChange]
        return current.map((change, index) => (index === existingIndex ? nextChange : change))
      })
      setResultNotice(
        restoredOriginalValue
          ? `◇ ${writableSelectedResultColumn.field} voltou ao valor original`
          : `◆ ${writableSelectedResultColumn.field} alterada localmente · [Ctrl+S] para revisar`,
      )
      setResultCellEditorOpen(false)
    },
    [
      connection.name,
      connectionId,
      resultChangeKey,
      resultTable,
      resultTableCanWrite,
      resultTableColumns,
      selectedResultGridRow,
      setStagedChanges,
      writableSelectedResultColumn,
    ],
  )

  const stageDeleteQueryResultRow = useCallback(() => {
    if (resultBatchRows.length) {
      stageDeleteQueryBatch()
      return
    }
    const targetRow = queryGridRows[selectedResultRowIndexRef.current] ?? selectedResultGridRow
    if (!resultTableCanWrite || !targetRow || !resultTable || !resultTableColumns) return
    if (targetRow.change?.mutation.kind === "insert") {
      setStagedChanges((current) => current.filter((change) => change.id !== targetRow.change?.id))
      setSelectedResultRowIndex((current) => {
        const next = Math.max(0, current - 1)
        selectedResultRowIndexRef.current = next
        return next
      })
      setResultNotice("Nova linha descartada")
      return
    }
    const rowKey = targetRow.rowKey
    if (!rowKey || !resultHasPrimaryKey) {
      setResultNotice(`⚠ ${resultWriteBlockReason}`)
      return
    }
    const fingerprint = rowKeyFingerprint(rowKey)
    setStagedChanges((current) => {
      const existingIndex = current.findIndex(
        (change) =>
          changeTableKey(change.connectionId, change.table) === resultChangeKey &&
          change.mutation.kind !== "insert" &&
          rowKeyFingerprint(change.mutation.rowKey) === fingerprint,
      )
      const existing = existingIndex >= 0 ? current[existingIndex] : null
      const nextChange: StagedDatabaseChange = {
        id: existing?.id ?? `query-delete-${Date.now()}-${++queryChangeCounterRef.current}`,
        connectionId,
        connectionName: connection.name,
        table: resultTable,
        columns: resultTableColumns,
        mutation: { kind: "delete", rowKey },
        originalRow: existing?.originalRow ?? targetRow.data,
        approved: false,
      }
      if (existingIndex < 0) return [...current, nextChange]
      return current.map((change, index) => (index === existingIndex ? nextChange : change))
    })
    setResultNotice("− Linha marcada em vermelho · nada foi excluído ainda")
  }, [
    connection.name,
    connectionId,
    queryGridRows,
    resultBatchRows.length,
    resultChangeKey,
    resultHasPrimaryKey,
    resultTable,
    resultTableCanWrite,
    resultTableColumns,
    resultWriteBlockReason,
    selectedResultGridRow,
    stageDeleteQueryBatch,
    setStagedChanges,
  ])

  const undoQueryResultChange = useCallback(() => {
    if (resultBatchRows.length && undoQueryBatchChanges()) return
    const changeId = selectedResultGridRow?.change?.id
    if (!changeId) return
    setStagedChanges((current) => current.filter((change) => change.id !== changeId))
    setResultNotice("Alteração local desfeita")
  }, [
    resultBatchRows.length,
    selectedResultGridRow?.change?.id,
    setStagedChanges,
    undoQueryBatchChanges,
  ])

  useEffect(() => {
    if (lastDataRevisionRef.current === dataRevision) return
    lastDataRevisionRef.current = dataRevision
    if (!active || !result || result.mutating || busy) return
    setResultNotice("Atualizando resultado após aplicar as alterações…")
    rerunLastQuery()
  }, [active, busy, dataRevision, rerunLastQuery, result])

  useEffect(() => {
    if (!active || lastMaskingTermsSignatureRef.current === maskingTermsSignature) return
    lastMaskingTermsSignatureRef.current = maskingTermsSignature
    if (!result || result.mutating || busy) return
    setResultNotice("Atualizando resultado após alterar os termos sensíveis…")
    rerunLastQuery()
  }, [active, busy, maskingTermsSignature, rerunLastQuery, result])

  useEffect(() => {
    if (querySensitiveVisibility !== "confirm") return
    const timeout = setTimeout(() => setQuerySensitiveVisibility("hidden"), 8_000)
    return () => clearTimeout(timeout)
  }, [querySensitiveVisibility])

  useEffect(() => {
    if (!active || favoriteMode) return
    const timeout = setTimeout(focusQueryEditor, 0)
    return () => clearTimeout(timeout)
  }, [active, favoriteMode, focusQueryEditor])

  useEffect(() => () => queryAbortRef.current?.abort(), [])

  useEffect(() => {
    if (!active || !result?.columns.length || lastAutoFocusedResultRef.current === result) return
    lastAutoFocusedResultRef.current = result
    const timeout = setTimeout(() => {
      setEditorMode(false)
      resultScrollRef.current?.focus()
    }, 0)
    return () => clearTimeout(timeout)
  }, [active, result])

  useEffect(() => {
    if (columnOffset > maxColumnOffset) setColumnOffset(maxColumnOffset)
  }, [columnOffset, maxColumnOffset])

  useEffect(() => {
    if (resultSideInspectorVisible) {
      setResultInspectorOnly(false)
      return
    }
    setResultInspectorOnly(resultPane === "inspector")
  }, [resultPane, resultSideInspectorVisible])

  const handleBack = useCallback(() => {
    if (editorMode || editorRef.current?.focused) {
      editorRef.current?.blur()
      setEditorMode(false)
      const nextFocus = resultScrollRef.current ?? workspaceRef.current
      setTimeout(() => nextFocus?.focus(), 0)
      return
    }
    if (resultInspectorOnly) {
      focusResultPane("grid")
      return
    }
    onClose()
  }, [editorMode, focusResultPane, onClose, resultInspectorOnly])

  const resizeEditor = useCallback((direction: -1 | 1) => {
    setWorkspaceMode("split")
    setEditorRatio((current) => resizeSqlEditorRatio(current, direction))
  }, [])

  const toggleWorkspaceMaximize = useCallback(() => {
    const focusedPane = editorRef.current?.focused || editorMode ? "editor" : "result"
    setWorkspaceMode((current) => toggleSqlWorkspaceMode(current, focusedPane))
  }, [editorMode])

  useKeyboard((key) => {
    if (!active || resultCellEditorOpen || changesModalOpen || resultBatchExportOpen) return
    if (key.name === "escape" && suppressWorkspaceEscapeRef.current) {
      key.preventDefault()
      key.stopPropagation()
      return
    }
    if (favoriteMode) return
    const editorFocused = editorRef.current?.focused ?? false
    if (key.ctrl && key.name === "x" && busy) {
      key.preventDefault()
      key.stopPropagation()
      cancelQuery()
      return
    }
    if (key.ctrl && key.name === "n") {
      key.preventDefault()
      key.stopPropagation()
      onNewTab()
      return
    }
    if (key.ctrl && key.name === "w") {
      key.preventDefault()
      key.stopPropagation()
      onCloseTab(tabId)
      return
    }
    if (key.option && (key.name === "left" || key.name === "right")) {
      key.preventDefault()
      key.stopPropagation()
      onSwitchTab(key.name === "left" ? -1 : 1)
      return
    }
    if (key.ctrl && (key.name === "up" || key.name === "down")) {
      key.preventDefault()
      key.stopPropagation()
      resizeEditor(key.name === "up" ? 1 : -1)
      return
    }
    if (key.name === "f10") {
      key.preventDefault()
      key.stopPropagation()
      toggleWorkspaceMaximize()
      return
    }
    if (key.ctrl && key.name === "s") {
      key.preventDefault()
      key.stopPropagation()
      if (editorFocused || editorMode || !result?.columns.length) {
        openSaveFavorite()
      } else if (connectionStagedChangeCount) {
        onOpenChangesReview()
      } else {
        setResultNotice("Nenhuma alteração preparada para revisar")
      }
      return
    }
    if (key.ctrl && key.name === "f") {
      key.preventDefault()
      key.stopPropagation()
      openFavorites()
      return
    }
    const submitKey = key.ctrl && key.name === "a"
    if (submitKey) {
      key.preventDefault()
      key.stopPropagation()
      if (editorFocused || editorMode || !result?.columns.length) void runQuery()
      else createQueryResultRow()
      return
    }
    const manualAutocompleteKey =
      key.ctrl &&
      (key.name === "space" || key.name === "@" || key.sequence === "\0" || key.raw === "\0")
    if (editorFocused && manualAutocompleteKey) {
      key.preventDefault()
      key.stopPropagation()
      refreshAutocomplete(true)
      return
    }
    if (!editorFocused && databaseBatchSweepShortcut(key) && result?.columns.length) {
      key.preventDefault()
      key.stopPropagation()
      selectionSweep.toggle()
      return
    }
    const completion = autocompleteRef.current
    if (editorFocused && completion) {
      if (key.name === "up" || key.name === "down") {
        key.preventDefault()
        key.stopPropagation()
        const direction = key.name === "up" ? -1 : 1
        const nextIndex =
          (completion.selectedIndex + direction + completion.items.length) % completion.items.length
        updateAutocomplete({ ...completion, selectedIndex: nextIndex })
        return
      }
      if (
        key.name === "tab" ||
        key.name === "enter" ||
        key.name === "return" ||
        key.name === "kpenter" ||
        key.name === "linefeed"
      ) {
        const selectedItem = completion.items[completion.selectedIndex]
        const currentPrefix =
          editorRef.current?.plainText.slice(completion.replaceStart, completion.replaceEnd) ?? ""
        const enterKey = key.name !== "tab"
        if (
          enterKey &&
          selectedItem &&
          currentPrefix.toLocaleLowerCase() === selectedItem.insertText.toLocaleLowerCase()
        ) {
          updateAutocomplete(null)
          return
        }
        key.preventDefault()
        key.stopPropagation()
        acceptAutocomplete()
        return
      }
      if (key.name === "escape") {
        key.preventDefault()
        key.stopPropagation()
        updateAutocomplete(null)
        return
      }
    }
    if (key.name === "escape") {
      key.preventDefault()
      key.stopPropagation()
      if (!editorFocused && (resultBatchRows.length || selectionSweep.active)) {
        setResultBatchRows([])
        selectionSweep.clear()
        setResultNotice("Seleção limpa.")
        return
      }
      handleBack()
      return
    }
    if (editorFocused) return
    if (/^[1-6]$/.test(key.name)) {
      const tab = tabs[Number(key.name) - 1]
      if (tab) {
        key.preventDefault()
        key.stopPropagation()
        onSelectTab(tab.id)
      }
    } else if (key.name === "space" && result?.columns.length) {
      const targetRow = queryGridRows[selectedResultRowIndexRef.current] ?? selectedResultGridRow
      if (!targetRow) return
      key.preventDefault()
      key.stopPropagation()
      toggleResultBatchRow(targetRow)
    } else if (key.name === "x" && resultBatchRows.length) {
      key.preventDefault()
      key.stopPropagation()
      setResultBatchExportOpen(true)
    } else if (key.name === "a") {
      key.preventDefault()
      key.stopPropagation()
      focusQueryEditor()
    } else if (key.name === "enter" || key.name === "return" || key.name === "e") {
      if (!result?.columns.length) return
      key.preventDefault()
      key.stopPropagation()
      openQueryResultCellEditor()
    } else if (
      (key.name === "h" || key.name === "l" || key.name === "left" || key.name === "right") &&
      result?.columns.length
    ) {
      if (!navigateResultHorizontally(key.name)) return
      key.preventDefault()
      key.stopPropagation()
    } else if (key.name === "l" && !busy) {
      key.preventDefault()
      key.stopPropagation()
      clearQuery()
    } else if (key.name === "v" && !busy) {
      key.preventDefault()
      key.stopPropagation()
      toggleQuerySensitiveData()
    } else if (key.name === "i" && result?.columns.length) {
      key.preventDefault()
      key.stopPropagation()
      focusResultPane(resultPane === "inspector" ? "grid" : "inspector")
    } else if (key.name === "u" && (resultBatchRows.length || selectedResultGridRow?.change)) {
      key.preventDefault()
      key.stopPropagation()
      undoQueryResultChange()
    } else if (key.name === "d" && result?.columns.length) {
      key.preventDefault()
      key.stopPropagation()
      if (resultBatchRows.length ? !resultBatchCanWrite : !selectedResultRowCanWrite) {
        resultDeleteSequenceArmedRef.current = false
        setResultDeleteSequenceArmed(false)
        setResultNotice(
          `⚠ ${resultBatchRows.length ? resultBatchWriteBlockReason : resultWriteBlockReason}`,
        )
      } else if (resultDeleteSequenceArmedRef.current) {
        if (resultDeleteSequenceTimeoutRef.current) {
          clearTimeout(resultDeleteSequenceTimeoutRef.current)
          resultDeleteSequenceTimeoutRef.current = null
        }
        resultDeleteSequenceArmedRef.current = false
        setResultDeleteSequenceArmed(false)
        stageDeleteQueryResultRow()
      } else {
        resultDeleteSequenceArmedRef.current = true
        setResultDeleteSequenceArmed(true)
        setResultNotice("[d]… pressione [d] novamente para preparar a exclusão")
        resultDeleteSequenceTimeoutRef.current = setTimeout(() => {
          resultDeleteSequenceArmedRef.current = false
          setResultDeleteSequenceArmed(false)
          resultDeleteSequenceTimeoutRef.current = null
        }, 1_200)
      }
    } else if (
      resultPane === "inspector" &&
      (key.name === "up" || key.name === "down") &&
      result?.columns.length
    ) {
      key.preventDefault()
      key.stopPropagation()
      moveResultColumn(key.name === "up" ? -1 : 1)
    }
  })

  const activeSavedQuery = savedQueries.find((query) => query.id === activeSavedQueryId) ?? null
  const querySql = editorText
  const favoriteDirty = databaseSavedQueryIsDirty(activeSavedQuery, editorText)
  const queryHasMaskedValues = Boolean(
    result?.rows.some((row) => Object.values(row).some((value) => value === "<mascarado>")),
  )
  const querySensitiveDataMasked = sensitiveDataIsMasked(querySensitiveVisibility)
  const accessHeader = compactActions
    ? canWrite
      ? "RW"
      : "RO"
    : translateUi(canWrite ? "◆ LEITURA + ESCRITA" : "◇ SOMENTE LEITURA")
  const favoriteHeader = activeSavedQuery
    ? ` · ★${favoriteDirty ? "●" : ""} ${activeSavedQuery.name}`
    : ""
  const queryHeader = compactActions
    ? `◆ SQL${favoriteHeader}`
    : `${translateUi("◆ EDITOR SQL")} · ${databaseDriverLabel(connection.driver)}${favoriteHeader}`

  const resultSummary = queryResultSummary(result, compactActions, queryHasMaskedValues)
  const windowLoadingStatus = queryWindow.loadingDirection
    ? `${queryWindow.loadingFrame} ${queryWindowLoadingLabel(queryWindow.loadingDirection)}`
    : ""

  return (
    <box
      ref={workspaceRef}
      id={queryElementId("workspace")}
      focusable
      style={{ flexGrow: 1, flexDirection: "column" }}
    >
      <box
        style={{
          height: 1,
          flexShrink: 0,
          flexDirection: "row",
          border: ["bottom"],
          borderColor: COLORS.border,
          backgroundColor: COLORS.panel,
        }}
      >
        {tabs.map((tab, index) => (
          <InlineButton
            key={tab.id}
            id={`database-query-tab-${tab.id}`}
            label={`[${index + 1}] ${shorten(tab.title, Math.max(5, Math.floor((availableWidth - 24) / tabs.length) - 4))}`}
            accent={COLORS.database}
            active={tab.id === activeTabId}
            onPress={() => onSelectTab(tab.id)}
          />
        ))}
        {tabs.length > 1 ? (
          <>
            <InlineButton
              label="[Alt+←]"
              accent={COLORS.database}
              onPress={() => onSwitchTab(-1)}
            />
            <InlineButton label="[Alt+→]" accent={COLORS.database} onPress={() => onSwitchTab(1)} />
          </>
        ) : null}
        <InlineButton
          label="[Ctrl+N] +"
          accent={COLORS.success}
          disabled={tabs.length >= SQL_TAB_LIMIT}
          onPress={onNewTab}
        />
        <InlineButton label="[Ctrl+W] ×" accent={COLORS.danger} onPress={() => onCloseTab(tabId)} />
      </box>
      <box
        style={{
          height: 1,
          flexShrink: 0,
          flexDirection: "row",
          justifyContent: "space-between",
          backgroundColor: COLORS.panelRaised,
        }}
      >
        <text
          content={truncateDisplay(
            `${queryHeader}${executedStatementPosition && executedStatementPosition.total > 1 ? ` · SQL ${executedStatementPosition.index + 1}/${executedStatementPosition.total}` : ""}`,
            Math.max(6, availableWidth - accessHeader.length - 2),
          )}
          style={{ flexGrow: 1, fg: COLORS.database }}
        />
        <text
          content={accessHeader}
          style={{ flexShrink: 0, fg: canWrite ? COLORS.warning : COLORS.success }}
        />
      </box>
      <box
        visible={editorVisible}
        style={{
          height: editorVisible ? editorHeight : 0,
          flexShrink: 0,
          overflow: "hidden",
          border: ["bottom"],
          borderColor: COLORS.border,
          backgroundColor: COLORS.canvas,
          paddingLeft: 1,
          paddingRight: 1,
        }}
      >
        <line-number
          id={queryElementId("line-numbers")}
          fg={COLORS.muted}
          bg={COLORS.panel}
          minWidth={3}
          paddingRight={1}
          showLineNumbers
          width="100%"
          height="100%"
          onMouseDown={focusQueryEditor}
        >
          <textarea
            ref={setEditorRef}
            id={queryElementId("editor")}
            initialValue=""
            placeholder={queryPlaceholder(connection)}
            keyBindings={[{ name: "a", ctrl: true, action: "submit" }]}
            onMouseDown={focusQueryEditor}
            onCursorChange={() => refreshAutocomplete(false)}
            onContentChange={() => {
              if (editorRef.current) {
                setEditorText(editorRef.current.plainText)
                applySqlSyntaxHighlights(editorRef.current, SQL_SYNTAX_STYLE, connection.driver)
              }
              refreshAutocomplete(false)
              if (writeConfirmation) setWriteConfirmation(null)
            }}
            onSubmit={() => void runQuery()}
            syntaxStyle={SQL_SYNTAX_STYLE}
            width="100%"
            height="100%"
            style={{
              backgroundColor: COLORS.canvas,
              focusedBackgroundColor: COLORS.canvas,
              textColor: COLORS.text,
              focusedTextColor: COLORS.text,
              placeholderColor: COLORS.muted,
              cursorColor: COLORS.database,
              selectionBg: RGBA.fromHex(COLORS.diffModifiedBg),
              wrapMode: "none",
            }}
          />
        </line-number>
        {autocomplete && visibleAutocompleteItems.length ? (
          <box
            style={{
              position: "absolute",
              top: autocompleteTop,
              left: autocompleteLeft,
              width: autocompleteWidth,
              height: autocompleteHeight,
              zIndex: 40,
              flexDirection: "column",
              border: ["left", "right"],
              borderColor: COLORS.database,
              backgroundColor: COLORS.panelRaised,
            }}
            onMouseScroll={(event) => {
              if (!event.scroll) return
              const direction =
                event.scroll.direction === "up" || event.scroll.direction === "left" ? -1 : 1
              const nextIndex = Math.max(
                0,
                Math.min(autocomplete.items.length - 1, autocomplete.selectedIndex + direction),
              )
              updateAutocomplete({ ...autocomplete, selectedIndex: nextIndex })
              event.preventDefault()
              event.stopPropagation()
            }}
          >
            <box
              style={{
                height: 1,
                flexShrink: 0,
                flexDirection: "row",
                justifyContent: "space-between",
                backgroundColor: COLORS.diffHunkBg,
                paddingLeft: 1,
                paddingRight: 1,
              }}
            >
              <text content={`◆ ${translateUi("AUTOCOMPLETE")}`} style={{ fg: COLORS.database }} />
              {autocompleteWidth >= 42 ? (
                <ShortcutText
                  content={`${autocomplete.selectedIndex + 1}/${autocomplete.items.length} · [↑↓] [Tab/Enter]`}
                  style={{ fg: COLORS.muted }}
                />
              ) : null}
            </box>
            {visibleAutocompleteItems.map((item, visibleIndex) => {
              const index = autocompleteWindowStart + visibleIndex
              const selected = index === autocomplete.selectedIndex
              const { accent, icon } = queryCompletionPresentation(item.kind)
              return (
                <Button
                  key={item.id}
                  height={1}
                  width="100%"
                  flexShrink={0}
                  onPress={() => acceptAutocomplete(index)}
                >
                  {(state) => (
                    <box
                      style={{
                        height: 1,
                        flexShrink: 0,
                        flexDirection: "row",
                        justifyContent: "space-between",
                        backgroundColor:
                          selected || state.focused ? COLORS.diffModifiedBg : COLORS.panelRaised,
                        paddingLeft: 1,
                        paddingRight: 1,
                      }}
                    >
                      <text
                        content={`${selected ? "›" : " "} ${icon} ${shorten(item.label, Math.max(8, Math.floor(autocompleteWidth * 0.48)))}`}
                        style={{ fg: selected ? COLORS.text : accent }}
                      />
                      {autocompleteWidth >= 42 ? (
                        <text
                          content={shorten(
                            item.detail,
                            Math.max(8, Math.floor(autocompleteWidth * 0.38)),
                          )}
                          style={{ fg: COLORS.muted }}
                        />
                      ) : null}
                    </box>
                  )}
                </Button>
              )
            })}
          </box>
        ) : null}
      </box>
      <box
        style={{
          height: 2,
          flexShrink: 0,
          flexDirection: "column",
        }}
      >
        <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
          <InlineButton
            label={
              busy
                ? compactActions
                  ? "[Ctrl+X] ×"
                  : "[Ctrl+X] Cancelar"
                : compactActions
                  ? writeConfirmation
                    ? "[Ctrl+A] !"
                    : "[Ctrl+A]"
                  : writeConfirmation
                    ? `[Ctrl+A] Confirmar ${writeConfirmation.command}`
                    : "[Ctrl+A] Executar atual"
            }
            accent={busy ? COLORS.danger : writeConfirmation ? COLORS.warning : COLORS.success}
            active={busy}
            onPress={() => (busy ? cancelQuery() : void runQuery())}
          />
          <InlineButton
            label={compactActions ? "[L]" : "[L] Limpar"}
            accent={COLORS.database}
            disabled={busy}
            onPress={clearQuery}
          />
          <InlineButton
            label={
              compactActions
                ? `[Ctrl+S]${activeSavedQuery ? (favoriteDirty ? "●" : "★") : "+"}`
                : activeSavedQuery
                  ? `[Ctrl+S] Atualizar favorita${favoriteDirty ? " ●" : ""}`
                  : "[Ctrl+S] Salvar favorita"
            }
            accent={COLORS.warning}
            disabled={busy}
            onPress={openSaveFavorite}
          />
          {!compactActions ? (
            <>
              <InlineButton
                label={`[Ctrl+F] Favoritas ${savedQueries.length}`}
                accent={COLORS.database}
                active={favoriteMode === "list"}
                onPress={openFavorites}
              />
              <InlineButton
                label={
                  querySensitiveVisibility === "confirm"
                    ? "[V] Confirmar sensíveis"
                    : querySensitiveVisibility === "visible"
                      ? "[V] Ocultar sensíveis"
                      : "[V] Revelar sensíveis"
                }
                accent={querySensitiveDataMasked ? COLORS.danger : COLORS.database}
                active={querySensitiveDataMasked}
                onPress={toggleQuerySensitiveData}
              />
              <InlineButton
                label={editorMode ? "[Esc] Desfocar" : "[Esc] Voltar"}
                accent={COLORS.muted}
                onPress={handleBack}
              />
            </>
          ) : null}
        </box>
        <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
          {compactActions ? (
            <>
              <InlineButton
                label={`[Ctrl+F]${savedQueries.length}`}
                accent={COLORS.database}
                active={favoriteMode === "list"}
                onPress={openFavorites}
              />
              <InlineButton
                label={
                  querySensitiveVisibility === "confirm"
                    ? "[V]!"
                    : querySensitiveVisibility === "visible"
                      ? "[V]◆"
                      : "[V]◇"
                }
                accent={querySensitiveDataMasked ? COLORS.danger : COLORS.database}
                active={querySensitiveDataMasked}
                onPress={toggleQuerySensitiveData}
              />
              <InlineButton label="[Esc]" accent={COLORS.muted} onPress={handleBack} />
            </>
          ) : null}
          <InlineButton
            label={compactActions ? "[Ctrl+↑]" : "[Ctrl+↑] Editor +"}
            accent={COLORS.database}
            disabled={editorRatio >= 70 && workspaceMode === "split"}
            onPress={() => resizeEditor(1)}
          />
          <InlineButton
            label={compactActions ? "[Ctrl+↓]" : "[Ctrl+↓] Editor −"}
            accent={COLORS.database}
            disabled={editorRatio <= 30 && workspaceMode === "split"}
            onPress={() => resizeEditor(-1)}
          />
          <InlineButton
            label={
              workspaceMode === "split"
                ? compactActions
                  ? "[F10] □"
                  : "[F10] Maximizar foco"
                : compactActions
                  ? "[F10] ◫"
                  : "[F10] Restaurar divisão"
            }
            accent={COLORS.database}
            active={workspaceMode !== "split"}
            onPress={toggleWorkspaceMaximize}
          />
          {!compactActions && availableWidth >= 95 ? (
            <ShortcutText
              content={`[Ctrl+Space] ${translateUi("Completar")} · ${shorten(connection.name, 24)}`}
              style={{ fg: COLORS.muted }}
            />
          ) : compactActions && availableWidth >= 48 ? (
            <ShortcutText
              content={` [Ctrl+Space] ${translateUi("Completar")}`}
              style={{ fg: COLORS.muted }}
            />
          ) : null}
        </box>
      </box>
      {writeConfirmation ? (
        <box
          style={{
            minHeight: 3,
            flexShrink: 0,
            border: true,
            borderStyle: "rounded",
            borderColor: COLORS.warning,
            paddingLeft: 1,
            paddingRight: 1,
          }}
        >
          <text
            content={`⚠ ${translateUi("CONFIRMAR")} ${writeConfirmation.command}`}
            style={{ fg: COLORS.warning }}
          />
          <text
            content={translateUi(
              "Este comando pode alterar o banco. Execute novamente para confirmar.",
            )}
            style={{ fg: COLORS.text }}
          />
        </box>
      ) : queryError ? (
        <box
          style={{
            minHeight: 3,
            flexShrink: 0,
            border: true,
            borderStyle: "rounded",
            borderColor: COLORS.danger,
            paddingLeft: 1,
            paddingRight: 1,
          }}
        >
          <text content={translateUi("ERRO SQL")} style={{ fg: COLORS.danger }} />
          <text content={translateUi(queryError)} style={{ fg: COLORS.text }} />
        </box>
      ) : (
        <text
          content={windowLoadingStatus || translateUi(resultNotice || resultSummary)}
          style={{
            height: 1,
            flexShrink: 0,
            fg:
              resultNotice && !windowLoadingStatus
                ? COLORS.warning
                : result
                  ? COLORS.database
                  : COLORS.muted,
          }}
        />
      )}
      {resultVisible ? (
        result?.columns.length ? (
          <>
            <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
              <InlineButton
                label={selectedResultRowMarked ? "[Space] ●" : "[Space] ○"}
                accent={COLORS.database}
                active={selectedResultRowMarked}
                disabled={!selectedResultGridRow}
                onPress={() => {
                  if (selectedResultGridRow) toggleResultBatchRow(selectedResultGridRow)
                }}
              />
              <InlineButton
                label={compactActions ? "[Alt+Space] Sel" : "[Alt+Space] Selecionar intervalo"}
                accent={COLORS.database}
                active={selectionSweep.active}
                disabled={!queryGridRows.length}
                onPress={selectionSweep.toggle}
              />
              {!resultBatchRows.length ? (
                <InlineButton
                  label={compactActions ? "[Ctrl+A]+" : translateUi("[Ctrl+A] Nova linha")}
                  accent={COLORS.runner}
                  disabled={!resultTableCanWrite || writeBusy}
                  onPress={createQueryResultRow}
                />
              ) : null}
              <InlineButton
                label={
                  resultBatchRows.length
                    ? compactActions
                      ? `[E]${resultBatchRows.length}`
                      : `[E] Editar ${resultBatchRows.length}`
                    : compactActions
                      ? "[E]"
                      : translateUi("[Enter] Editar célula")
                }
                accent={COLORS.warning}
                disabled={
                  resultBatchRows.length
                    ? !resultBatchCanWrite || !writableSelectedResultColumn || writeBusy
                    : !selectedResultRowCanWrite || writeBusy
                }
                onPress={openQueryResultCellEditor}
              />
              <InlineButton
                label={
                  resultBatchRows.length
                    ? compactActions
                      ? `[dd]${resultBatchRows.length}`
                      : `[dd] Excluir ${resultBatchRows.length}`
                    : compactActions
                      ? "[dd]"
                      : translateUi("[dd] Preparar exclusão")
                }
                accent={COLORS.danger}
                active={resultDeleteSequenceArmed}
                disabled={
                  resultBatchRows.length
                    ? !resultBatchCanWrite || writeBusy
                    : !selectedResultRowCanWrite || writeBusy
                }
                onPress={stageDeleteQueryResultRow}
              />
              {resultBatchRows.length ? (
                <InlineButton
                  label={
                    compactActions
                      ? `[X]${resultBatchRows.length}`
                      : `[X] Exportar ${resultBatchRows.length}`
                  }
                  accent={COLORS.database}
                  onPress={() => setResultBatchExportOpen(true)}
                />
              ) : null}
              <InlineButton
                label={
                  resultBatchRows.length && !compactActions
                    ? "[U] Desfazer selecionadas"
                    : compactActions
                      ? "[U]"
                      : translateUi("[U] Desfazer linha")
                }
                accent={COLORS.database}
                disabled={
                  resultBatchRows.length
                    ? !resultBatchHasChanges || writeBusy
                    : !selectedResultGridRow?.change || writeBusy
                }
                onPress={undoQueryResultChange}
              />
              <InlineButton
                label={
                  compactActions
                    ? `[Ctrl+S]${connectionStagedChangeCount}`
                    : translateUi(`[Ctrl+S] Revisar ${connectionStagedChangeCount}`)
                }
                accent={COLORS.success}
                active={connectionStagedChangeCount > 0}
                disabled={!connectionStagedChangeCount || writeBusy}
                onPress={onOpenChangesReview}
              />
              {!resultSideInspectorVisible ? (
                <InlineButton
                  label={compactActions ? "[I]" : translateUi("[I] Inspetor")}
                  accent={COLORS.database}
                  active={resultInspectorOnly}
                  onPress={() => focusResultPane(resultInspectorOnly ? "grid" : "inspector")}
                />
              ) : null}
            </box>
            <box style={{ flexGrow: 1, flexDirection: "row" }}>
              {!resultInspectorOnly ? (
                <box style={{ flexGrow: 1 }}>
                  <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
                    <Button
                      id={queryElementId("selection-sweep")}
                      onPress={selectionSweep.toggle}
                      height={1}
                      width={BATCH_SELECTOR_WIDTH}
                      flexShrink={0}
                    >
                      <text
                        content={selectionSweep.active ? "◆ " : "◇ "}
                        style={{
                          fg: selectionSweep.active ? COLORS.database : COLORS.muted,
                          bg: COLORS.panelRaised,
                        }}
                      />
                    </Button>
                    <text content="│" style={{ fg: COLORS.border, bg: COLORS.panelRaised }} />
                    {visibleColumns.map((column, visibleIndex) => {
                      const absoluteIndex = columnOffset + visibleIndex
                      const selected =
                        resultPane === "grid" && absoluteIndex === selectedResultGridColumnIndex
                      return (
                        <text
                          key={`${column}-${absoluteIndex}`}
                          content={fitCell(column, queryCellWidth)}
                          style={{
                            fg: selected ? selectionColors.foreground : COLORS.database,
                            bg: selected ? selectionColors.background : COLORS.panelRaised,
                          }}
                        />
                      )
                    })}
                  </box>
                  {/* biome-ignore lint/a11y/noStaticElementInteractions: capture row keys before native scroll */}
                  <scrollbox
                    ref={setResultScrollRef}
                    id={queryElementId("results")}
                    onKeyDown={selectionSweep.handleVerticalKey}
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
                    {queryGridRows.map((gridRow, rowIndex) => (
                      <DatabaseGridRowView
                        key={gridRow.id}
                        gridRow={gridRow}
                        rowIndex={rowIndex}
                        idPrefix={`database-query-${tabId}`}
                        rowIdSegment="result-row"
                        columns={visibleColumns}
                        columnOffset={columnOffset}
                        cellWidth={queryCellWidth}
                        separateCells={false}
                        selectedColumnIndex={
                          resultPane === "grid" && rowIndex === selectedResultRowIndex
                            ? selectedResultGridColumnIndex
                            : -1
                        }
                        batchSelected={resultBatchRowIds.has(
                          databaseBatchRowIdentity(gridRow.rowKey, gridRow.id),
                        )}
                        selectionForeground={selectionColors.foreground}
                        selectionBackground={selectionColors.background}
                        onToggleBatch={selectResultBatchRow}
                        onSelectCell={selectResultGridCell}
                      />
                    ))}
                  </scrollbox>
                </box>
              ) : null}
              {resultInspectorVisible ? (
                <RowInspector
                  columns={resultInspectorColumns}
                  row={selectedResultRow}
                  rowIndex={selectedResultRowIndex}
                  rowCount={queryGridRows.length}
                  width={resultInspectorOnly ? "100%" : resultInspectorWidth}
                  scrollRef={resultInspectorRef}
                  active={resultPane === "inspector"}
                  selectedColumnIndex={selectedResultColumnIndex}
                  onActivate={() => focusResultPane("inspector")}
                  onSelectColumn={(index) => {
                    selectedResultColumnIndexRef.current = index
                    setSelectedResultColumnIndex(index)
                  }}
                  idPrefix={queryElementId("inspector")}
                />
              ) : null}
            </box>
            <box
              style={{
                height: 1,
                flexShrink: 0,
                flexDirection: "row",
                justifyContent: "space-between",
              }}
            >
              <ShortcutText
                content={
                  compactActions
                    ? "[↑↓] · [H/←] [L/→] · [A]"
                    : translateUi("[↑↓] Linhas · [H/←] [L/→] Células/blocos · [A] Editor")
                }
                style={{ fg: COLORS.muted }}
              />
              {!resultInspectorOnly && result.columns.length > visibleColumnCount ? (
                <box style={{ flexDirection: "row" }}>
                  <InlineButton
                    label={compactActions ? "[←]" : "[←] Colunas"}
                    accent={COLORS.database}
                    disabled={columnOffset === 0}
                    onPress={() => setColumnOffset((current) => Math.max(0, current - 1))}
                  />
                  <InlineButton
                    label={compactActions ? "[→]" : "[→] Colunas"}
                    accent={COLORS.database}
                    disabled={columnOffset >= maxColumnOffset}
                    onPress={() =>
                      setColumnOffset((current) => Math.min(maxColumnOffset, current + 1))
                    }
                  />
                  <text
                    content={`${columnOffset + 1}–${Math.min(result.columns.length, columnOffset + visibleColumnCount)} / ${result.columns.length}`}
                    style={{ fg: COLORS.muted }}
                  />
                </box>
              ) : null}
            </box>
          </>
        ) : result ? (
          <box style={{ flexGrow: 1, alignItems: "center", justifyContent: "center" }}>
            <text
              content={
                result.mutating
                  ? translateUi("Comando executado com sucesso.")
                  : translateUi("A consulta não retornou linhas.")
              }
              style={{ fg: COLORS.success }}
            />
          </box>
        ) : (
          <box style={{ flexGrow: 1, alignItems: "center", justifyContent: "center" }}>
            <ShortcutText
              content={translateUi(
                compactActions
                  ? "[Ctrl+A] Executar SQL"
                  : "Escreva SQL acima e execute com [Ctrl+A]",
              )}
              style={{ fg: COLORS.muted }}
            />
          </box>
        )
      ) : null}
      <DatabaseCellEditor
        open={resultCellEditorOpen}
        tableName={resultTable ? `${resultTable.schema}.${resultTable.name}` : ""}
        column={writableSelectedResultColumn}
        value={
          writableSelectedResultColumn && selectedResultRow
            ? selectedResultRow[writableSelectedResultColumn.field]
            : null
        }
        isNewRow={selectedResultGridRow?.change?.mutation.kind === "insert"}
        batchRowCount={resultBatchRows.length}
        onClose={() => setResultCellEditorOpen(false)}
        onApply={resultBatchRows.length ? stageQueryBatchValue : stageQueryResultCellValue}
      />
      <DatabaseBatchExportModal
        open={resultBatchExportOpen}
        tableName={
          resultTable
            ? `${resultTable.schema}.${resultTable.name}`
            : (activeSavedQuery?.name ?? `SQL ${tabId}`)
        }
        columns={result?.columns ?? []}
        rows={resultBatchRows}
        onClose={() => {
          setResultBatchExportOpen(false)
          focusResultPane("grid")
        }}
      />
      <DatabaseQueryFavoritesModal
        mode={favoriteMode}
        connectionName={connection.name}
        availableWidth={availableWidth}
        queries={savedQueries}
        defaultName={activeSavedQuery?.name ?? suggestedQueryName(querySql, selectedTable)}
        sql={querySql}
        onClose={closeFavorites}
        onSave={saveFavorite}
        onLoad={loadFavorite}
        onDelete={deleteFavorite}
      />
    </box>
  )
}
