import type { InputRenderable, ScrollBoxRenderable, SelectRenderable } from "@opentui/core"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { Button } from "@tuiparts/react/button"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  COLORS,
  databaseSelectionColors,
  focusedPanelBorder,
  LAYOUT,
} from "@xupon/tuiminal-core/settings/theme"
import { translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { useNotifications } from "@xupon/tuiminal-core/notifications/index"
import {
  DEFAULT_SENSITIVE_VISIBILITY,
  nextSensitiveVisibility,
  type SensitiveVisibility,
  sensitiveDataIsMasked,
  sensitiveTermsSignature,
} from "@xupon/tuiminal-core/security/sensitive-data"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { DirectionalButton } from "@xupon/tuiminal-core/ui/DirectionalButton"
import { MountWhen } from "@xupon/tuiminal-core/ui/MountWhen"
import { ShortcutText } from "@xupon/tuiminal-core/ui/ShortcutText"
import { directionalShortcutDirection } from "@xupon/tuiminal-core/ui/directional-shortcut"
import { handleSelectMouseDown, handleSelectMouseScroll } from "@xupon/tuiminal-core/ui/selectMouse"
import { useDatabaseWorkspaceNotifications } from "./hooks/use-database-notifications"
import { useDatabaseSelectionSweep } from "./hooks/use-database-selection-sweep"
import { useDatabaseTableWindow } from "./hooks/use-database-table-window"
import {
  type DatabaseBatchSelectedRow,
  databaseBatchRowIdentity,
  databaseBatchSweepShortcut,
  toggleDatabaseBatchRow,
} from "./model/batch"
import {
  databaseActionRowCount,
  databaseHorizontalKeyDirection,
  databaseHorizontalNavigationAction,
  databaseLoadingInsets,
  databaseResultScrollTop,
  databaseSidebarWidth,
  nextDatabaseTableSort,
} from "./model/layout"
import { DATABASE_TABLE_WINDOW_SIZE } from "./model/table-window"
import { nextSqlTabIndex } from "./model/sql-workspace"
import type {
  DatabaseCatalog,
  DatabaseConnectionProfile,
  DatabaseIndex,
  DatabaseTable,
  DatabaseTableQuery,
  DatabaseTableStructure,
  TablePage,
} from "./model/types"
import {
  batchRow,
  type CatalogEntry,
  changeTableKey,
  type DatabaseGridRow,
  type DatabasePane,
  type DatabaseQueryRerunRequest,
  type DatabaseSqlTab,
  type DatabaseView,
  rowKeyFingerprint,
  type StagedDatabaseChange,
  stageBatchDeletes,
  stageBatchUpdates,
  tableKey,
  valuesMatch,
} from "./model/workspace"
import { DatabaseQueryWorkspace } from "./query/DatabaseQueryWorkspace"
import {
  BATCH_SELECTOR_WIDTH,
  CELL_WIDTH,
  COMPACT_ACTIONS_BREAKPOINT,
  EMPTY_TABLE_QUERY,
  LOADING_FRAMES,
  ROW_INSPECTOR_BREAKPOINT,
  SQL_TAB_LIMIT,
  TABLE_HISTORY_LIMIT,
} from "./rendering/constants"
import { fitCell, shorten, tableHistoryPresentation } from "./rendering/workspace-shared"
import { tableReadNotification } from "./rendering/table-read-notification"
import {
  applyTableMutations,
  databaseConnectionCanWrite,
  databaseDriverLabel,
  DatabaseMutationCommitUncertainError,
  getDefaultDatabaseConnectionId,
  listDatabaseConnections,
  listDatabaseTables,
  loadDatabaseTableStructure,
  loadTableIndexes,
  loadTablePage,
  previewTableMutation,
  setDefaultDatabaseConnection,
} from "./services/database"
import { DatabaseTutorialDemo } from "./tutorial/DatabaseTutorialDemo"
import { DatabaseBatchExportModal } from "./ui/DatabaseBatchExportModal"
import { DatabaseCellEditor } from "./ui/DatabaseCellEditor"
import { type DatabaseChangeReviewItem, DatabaseChangesModal } from "./ui/DatabaseChangesModal"
import { DatabaseConnectionModal } from "./ui/DatabaseConnectionModal"
import { DatabaseEmptyState } from "./ui/DatabaseEmptyState"
import { DatabaseLoadingOverlay } from "./ui/DatabaseLoadingOverlay"
import { DatabaseSchemaView } from "./ui/DatabaseSchemaView"
import { DatabaseTableSearchModal } from "./ui/DatabaseTableSearchModal"
import { RowInspector } from "./ui/RowInspector"

export function DatabaseViewer({
  active,
  tutorialMode = false,
  queryRerunRequest = null,
  onQueryRerunRequestHandled = () => undefined,
}: {
  active: boolean
  tutorialMode?: boolean
  queryRerunRequest?: DatabaseQueryRerunRequest | null
  onQueryRerunRequestHandled?: () => void
}) {
  const renderer = useRenderer()
  const terminal = useTerminalDimensions()
  const { notify } = useNotifications()
  const maskingTermsSignature = sensitiveTermsSignature()
  const searchRef = useRef<InputRenderable | null>(null)
  const tableListRef = useRef<SelectRenderable | null>(null)
  const tableGridScrollRef = useRef<ScrollBoxRenderable | null>(null)
  const rowInspectorRef = useRef<ScrollBoxRenderable | null>(null)
  const structureScrollRef = useRef<ScrollBoxRenderable | null>(null)
  const stagedChangeCounterRef = useRef(0)
  const selectedRowIndexRef = useRef(0)
  const selectedColumnIndexRef = useRef(0)
  const pendingSelectedRowIndexRef = useRef<number | null>(null)
  const sqlTabCounterRef = useRef(0)
  const activePaneRef = useRef<DatabasePane>("catalog")
  const deleteSequenceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const deleteSequenceArmedRef = useRef(false)
  const loadedCatalogKeyRef = useRef<string | null>(null)
  const loadedPageKeyRef = useRef<string | null>(null)
  const [connections, setConnections] = useState(listDatabaseConnections)
  const [activeConnectionId, setActiveConnectionId] = useState(getDefaultDatabaseConnectionId)
  const [connectionModalOpen, setConnectionModalOpen] = useState(false)
  const [connectionModalStartsInForm, setConnectionModalStartsInForm] = useState(false)
  const [connectionNotice, setConnectionNotice] = useState("")
  const [catalog, setCatalog] = useState<DatabaseCatalog | null>(null)
  const [search, setSearch] = useState("")
  const [selectedTable, setSelectedTable] = useState<DatabaseTable | null>(null)
  const [view, setView] = useState<DatabaseView>("data")
  const [columnOffset, setColumnOffset] = useState(0)
  const [pageData, setPageData] = useState<TablePage | null>(null)
  const [indexes, setIndexes] = useState<DatabaseIndex[] | null>(null)
  const [tableStructure, setTableStructure] = useState<DatabaseTableStructure | null>(null)
  const [schemaDiagramOpen, setSchemaDiagramOpen] = useState(false)
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [rowsLoading, setRowsLoading] = useState(false)
  const [indexesLoading, setIndexesLoading] = useState(false)
  const [structureLoading, setStructureLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [catalogRefreshKey, setCatalogRefreshKey] = useState(0)
  const [motionFrame, setMotionFrame] = useState(0)
  const [sensitiveVisibility, setSensitiveVisibility] = useState<SensitiveVisibility>(
    DEFAULT_SENSITIVE_VISIBILITY,
  )
  const [selectedRowIndex, setSelectedRowIndex] = useState(0)
  const [selectedColumnIndex, setSelectedColumnIndex] = useState(0)
  const [activePane, setActivePane] = useState<DatabasePane>("catalog")
  const [narrowDetailOpen, setNarrowDetailOpen] = useState(false)
  const [stagedChanges, setStagedChanges] = useState<StagedDatabaseChange[]>([])
  const [cellEditorOpen, setCellEditorOpen] = useState(false)
  const [changesModalOpen, setChangesModalOpen] = useState(false)
  const [changesModalNotice, setChangesModalNotice] = useState("")
  const [deleteSequenceArmed, setDeleteSequenceArmed] = useState(false)
  const [writeNotice, setWriteNotice] = useState("")
  const [writeBusy, setWriteBusy] = useState(false)
  const writeInFlightRef = useRef(false)
  const [batchRowsByTable, setBatchRowsByTable] = useState<
    Record<string, DatabaseBatchSelectedRow[]>
  >({})
  const [batchExportOpen, setBatchExportOpen] = useState(false)
  const [queryOpen, setQueryOpen] = useState(false)
  const [queryTabs, setQueryTabs] = useState<DatabaseSqlTab[]>([])
  const [activeQueryTabId, setActiveQueryTabId] = useState("")
  const [tableSearchOpen, setTableSearchOpen] = useState(false)
  const [tableQueries, setTableQueries] = useState<Record<string, DatabaseTableQuery>>({})
  const [tableHistoryByConnection, setTableHistoryByConnection] = useState<
    Record<string, DatabaseTable[]>
  >({})
  useDatabaseWorkspaceNotifications(connectionNotice, error, changesModalNotice, writeNotice)

  const activatePane = useCallback((pane: DatabasePane) => {
    activePaneRef.current = pane
    setActivePane(pane)
  }, [])
  const activeConnection = connections.find((profile) => profile.id === activeConnectionId) ?? null
  const notifyTableRead = useCallback(
    (sql: string) => {
      const preview = tableReadNotification(
        sql,
        activeConnection?.driver ?? "sqlite",
        Math.min(52, terminal.width - 6),
      )
      notify({ source: "Banco", title: "SELECT", kind: "info", durationMs: 7_000, ...preview })
    },
    [activeConnection?.driver, notify, terminal.width],
  )
  const activeTableQueryKey =
    activeConnectionId && selectedTable ? changeTableKey(activeConnectionId, selectedTable) : ""
  const activeTableQuery = activeTableQueryKey
    ? (tableQueries[activeTableQueryKey] ?? EMPTY_TABLE_QUERY)
    : EMPTY_TABLE_QUERY
  const activeTableQuerySignature = JSON.stringify(activeTableQuery)
  const activeTableSearch = activeTableQuery.search.trim()
  const tableHistory = activeConnectionId
    ? (tableHistoryByConnection[activeConnectionId] ?? [])
    : []
  const revealSensitive = sensitiveVisibility === "visible"
  const tableWindowContextKey = `${activeConnectionId}:${selectedTable ? tableKey(selectedTable) : ""}:${activeTableQuerySignature}:${refreshKey}:${revealSensitive}:${maskingTermsSignature}`
  const sensitiveDataMasked = sensitiveDataIsMasked(sensitiveVisibility)
  const connectionCanWrite = activeConnection ? databaseConnectionCanWrite(activeConnection) : false
  const sidebarWidth = databaseSidebarWidth(terminal.width)
  // Account for the outer gap, panel border and horizontal padding.
  const tableAreaWidth = Math.max(16, terminal.width - sidebarWidth - 7)
  const {
    itemWidth: historyItemWidth,
    currentIndex: currentTableHistoryIndex,
    visibleStart: visibleTableHistoryStart,
    visible: visibleTableHistory,
  } = tableHistoryPresentation(tableHistory, selectedTable, tableAreaWidth)
  const sideInspectorVisible =
    terminal.width >= ROW_INSPECTOR_BREAKPOINT &&
    view === "data" &&
    Boolean(selectedTable) &&
    !queryOpen
  const rowInspectorWidth = Math.max(28, Math.min(38, Math.floor(tableAreaWidth * 0.32)))
  const gridAreaWidth = Math.max(
    20,
    tableAreaWidth - (sideInspectorVisible ? rowInspectorWidth + 1 : 0),
  )
  const columnsPerView = Math.max(
    1,
    Math.floor((gridAreaWidth - BATCH_SELECTOR_WIDTH - 1) / (CELL_WIDTH + 1)),
  )
  const detailOnly =
    terminal.width < ROW_INSPECTOR_BREAKPOINT &&
    narrowDetailOpen &&
    view === "data" &&
    Boolean(selectedTable) &&
    !queryOpen
  const tablePageMissing = pageData === null
  const hasPrimaryKey = pageData?.columns.some((column) => column.key === "PRI") ?? false
  const tableCanWrite = connectionCanWrite && selectedTable?.type === "table"
  const compactActions = tableAreaWidth < COMPACT_ACTIONS_BREAKPOINT
  const actionRowCount = databaseActionRowCount(tableAreaWidth, view === "data")
  const veryNarrowActions = actionRowCount === 3
  const loadingInsets = databaseLoadingInsets({
    hasTableHistory: Boolean(tableHistory.length && selectedTable),
    hasSelectedTable: Boolean(selectedTable),
    actionRowCount,
    compactActions,
  })
  const compactEmptyState = terminal.height < 24 || terminal.width < 72
  const metadataNameWidth = Math.max(10, Math.min(28, Math.floor(tableAreaWidth * 0.34)))
  const metadataTypeWidth = Math.max(9, Math.min(24, Math.floor(tableAreaWidth * 0.3)))
  const metadataDetailWidth = Math.max(8, tableAreaWidth - metadataNameWidth - metadataTypeWidth)
  const indexNameWidth = Math.max(10, Math.min(28, Math.floor(tableAreaWidth * 0.32)))
  const indexTypeWidth = 9
  const indexDefinitionWidth = Math.max(8, tableAreaWidth - indexNameWidth - indexTypeWidth)
  const tableWindow = useDatabaseTableWindow({
    connectionId: activeConnectionId,
    table: selectedTable,
    query: activeTableQuery,
    revealSensitive,
    contextKey: tableWindowContextKey,
    page: pageData,
    setPage: setPageData,
    scrollRef: tableGridScrollRef,
    selectRow: (index) => {
      selectedRowIndexRef.current = index
      setSelectedRowIndex(index)
    },
    onQueryStart: notifyTableRead,
  })
  const tableWindowOffsetRef = useRef(tableWindow.offset)
  tableWindowOffsetRef.current = tableWindow.offset

  const filteredTables = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("pt-BR")
    if (!normalizedSearch) return catalog?.tables ?? []
    return (catalog?.tables ?? []).filter((table) =>
      `${table.schema}.${table.name}`.toLocaleLowerCase("pt-BR").includes(normalizedSearch),
    )
  }, [catalog, search])

  const catalogEntries = useMemo<CatalogEntry[]>(() => {
    const entries: CatalogEntry[] = []
    let previousSchema = ""
    for (const table of filteredTables) {
      if (table.schema !== previousSchema) {
        entries.push({
          name: `▾ ${table.schema}`,
          description: "schema",
          value: `schema:${table.schema}`,
          table: null,
        })
        previousSchema = table.schema
      }
      entries.push({
        name: `  ${table.type === "view" ? "◇" : "▦"} ${table.name}`,
        description: table.type,
        value: tableKey(table),
        table,
      })
    }
    return entries
  }, [filteredTables])

  const tableOptions = useMemo(
    () => catalogEntries.map(({ name, description, value }) => ({ name, description, value })),
    [catalogEntries],
  )
  const selectedCatalogTableIndex = catalogEntries.findIndex(
    (entry) => entry.table && selectedTable && tableKey(entry.table) === tableKey(selectedTable),
  )
  const selectedCatalogIndex =
    selectedCatalogTableIndex >= 0
      ? selectedCatalogTableIndex
      : search.trim()
        ? Math.max(
            0,
            catalogEntries.findIndex((entry) => entry.table),
          )
        : 0
  const visibleColumns = useMemo(
    () => (pageData?.columns ?? []).slice(columnOffset, columnOffset + columnsPerView),
    [columnOffset, columnsPerView, pageData],
  )
  const maxColumnOffset = Math.max(0, (pageData?.columns.length ?? 0) - columnsPerView)
  const currentTableChangeKey =
    activeConnectionId && selectedTable ? changeTableKey(activeConnectionId, selectedTable) : ""
  const currentTableChanges = useMemo(
    () =>
      stagedChanges.filter(
        (change) => changeTableKey(change.connectionId, change.table) === currentTableChangeKey,
      ),
    [currentTableChangeKey, stagedChanges],
  )
  const activeConnectionChanges = useMemo(
    () => stagedChanges.filter((change) => change.connectionId === activeConnectionId),
    [activeConnectionId, stagedChanges],
  )
  const gridRows = useMemo<DatabaseGridRow[]>(() => {
    const changesByRowKey = new Map<string, StagedDatabaseChange>()
    for (const change of currentTableChanges) {
      if (change.mutation.kind !== "insert") {
        changesByRowKey.set(rowKeyFingerprint(change.mutation.rowKey), change)
      }
    }
    const persistedRows = (pageData?.rows ?? []).map((row, index) => {
      const rowKey = pageData?.rowKeys[index] ?? null
      const change = rowKey ? (changesByRowKey.get(rowKeyFingerprint(rowKey)) ?? null) : null
      return {
        id: `persisted-${tableWindow.offset + index}`,
        data: change?.mutation.kind === "update" ? { ...row, ...change.mutation.values } : row,
        rowKey,
        change,
      }
    })
    const insertedRows = currentTableChanges
      .filter((change) => change.mutation.kind === "insert")
      .map((change) => ({
        id: change.id,
        data: change.mutation.kind === "insert" ? change.mutation.values : {},
        rowKey: null,
        change,
      }))
    return [...persistedRows, ...insertedRows]
  }, [currentTableChanges, pageData, tableWindow.offset])
  const currentBatchRows = currentTableChangeKey
    ? (batchRowsByTable[currentTableChangeKey] ?? [])
    : []
  const currentBatchRowIds = useMemo(
    () => new Set(currentBatchRows.map((row) => row.id)),
    [currentBatchRows],
  )
  const selectedGridRow = gridRows[selectedRowIndex] ?? null
  const selectedBatchRowId = selectedGridRow
    ? databaseBatchRowIdentity(selectedGridRow.rowKey, selectedGridRow.id)
    : null
  const selectedRowMarked = selectedBatchRowId ? currentBatchRowIds.has(selectedBatchRowId) : false
  const selectedRow = selectedGridRow?.data ?? null
  const selectedRowKey = selectedGridRow?.rowKey ?? null
  const selectedColumn = pageData?.columns[selectedColumnIndex] ?? null
  const tableWriteBlockReason = !connectionCanWrite
    ? "Conexão em somente leitura. Use [C] > [E] e habilite LEITURA + ESCRITA."
    : selectedTable?.type !== "table"
      ? "Views são somente leitura e não podem ser alteradas por esta tela."
      : !selectedTable
        ? "Selecione uma tabela antes de preparar alterações."
        : null
  const rowWriteBlockReason =
    tableWriteBlockReason ??
    (!selectedGridRow
      ? "Selecione uma linha antes de editar ou excluir."
      : selectedGridRow.change?.mutation.kind === "insert"
        ? null
        : !hasPrimaryKey
          ? "Esta tabela não tem chave primária; edição e exclusão estão bloqueadas."
          : !selectedRowKey
            ? "Não foi possível identificar esta linha pela chave primária."
            : null)
  const selectedRowCanWrite =
    tableCanWrite &&
    (selectedGridRow?.change?.mutation.kind === "insert" ||
      (hasPrimaryKey && Boolean(selectedRowKey)))
  const batchRowsCanWrite =
    currentBatchRows.length > 0 &&
    tableCanWrite &&
    hasPrimaryKey &&
    currentBatchRows.every((row) => Boolean(row.rowKey && Object.keys(row.rowKey).length))
  const batchWriteBlockReason =
    tableWriteBlockReason ??
    (!hasPrimaryKey
      ? "Esta tabela não tem chave primária; a alteração em lote está bloqueada."
      : "Uma ou mais linhas selecionadas não puderam ser identificadas pela chave primária.")
  const currentBatchChangeKeys = new Set(
    currentBatchRows.flatMap((row) => (row.rowKey ? [rowKeyFingerprint(row.rowKey)] : [])),
  )
  const currentBatchHasChanges = currentTableChanges.some(
    (change) =>
      change.mutation.kind !== "insert" &&
      currentBatchChangeKeys.has(rowKeyFingerprint(change.mutation.rowKey)),
  )
  const selectionColors = databaseSelectionColors()

  const createQueryTab = useCallback(
    (title?: string) => {
      if (queryTabs.length >= SQL_TAB_LIMIT) return
      sqlTabCounterRef.current += 1
      const id = `sql-${sqlTabCounterRef.current}`
      const tab: DatabaseSqlTab = {
        id,
        title: title ?? `SQL ${sqlTabCounterRef.current}`,
      }
      setQueryTabs((current) => [...current, tab])
      setActiveQueryTabId(id)
      setQueryOpen(true)
      setNarrowDetailOpen(false)
      activatePane("grid")
    },
    [activatePane, queryTabs.length],
  )

  const resetTable = useCallback(() => {
    pendingSelectedRowIndexRef.current = null
    tableWindow.reset()
    setSelectedTable(null)
    setColumnOffset(0)
    setPageData(null)
    setIndexes(null)
    setTableStructure(null)
    setView("data")
    setSensitiveVisibility(DEFAULT_SENSITIVE_VISIBILITY)
    selectedRowIndexRef.current = 0
    setSelectedRowIndex(0)
    selectedColumnIndexRef.current = 0
    setSelectedColumnIndex(0)
    activatePane("catalog")
    setNarrowDetailOpen(false)
    setCellEditorOpen(false)
    setBatchExportOpen(false)
    setChangesModalOpen(false)
    setWriteNotice("")
    deleteSequenceArmedRef.current = false
    setDeleteSequenceArmed(false)
    setError(null)
    setQueryOpen(false)
    setQueryTabs([])
    setActiveQueryTabId("")
  }, [activatePane, tableWindow.reset])

  const switchConnection = useCallback(
    (profile: DatabaseConnectionProfile) => {
      setDefaultDatabaseConnection(profile.id)
      setActiveConnectionId(profile.id)
      setCatalogRefreshKey((current) => current + 1)
      setConnectionModalOpen(false)
      setConnectionNotice(`Conectando a ${profile.name}…`)
      resetTable()
    },
    [resetTable],
  )

  useEffect(() => {
    if (!queryRerunRequest) return
    const profile = connections.find(
      (connection) => connection.id === queryRerunRequest.connectionId,
    )
    if (!profile) {
      onQueryRerunRequestHandled()
      return
    }
    if (activeConnectionId !== profile.id) {
      switchConnection(profile)
      return
    }
    if (!queryTabs.length) createQueryTab("Histórico")
    else setQueryOpen(true)
    setNarrowDetailOpen(false)
    activatePane("grid")
  }, [
    activatePane,
    activeConnectionId,
    connections,
    createQueryTab,
    onQueryRerunRequestHandled,
    queryRerunRequest,
    queryTabs.length,
    switchConnection,
  ])

  const openTable = useCallback(
    (table: DatabaseTable, recordHistory = true) => {
      pendingSelectedRowIndexRef.current = null
      tableWindow.reset()
      if (recordHistory && activeConnectionId) {
        setTableHistoryByConnection((current) => {
          const connectionHistory = current[activeConnectionId] ?? []
          if (connectionHistory.some((entry) => tableKey(entry) === tableKey(table))) {
            return current
          }
          return {
            ...current,
            [activeConnectionId]: [...connectionHistory, table].slice(-TABLE_HISTORY_LIMIT),
          }
        })
      }
      setSelectedTable({ ...table })
      setColumnOffset(0)
      setPageData(null)
      setIndexes(null)
      setTableStructure(null)
      setView("data")
      setSensitiveVisibility(DEFAULT_SENSITIVE_VISIBILITY)
      selectedRowIndexRef.current = 0
      setSelectedRowIndex(0)
      selectedColumnIndexRef.current = 0
      setSelectedColumnIndex(0)
      activatePane("grid")
      setNarrowDetailOpen(false)
      setCellEditorOpen(false)
      setWriteNotice("")
      deleteSequenceArmedRef.current = false
      setDeleteSequenceArmed(false)
      setError(null)
      setQueryOpen(false)
      setTimeout(() => tableListRef.current?.blur(), 0)
    },
    [activatePane, activeConnectionId, tableWindow.reset],
  )

  const navigateTableHistory = useCallback(
    (direction: -1 | 1) => {
      if (tableHistory.length < 2) return
      const nextIndex =
        currentTableHistoryIndex < 0
          ? direction > 0
            ? 0
            : tableHistory.length - 1
          : Math.max(0, Math.min(tableHistory.length - 1, currentTableHistoryIndex + direction))
      const nextTable = tableHistory[nextIndex]
      if (nextTable && nextIndex !== currentTableHistoryIndex) openTable(nextTable, false)
    },
    [currentTableHistoryIndex, openTable, tableHistory],
  )

  const openQueryWorkspace = useCallback(() => {
    if (!queryTabs.length) createQueryTab()
    else setQueryOpen(true)
  }, [createQueryTab, queryTabs.length])

  const focusPane = useCallback(
    (pane: DatabasePane) => {
      activatePane(pane)
      if (pane === "catalog") {
        setNarrowDetailOpen(false)
        tableListRef.current?.focus()
        setTimeout(() => tableListRef.current?.focus(), 0)
        return
      }

      renderer.currentFocusedRenderable?.blur()
      if (terminal.width < ROW_INSPECTOR_BREAKPOINT) {
        setNarrowDetailOpen(pane === "inspector")
      }
    },
    [activatePane, renderer, terminal.width],
  )

  const closeQueryTab = useCallback(
    (tabId: string) => {
      const index = queryTabs.findIndex((tab) => tab.id === tabId)
      if (index < 0) return
      const remaining = queryTabs.filter((tab) => tab.id !== tabId)
      setQueryTabs(remaining)
      if (!remaining.length) {
        setActiveQueryTabId("")
        setQueryOpen(false)
        focusPane(selectedTable ? "grid" : "catalog")
        return
      }
      if (activeQueryTabId === tabId) {
        setActiveQueryTabId(remaining[Math.min(index, remaining.length - 1)]?.id ?? "")
      }
    },
    [activeQueryTabId, focusPane, queryTabs, selectedTable],
  )

  const switchQueryTab = useCallback(
    (direction: -1 | 1) => {
      const currentIndex = Math.max(
        0,
        queryTabs.findIndex((tab) => tab.id === activeQueryTabId),
      )
      const nextIndex = nextSqlTabIndex(currentIndex, queryTabs.length, direction)
      const nextTab = queryTabs[nextIndex]
      if (nextTab) setActiveQueryTabId(nextTab.id)
    },
    [activeQueryTabId, queryTabs],
  )

  const closeQueryWorkspace = useCallback(() => {
    setQueryOpen(false)
    focusPane(selectedTable ? "grid" : "catalog")
  }, [focusPane, selectedTable])

  const movePaneFocus = useCallback(
    (direction: -1 | 1) => {
      const panes: DatabasePane[] = ["catalog"]
      if (selectedTable) panes.push("grid")
      if (selectedTable && view === "data") panes.push("inspector")
      const currentIndex = Math.max(0, panes.indexOf(activePaneRef.current))
      const nextIndex = Math.max(0, Math.min(panes.length - 1, currentIndex + direction))
      const nextPane = panes[nextIndex]
      if (nextPane) focusPane(nextPane)
    },
    [focusPane, selectedTable, view],
  )

  const moveSelectedRow = useCallback(
    (delta: number) => {
      if (rowsLoading) return
      const current = selectedRowIndexRef.current
      const lastIndex = Math.max(0, gridRows.length - 1)
      const next = Math.max(0, Math.min(lastIndex, current + delta))
      if (next === current && (delta < 0 ? current === 0 : current === lastIndex)) {
        void tableWindow.load(delta < 0 ? -1 : 1)
        return
      }
      selectedRowIndexRef.current = next
      setSelectedRowIndex(next)
    },
    [gridRows.length, rowsLoading, tableWindow.load],
  )

  const applyTableQuery = useCallback(
    (nextQuery: DatabaseTableQuery, preserveColumn = false) => {
      if (!activeConnectionId || !selectedTable) return
      const queryKey = changeTableKey(activeConnectionId, selectedTable)
      setTableQueries((current) => ({ ...current, [queryKey]: nextQuery }))
      tableWindow.reset()
      loadedPageKeyRef.current = null
      pendingSelectedRowIndexRef.current = 0
      selectedRowIndexRef.current = 0
      setSelectedRowIndex(0)
      if (!preserveColumn) {
        selectedColumnIndexRef.current = 0
        setSelectedColumnIndex(0)
        setColumnOffset(0)
      }
      if (!preserveColumn) setPageData(null)
      setTableSearchOpen(false)
      focusPane("grid")
    },
    [activeConnectionId, focusPane, selectedTable, tableWindow.reset],
  )

  const cycleTableSort = useCallback(() => {
    const column = pageData?.columns[selectedColumnIndexRef.current]
    if (!column) return
    const nextSort = nextDatabaseTableSort(activeTableQuery.sort, column.field)
    applyTableQuery({ ...activeTableQuery, sort: nextSort }, true)
  }, [activeTableQuery, applyTableQuery, pageData?.columns])

  const moveSelectedColumn = useCallback(
    (delta: number) => {
      setSelectedColumnIndex((current) => {
        const lastIndex = Math.max(0, (pageData?.columns.length ?? 1) - 1)
        const next = Math.max(0, Math.min(lastIndex, current + delta))
        selectedColumnIndexRef.current = next
        setColumnOffset((currentOffset) => {
          if (next < currentOffset) return next
          if (next >= currentOffset + columnsPerView) return next - columnsPerView + 1
          return currentOffset
        })
        return next
      })
    },
    [columnsPerView, pageData?.columns.length],
  )

  const navigateHorizontally = useCallback(
    (direction: -1 | 1) => {
      const navigationAction = databaseHorizontalNavigationAction({
        pane: activePaneRef.current,
        direction,
        hasSelectedTable: Boolean(selectedTable),
        dataView: view === "data",
        selectedColumnIndex: selectedColumnIndexRef.current,
        columnCount: pageData?.columns.length ?? 0,
      })
      if (!navigationAction) return false
      if (navigationAction === "previous-column") moveSelectedColumn(-1)
      else if (navigationAction === "next-column") moveSelectedColumn(1)
      else movePaneFocus(navigationAction === "previous-pane" ? -1 : 1)
      return true
    },
    [movePaneFocus, moveSelectedColumn, pageData?.columns.length, selectedTable, view],
  )

  const updateCurrentBatchRows = useCallback(
    (update: (current: DatabaseBatchSelectedRow[]) => DatabaseBatchSelectedRow[]) => {
      if (!currentTableChangeKey) return
      setBatchRowsByTable((current) => {
        const nextRows = update(current[currentTableChangeKey] ?? [])
        if (nextRows.length) return { ...current, [currentTableChangeKey]: nextRows }
        const next = { ...current }
        delete next[currentTableChangeKey]
        return next
      })
    },
    [currentTableChangeKey],
  )

  const toggleCurrentBatchRow = useCallback(
    (gridRow: DatabaseGridRow) => {
      const row = batchRow(gridRow)
      updateCurrentBatchRows((current) => toggleDatabaseBatchRow(current, row))
    },
    [updateCurrentBatchRows],
  )

  const selectionSweep = useDatabaseSelectionSweep({
    rows: gridRows,
    selectedIndexRef: selectedRowIndexRef,
    updateSelectedRows: updateCurrentBatchRows,
    moveRow: moveSelectedRow,
    resetKey: `${currentTableChangeKey}:${tableWindow.offset}`,
  })

  const clearCurrentBatchRows = useCallback(() => {
    updateCurrentBatchRows(() => [])
  }, [updateCurrentBatchRows])

  const stageCurrentBatchValue = useCallback(
    (value: unknown) => {
      if (
        !activeConnectionId ||
        !activeConnection ||
        !selectedTable ||
        !pageData ||
        !selectedColumn ||
        !batchRowsCanWrite
      ) {
        setWriteNotice(`⚠ ${batchWriteBlockReason}`)
        return
      }
      const staged = stageBatchUpdates({
        current: stagedChanges,
        rows: currentBatchRows,
        connectionId: activeConnectionId,
        connectionName: activeConnection.name,
        table: selectedTable,
        columns: pageData.columns,
        column: selectedColumn,
        value,
        nextId: () => `update-${Date.now()}-${++stagedChangeCounterRef.current}`,
      })
      setStagedChanges(staged.changes)
      updateCurrentBatchRows((current) =>
        current.map((row) => ({
          ...row,
          data: { ...row.data, [selectedColumn.field]: value },
        })),
      )
      setCellEditorOpen(false)
      setWriteNotice(
        staged.stagedCount
          ? `◆ ${staged.stagedCount} linha(s) alterada(s) localmente · [Ctrl+S] para revisar`
          : "Nenhuma linha selecionada pôde ser alterada.",
      )
    },
    [
      activeConnection,
      activeConnectionId,
      batchRowsCanWrite,
      batchWriteBlockReason,
      currentBatchRows,
      pageData,
      selectedColumn,
      selectedTable,
      stagedChanges,
      updateCurrentBatchRows,
    ],
  )

  const stageDeleteCurrentBatch = useCallback(() => {
    if (
      !activeConnectionId ||
      !activeConnection ||
      !selectedTable ||
      !pageData ||
      !batchRowsCanWrite
    ) {
      setWriteNotice(`⚠ ${batchWriteBlockReason}`)
      return
    }
    const staged = stageBatchDeletes({
      current: stagedChanges,
      rows: currentBatchRows,
      connectionId: activeConnectionId,
      connectionName: activeConnection.name,
      table: selectedTable,
      columns: pageData.columns,
      nextId: () => `delete-${Date.now()}-${++stagedChangeCounterRef.current}`,
    })
    setStagedChanges(staged.changes)
    setWriteNotice(
      staged.stagedCount
        ? `− ${staged.stagedCount} linha(s) marcada(s) em vermelho · nada foi excluído ainda`
        : "Nenhuma linha selecionada pôde ser excluída.",
    )
  }, [
    activeConnection,
    activeConnectionId,
    batchRowsCanWrite,
    batchWriteBlockReason,
    currentBatchRows,
    pageData,
    selectedTable,
    stagedChanges,
  ])

  const undoCurrentBatchChanges = useCallback(() => {
    if (!currentBatchRows.length) return false
    const rowKeys = new Set(
      currentBatchRows.flatMap((row) => (row.rowKey ? [rowKeyFingerprint(row.rowKey)] : [])),
    )
    const nextChanges = stagedChanges.filter((change) => {
      const matchesTable =
        changeTableKey(change.connectionId, change.table) === currentTableChangeKey
      const matchesRow =
        change.mutation.kind !== "insert" && rowKeys.has(rowKeyFingerprint(change.mutation.rowKey))
      return !matchesTable || !matchesRow
    })
    const removedCount = stagedChanges.length - nextChanges.length
    setStagedChanges(nextChanges)
    const originals = new Map(
      stagedChanges.flatMap((change) =>
        changeTableKey(change.connectionId, change.table) === currentTableChangeKey &&
        change.mutation.kind !== "insert" &&
        change.originalRow
          ? [[rowKeyFingerprint(change.mutation.rowKey), change.originalRow] as const]
          : [],
      ),
    )
    updateCurrentBatchRows((current) =>
      current.map((row) => {
        if (!row.rowKey) return row
        const original = originals.get(rowKeyFingerprint(row.rowKey))
        return original ? { ...row, data: original } : row
      }),
    )
    setWriteNotice(
      removedCount
        ? `${removedCount} alteração(ões) selecionada(s) desfeita(s)`
        : "As linhas selecionadas não possuem alterações preparadas.",
    )
    return true
  }, [currentBatchRows, currentTableChangeKey, stagedChanges, updateCurrentBatchRows])

  const createNewRow = useCallback(() => {
    if (!activeConnectionId || !activeConnection || !selectedTable || !pageData || !tableCanWrite) {
      return
    }
    stagedChangeCounterRef.current += 1
    const change: StagedDatabaseChange = {
      id: `insert-${Date.now()}-${stagedChangeCounterRef.current}`,
      connectionId: activeConnectionId,
      connectionName: activeConnection.name,
      table: selectedTable,
      columns: pageData.columns,
      mutation: { kind: "insert", values: {} },
      originalRow: null,
      approved: false,
    }
    setStagedChanges((current) => [...current, change])
    selectedRowIndexRef.current = gridRows.length
    setSelectedRowIndex(gridRows.length)
    selectedColumnIndexRef.current = 0
    setSelectedColumnIndex(0)
    setColumnOffset(0)
    activatePane("inspector")
    if (terminal.width < ROW_INSPECTOR_BREAKPOINT) setNarrowDetailOpen(true)
    renderer.currentFocusedRenderable?.blur()
    setDeleteSequenceArmed(false)
    setWriteNotice("+ Nova linha preparada · preencha os campos no inspetor e use [Ctrl+S]")
  }, [
    activeConnection,
    activeConnectionId,
    activatePane,
    gridRows.length,
    pageData,
    renderer,
    selectedTable,
    tableCanWrite,
    terminal.width,
  ])

  const openCellEditor = useCallback(() => {
    const targetGridRow = gridRows[selectedRowIndexRef.current] ?? selectedGridRow
    const targetColumn = pageData?.columns[selectedColumnIndexRef.current] ?? selectedColumn
    if (currentBatchRows.length) {
      if (!batchRowsCanWrite || !targetColumn) {
        setWriteNotice(`⚠ ${batchWriteBlockReason}`)
        return
      }
      setDeleteSequenceArmed(false)
      setCellEditorOpen(true)
      return
    }
    const targetCanWrite =
      tableCanWrite &&
      Boolean(targetGridRow) &&
      (targetGridRow?.change?.mutation.kind === "insert" ||
        (hasPrimaryKey && Boolean(targetGridRow?.rowKey)))
    if (!targetCanWrite || !targetGridRow || !targetColumn) return
    if (targetGridRow.change?.mutation.kind === "delete") {
      setWriteNotice("Esta linha está marcada para exclusão. Use [U] para desfazer.")
      return
    }
    setDeleteSequenceArmed(false)
    setCellEditorOpen(true)
  }, [
    batchRowsCanWrite,
    batchWriteBlockReason,
    currentBatchRows.length,
    gridRows,
    hasPrimaryKey,
    pageData?.columns,
    selectedColumn,
    selectedGridRow,
    tableCanWrite,
  ])

  const stageCellValue = useCallback(
    (value: unknown) => {
      if (
        !activeConnectionId ||
        !activeConnection ||
        !selectedTable ||
        !pageData ||
        !selectedGridRow ||
        !selectedColumn
      )
        return

      if (selectedGridRow.change?.mutation.kind === "insert") {
        setStagedChanges((current) =>
          current.map((change) =>
            change.id === selectedGridRow.change?.id && change.mutation.kind === "insert"
              ? {
                  ...change,
                  approved: false,
                  mutation: {
                    ...change.mutation,
                    values: { ...change.mutation.values, [selectedColumn.field]: value },
                  },
                }
              : change,
          ),
        )
        setWriteNotice(`+ ${selectedColumn.field} preparada na nova linha`)
        setCellEditorOpen(false)
        return
      }

      if (!selectedRowKey) return
      const fingerprint = rowKeyFingerprint(selectedRowKey)
      const originalRow =
        selectedGridRow.change?.originalRow ??
        pageData.rows[selectedRowIndex] ??
        selectedGridRow.data
      const restoredOriginalValue = valuesMatch(originalRow[selectedColumn.field], value)
      setStagedChanges((current) => {
        const existingIndex = current.findIndex(
          (change) =>
            changeTableKey(change.connectionId, change.table) === currentTableChangeKey &&
            change.mutation.kind !== "insert" &&
            rowKeyFingerprint(change.mutation.rowKey) === fingerprint,
        )
        const existing = existingIndex >= 0 ? current[existingIndex] : null
        const currentValues = existing?.mutation.kind === "update" ? existing.mutation.values : {}
        const nextValues = { ...currentValues, [selectedColumn.field]: value }
        if (restoredOriginalValue) {
          delete nextValues[selectedColumn.field]
        }
        if (!Object.keys(nextValues).length) {
          return existingIndex >= 0
            ? current.filter((_change, index) => index !== existingIndex)
            : current
        }
        const nextChange: StagedDatabaseChange = {
          id: existing?.id ?? `update-${Date.now()}-${++stagedChangeCounterRef.current}`,
          connectionId: activeConnectionId,
          connectionName: activeConnection.name,
          table: selectedTable,
          columns: pageData.columns,
          mutation: { kind: "update", rowKey: selectedRowKey, values: nextValues },
          originalRow,
          approved: false,
        }
        if (existingIndex < 0) return [...current, nextChange]
        return current.map((change, index) => (index === existingIndex ? nextChange : change))
      })
      setWriteNotice(
        restoredOriginalValue
          ? `◇ ${selectedColumn.field} voltou ao valor original`
          : `◆ ${selectedColumn.field} alterada localmente · [Ctrl+S] para revisar`,
      )
      setCellEditorOpen(false)
    },
    [
      activeConnection,
      activeConnectionId,
      currentTableChangeKey,
      pageData,
      selectedColumn,
      selectedGridRow,
      selectedRowIndex,
      selectedRowKey,
      selectedTable,
    ],
  )

  const stageDeleteSelectedRow = useCallback(() => {
    if (currentBatchRows.length) {
      stageDeleteCurrentBatch()
      return
    }
    const targetGridRow = gridRows[selectedRowIndexRef.current] ?? selectedGridRow
    const targetRowKey = targetGridRow?.rowKey ?? null
    if (
      !targetGridRow ||
      !selectedTable ||
      !pageData ||
      !activeConnectionId ||
      !activeConnection ||
      (!targetRowKey && targetGridRow.change?.mutation.kind !== "insert")
    )
      return
    if (targetGridRow.change?.mutation.kind === "insert") {
      setStagedChanges((current) =>
        current.filter((change) => change.id !== targetGridRow.change?.id),
      )
      setSelectedRowIndex((current) => {
        const next = Math.max(0, current - 1)
        selectedRowIndexRef.current = next
        return next
      })
      setWriteNotice("Nova linha descartada")
      return
    }
    if (!targetRowKey || !hasPrimaryKey) return
    const fingerprint = rowKeyFingerprint(targetRowKey)
    setStagedChanges((current) => {
      const existingIndex = current.findIndex(
        (change) =>
          changeTableKey(change.connectionId, change.table) === currentTableChangeKey &&
          change.mutation.kind !== "insert" &&
          rowKeyFingerprint(change.mutation.rowKey) === fingerprint,
      )
      const existing = existingIndex >= 0 ? current[existingIndex] : null
      const nextChange: StagedDatabaseChange = {
        id: existing?.id ?? `delete-${Date.now()}-${++stagedChangeCounterRef.current}`,
        connectionId: activeConnectionId,
        connectionName: activeConnection.name,
        table: selectedTable,
        columns: pageData.columns,
        mutation: { kind: "delete", rowKey: targetRowKey },
        originalRow: existing?.originalRow ?? targetGridRow.data,
        approved: false,
      }
      if (existingIndex < 0) return [...current, nextChange]
      return current.map((change, index) => (index === existingIndex ? nextChange : change))
    })
    setWriteNotice("− Linha marcada em vermelho · nada foi excluído ainda")
  }, [
    activeConnection,
    activeConnectionId,
    currentTableChangeKey,
    currentBatchRows.length,
    gridRows,
    hasPrimaryKey,
    pageData,
    selectedGridRow,
    selectedTable,
    stageDeleteCurrentBatch,
  ])

  const undoSelectedChange = useCallback(() => {
    if (currentBatchRows.length && undoCurrentBatchChanges()) return
    const changeId = selectedGridRow?.change?.id
    if (!changeId) return
    setStagedChanges((current) => current.filter((change) => change.id !== changeId))
    setSelectedRowIndex((current) => {
      const next = Math.min(current, Math.max(0, gridRows.length - 2))
      selectedRowIndexRef.current = next
      return next
    })
    setWriteNotice("Alteração local desfeita")
  }, [
    currentBatchRows.length,
    gridRows.length,
    selectedGridRow?.change?.id,
    undoCurrentBatchChanges,
  ])

  const reviewItems = useMemo<DatabaseChangeReviewItem[]>(
    () =>
      activeConnectionChanges.map((change) => {
        try {
          const preview = previewTableMutation(
            change.connectionId,
            change.table,
            change.columns,
            change.mutation,
          )
          const description =
            change.mutation.kind === "insert"
              ? `${Object.keys(change.mutation.values).length} campo(s)`
              : change.mutation.kind === "update"
                ? `${Object.keys(change.mutation.values).join(", ")}`
                : Object.entries(change.mutation.rowKey)
                    .map(([field, value]) => `${field}=${String(value)}`)
                    .join(", ")
          return {
            id: change.id,
            kind: change.mutation.kind,
            tableName: `${change.table.schema}.${change.table.name} · ${change.connectionName}`,
            sql: preview.sql,
            parameters: preview.parameters,
            approved: change.approved,
            description,
          }
        } catch (previewError) {
          return {
            id: change.id,
            kind: change.mutation.kind,
            tableName: `${change.table.schema}.${change.table.name} · ${change.connectionName}`,
            sql: `ERRO: ${previewError instanceof Error ? previewError.message : "preview indisponível"}`,
            parameters: [],
            approved: false,
            description: "comando inválido",
          }
        }
      }),
    [activeConnectionChanges],
  )

  const executeApprovedChanges = useCallback(async () => {
    if (writeInFlightRef.current) return
    const approved = activeConnectionChanges.filter((change) => change.approved)
    if (!approved.length) {
      setChangesModalNotice("Aprove ao menos um comando antes de executar.")
      return
    }
    const connectionIds = new Set(approved.map((change) => change.connectionId))
    if (connectionIds.size !== 1) {
      setChangesModalNotice("Aprove alterações de uma conexão por vez.")
      return
    }
    const connectionId = approved[0]?.connectionId
    if (!connectionId) return
    writeInFlightRef.current = true
    setWriteBusy(true)
    setChangesModalNotice(`Executando ${approved.length} comando(s)…`)
    try {
      const result = await applyTableMutations(
        connectionId,
        approved.map((change) => ({
          table: change.table,
          columns: change.columns,
          mutation: change.mutation,
          originalRow: change.originalRow,
        })),
      )
      const completedIds = new Set(approved.map((change) => change.id))
      setStagedChanges((current) => current.filter((change) => !completedIds.has(change.id)))
      setBatchRowsByTable((current) =>
        Object.fromEntries(
          Object.entries(current).filter(([key]) => !key.startsWith(`${connectionId}\u0000`)),
        ),
      )
      setBatchExportOpen(false)
      setRefreshKey((current) => current + 1)
      setChangesModalOpen(false)
      setChangesModalNotice("")
      setWriteNotice(
        result.noOpStatements
          ? `✓ Transação confirmada · ${result.sentStatements} enviado(s), ${result.noOpStatements} sem alteração`
          : `✓ ${result.sentStatements} comando(s) SQL executado(s) em uma transação`,
      )
    } catch (executionFailure) {
      const executionError =
        executionFailure instanceof Error ? executionFailure.message : "A execução do SQL falhou."
      setChangesModalNotice(`Erro: ${executionError}`)
      setWriteNotice(
        executionFailure instanceof DatabaseMutationCommitUncertainError
          ? "⚠ Commit incerto · recarregue antes de tentar novamente"
          : "⚠ Transação revertida · nenhuma alteração foi aplicada",
      )
    } finally {
      writeInFlightRef.current = false
      setWriteBusy(false)
    }
  }, [activeConnectionChanges])

  const toggleSensitiveData = useCallback(() => {
    if (!selectedTable || view !== "data") return
    if (sensitiveVisibility === "hidden") {
      setSensitiveVisibility("confirm")
      return
    }
    clearCurrentBatchRows()
    setPageData(null)
    setSensitiveVisibility(nextSensitiveVisibility(sensitiveVisibility))
  }, [clearCurrentBatchRows, selectedTable, sensitiveVisibility, view])

  useEffect(() => {
    if (!active || connections.length > 0) return
    setConnectionModalStartsInForm(true)
    setConnectionModalOpen(true)
  }, [active, connections.length])

  useEffect(() => {
    if (!activeConnectionId) {
      loadedCatalogKeyRef.current = null
      setCatalog(null)
      setCatalogLoading(false)
      return
    }
    if (!active) return
    const requestKey = `${activeConnectionId}:${catalogRefreshKey}`
    if (loadedCatalogKeyRef.current === requestKey) return
    let cancelled = false
    setCatalogLoading(true)
    setError(null)
    void catalogRefreshKey
    void listDatabaseTables(activeConnectionId)
      .then((nextCatalog) => {
        if (cancelled) return
        loadedCatalogKeyRef.current = requestKey
        setCatalog(nextCatalog)
        setCatalogLoading(false)
        setConnectionNotice("")
      })
      .catch((loadError: unknown) => {
        if (cancelled) return
        setError(
          loadError instanceof Error ? loadError.message : "Não foi possível carregar o catálogo.",
        )
        setCatalogLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [active, activeConnectionId, catalogRefreshKey])

  useEffect(() => {
    if (
      active &&
      catalog &&
      !selectedTable &&
      !queryOpen &&
      !connectionModalOpen &&
      !cellEditorOpen &&
      !changesModalOpen
    ) {
      tableListRef.current?.focus()
    }
  }, [
    active,
    catalog,
    cellEditorOpen,
    changesModalOpen,
    connectionModalOpen,
    queryOpen,
    selectedTable,
  ])

  useEffect(() => {
    if (sensitiveVisibility !== "confirm") return
    const timeout = setTimeout(() => {
      setSensitiveVisibility((current) => (current === "confirm" ? "hidden" : current))
    }, 8_000)
    return () => clearTimeout(timeout)
  }, [sensitiveVisibility])

  useEffect(() => {
    if (view === "data") return
    setNarrowDetailOpen(false)
    setCellEditorOpen(false)
  }, [view])

  useEffect(() => {
    const lastIndex = Math.max(0, gridRows.length - 1)
    setSelectedRowIndex((current) => {
      const next = Math.min(current, lastIndex)
      selectedRowIndexRef.current = next
      return next
    })
  }, [gridRows.length])

  useEffect(() => {
    const lastIndex = Math.max(0, (pageData?.columns.length ?? 1) - 1)
    setSelectedColumnIndex((current) => {
      const next = Math.min(current, lastIndex)
      selectedColumnIndexRef.current = next
      return next
    })
  }, [pageData?.columns.length])

  useEffect(() => {
    const scroll = tableGridScrollRef.current
    if (scroll && pageData) {
      scroll.scrollTo(
        databaseResultScrollTop({
          selectedRowIndex,
          currentScrollTop: scroll.scrollTop,
          viewportHeight: scroll.viewport.height,
          rowCount: gridRows.length,
        }),
      )
    }
    rowInspectorRef.current?.scrollTo(0)
    deleteSequenceArmedRef.current = false
    setDeleteSequenceArmed(false)
  }, [gridRows.length, pageData, selectedRowIndex])

  useEffect(() => {
    if (activePane !== "inspector") return
    rowInspectorRef.current?.scrollChildIntoView(`database-inspector-field-${selectedColumnIndex}`)
  }, [activePane, selectedColumnIndex])

  useEffect(() => {
    if (!active || activePane !== "catalog" || connectionModalOpen) return
    const focusedId = renderer.currentFocusedRenderable?.id
    if (focusedId === "table-list" || focusedId === "table-search") return
    const timeout = setTimeout(() => tableListRef.current?.focus(), 0)
    return () => clearTimeout(timeout)
  }, [active, activePane, connectionModalOpen, renderer])

  useEffect(() => {
    if (!writeNotice) return
    const timeout = setTimeout(() => setWriteNotice(""), 8_000)
    return () => clearTimeout(timeout)
  }, [writeNotice])

  useEffect(
    () => () => {
      if (deleteSequenceTimeoutRef.current) clearTimeout(deleteSequenceTimeoutRef.current)
    },
    [],
  )

  useEffect(() => {
    if (!active || !activeConnectionId || !selectedTable) return
    const requestKey = [
      activeConnectionId,
      tableKey(selectedTable),
      refreshKey,
      revealSensitive,
      activeTableQuerySignature,
      maskingTermsSignature,
    ].join(":")
    if (loadedPageKeyRef.current === requestKey && !tablePageMissing) return
    let cancelled = false
    setRowsLoading(true)
    setError(null)
    void loadTablePage(
      activeConnectionId,
      selectedTable,
      tableWindowOffsetRef.current,
      DATABASE_TABLE_WINDOW_SIZE,
      revealSensitive,
      activeTableQuery,
      {
        recordHistory: true,
        onQueryStart: (sql) => {
          if (!cancelled) notifyTableRead(sql)
        },
      },
    )
      .then((nextPage) => {
        if (cancelled) return
        loadedPageKeyRef.current = requestKey
        setPageData(nextPage)
        const pendingRowIndex = pendingSelectedRowIndexRef.current
        if (pendingRowIndex !== null) {
          const nextRowIndex = Math.min(pendingRowIndex, Math.max(0, nextPage.rows.length - 1))
          pendingSelectedRowIndexRef.current = null
          selectedRowIndexRef.current = nextRowIndex
          setSelectedRowIndex(nextRowIndex)
        }
        setRowsLoading(false)
      })
      .catch((loadError: unknown) => {
        if (cancelled) return
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Não foi possível carregar os registros.",
        )
        setRowsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [
    active,
    activeConnectionId,
    activeTableQuery,
    activeTableQuerySignature,
    maskingTermsSignature,
    notifyTableRead,
    refreshKey,
    revealSensitive,
    selectedTable,
    tablePageMissing,
  ])

  useEffect(() => {
    if (!active || view !== "indexes" || !activeConnectionId || !selectedTable || indexes) return
    let cancelled = false
    setIndexesLoading(true)
    void loadTableIndexes(activeConnectionId, selectedTable)
      .then((nextIndexes) => {
        if (cancelled) return
        setIndexes(nextIndexes)
        setIndexesLoading(false)
      })
      .catch((loadError: unknown) => {
        if (cancelled) return
        setError(
          loadError instanceof Error ? loadError.message : "Não foi possível carregar índices.",
        )
        setIndexesLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [active, activeConnectionId, indexes, selectedTable, view])

  useEffect(() => {
    if (view !== "indexes") setIndexesLoading(false)
    if (view !== "schema") setStructureLoading(false)
  }, [view])

  useEffect(() => {
    if (!active || view !== "schema" || !activeConnectionId || !selectedTable || tableStructure) {
      return
    }
    let cancelled = false
    setStructureLoading(true)
    void loadDatabaseTableStructure(activeConnectionId, selectedTable)
      .then((structure) => {
        if (cancelled) return
        setTableStructure(structure)
        setStructureLoading(false)
      })
      .catch((loadError: unknown) => {
        if (cancelled) return
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Não foi possível carregar a estrutura completa.",
        )
        setStructureLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [active, activeConnectionId, selectedTable, tableStructure, view])

  useEffect(() => {
    if (columnOffset > maxColumnOffset) setColumnOffset(maxColumnOffset)
  }, [columnOffset, maxColumnOffset])

  useEffect(() => {
    if (
      !active ||
      (!catalogLoading &&
        !rowsLoading &&
        !indexesLoading &&
        !structureLoading &&
        !tableWindow.loadingDirection)
    ) {
      setMotionFrame(0)
      return
    }

    const interval = setInterval(() => {
      setMotionFrame((current) => (current + 1) % LOADING_FRAMES.length)
    }, 80)
    return () => clearInterval(interval)
  }, [
    active,
    catalogLoading,
    indexesLoading,
    rowsLoading,
    structureLoading,
    tableWindow.loadingDirection,
  ])

  useKeyboard((key) => {
    if (
      !active ||
      connectionModalOpen ||
      cellEditorOpen ||
      changesModalOpen ||
      tableSearchOpen ||
      batchExportOpen
    )
      return

    if (queryOpen) return

    const paneDirection =
      key.name === "["
        ? -1
        : key.name === "]"
          ? 1
          : (key.ctrl || key.shift || key.option) && key.name === "left"
            ? -1
            : (key.ctrl || key.shift || key.option) && key.name === "right"
              ? 1
              : 0
    if (paneDirection) {
      key.preventDefault()
      movePaneFocus(paneDirection)
      return
    }

    const focusedId = renderer.currentFocusedRenderable?.id
    if (focusedId === "table-search") {
      if (key.name === "escape") {
        key.preventDefault()
        activatePane("catalog")
        tableListRef.current?.focus()
      }
      return
    }

    if (key.name === "escape" && (currentBatchRows.length || selectionSweep.active)) {
      key.preventDefault()
      key.stopPropagation()
      clearCurrentBatchRows()
      selectionSweep.clear()
      setWriteNotice("Seleção limpa.")
      return
    }

    if (databaseBatchSweepShortcut(key) && view === "data" && activePaneRef.current !== "catalog") {
      key.preventDefault()
      key.stopPropagation()
      selectionSweep.toggle()
      return
    }

    const tableHistoryDirection = directionalShortcutDirection(key)
    if (tableHistoryDirection) {
      key.preventDefault()
      navigateTableHistory(tableHistoryDirection)
      return
    }

    if (key.ctrl && key.name === "a") {
      if (view === "data" && selectedTable) {
        key.preventDefault()
        if (tableCanWrite) createNewRow()
        else setWriteNotice(`⚠ ${tableWriteBlockReason}`)
      }
      return
    }
    if (key.ctrl && key.name === "s") {
      key.preventDefault()
      if (!activeConnectionChanges.length) {
        setWriteNotice("Nenhuma alteração preparada para revisar")
        return
      }
      setChangesModalNotice("")
      setChangesModalOpen(true)
      return
    }

    switch (key.name) {
      case "c":
        key.preventDefault()
        setConnectionModalStartsInForm(false)
        setConnectionModalOpen(true)
        break
      case "w":
        key.preventDefault()
        openQueryWorkspace()
        break
      case "space": {
        if (view !== "data" || activePaneRef.current === "catalog") break
        const targetRow = gridRows[selectedRowIndexRef.current] ?? selectedGridRow
        if (!targetRow) break
        key.preventDefault()
        toggleCurrentBatchRow(targetRow)
        break
      }
      case "x":
        if (view === "data" && currentBatchRows.length) {
          key.preventDefault()
          setBatchExportOpen(true)
        }
        break
      case "/":
      case "slash":
        key.preventDefault()
        activatePane("catalog")
        searchRef.current?.focus()
        break
      case "1":
        setView("data")
        if (activePaneRef.current === "inspector") focusPane("grid")
        break
      case "2":
        setView("columns")
        focusPane("grid")
        break
      case "3":
        setIndexesLoading(!indexes)
        setView("indexes")
        focusPane("grid")
        break
      case "4":
        setStructureLoading(!tableStructure)
        setView("schema")
        focusPane("grid")
        setTimeout(() => structureScrollRef.current?.focus(), 0)
        break
      case "g":
        if (view === "schema") {
          key.preventDefault()
          setSchemaDiagramOpen((current) => !current)
          setTimeout(() => structureScrollRef.current?.focus(), 0)
        }
        break
      case "v":
        toggleSensitiveData()
        break
      case "o":
        if (view === "data" && selectedTable && pageData?.columns.length) {
          key.preventDefault()
          cycleTableSort()
        }
        break
      case "s":
        if (view === "data" && selectedTable && pageData?.columns.length) {
          key.preventDefault()
          renderer.currentFocusedRenderable?.blur()
          setTableSearchOpen(true)
        }
        break
      case "return":
      case "enter":
      case "e":
        if (activePaneRef.current === "catalog") {
          if (key.name !== "e") {
            key.preventDefault()
            tableListRef.current?.selectCurrent()
          }
        } else if (view === "data" && selectedTable) {
          key.preventDefault()
          if (currentBatchRows.length ? batchRowsCanWrite : selectedRowCanWrite) openCellEditor()
          else
            setWriteNotice(
              `⚠ ${currentBatchRows.length ? batchWriteBlockReason : rowWriteBlockReason}`,
            )
        }
        break
      case "d":
        if (activePaneRef.current !== "catalog" && view === "data" && selectedTable) {
          key.preventDefault()
          if (currentBatchRows.length ? !batchRowsCanWrite : !selectedRowCanWrite) {
            deleteSequenceArmedRef.current = false
            setDeleteSequenceArmed(false)
            setWriteNotice(
              `⚠ ${currentBatchRows.length ? batchWriteBlockReason : rowWriteBlockReason}`,
            )
          } else if (deleteSequenceArmedRef.current) {
            if (deleteSequenceTimeoutRef.current) {
              clearTimeout(deleteSequenceTimeoutRef.current)
              deleteSequenceTimeoutRef.current = null
            }
            deleteSequenceArmedRef.current = false
            setDeleteSequenceArmed(false)
            stageDeleteSelectedRow()
          } else {
            deleteSequenceArmedRef.current = true
            setDeleteSequenceArmed(true)
            setWriteNotice("[d]… pressione [d] novamente para preparar a exclusão")
            deleteSequenceTimeoutRef.current = setTimeout(() => {
              deleteSequenceArmedRef.current = false
              setDeleteSequenceArmed(false)
              deleteSequenceTimeoutRef.current = null
            }, 1_200)
          }
        }
        break
      case "i":
        if (terminal.width < ROW_INSPECTOR_BREAKPOINT && selectedTable && view === "data") {
          key.preventDefault()
          focusPane(narrowDetailOpen ? "grid" : "inspector")
        }
        break
      case "u":
        if (view === "data" && (currentBatchRows.length || selectedGridRow?.change)) {
          key.preventDefault()
          undoSelectedChange()
        }
        break
      case "j":
      case "down":
        if (activePaneRef.current === "catalog") {
          key.preventDefault()
          tableListRef.current?.moveDown()
        } else if (activePaneRef.current === "inspector" && pageData?.columns.length) {
          key.preventDefault()
          moveSelectedColumn(1)
        } else if (selectedTable && view === "data" && gridRows.length) {
          key.preventDefault()
          selectionSweep.move(1)
        }
        break
      case "k":
      case "up":
        if (activePaneRef.current === "catalog") {
          key.preventDefault()
          tableListRef.current?.moveUp()
        } else if (activePaneRef.current === "inspector" && pageData?.columns.length) {
          key.preventDefault()
          moveSelectedColumn(-1)
        } else if (selectedTable && view === "data" && gridRows.length) {
          key.preventDefault()
          selectionSweep.move(-1)
        }
        break
      case "h":
      case "l":
      case "left":
      case "right": {
        const direction = databaseHorizontalKeyDirection(key.name)
        if (direction && navigateHorizontally(direction)) key.preventDefault()
        break
      }
      case "r":
        if (selectedTable && !rowsLoading) {
          setRefreshKey((current) => current + 1)
          if (view === "indexes") setIndexesLoading(true)
          if (view === "schema") setStructureLoading(true)
          setIndexes(null)
          setTableStructure(null)
        }
        setCatalogRefreshKey((current) => current + 1)
        break
      case "tab":
        key.preventDefault()
        activatePane("catalog")
        if (focusedId === "table-list") searchRef.current?.focus()
        else tableListRef.current?.focus()
        break
    }
  })
  const firstRow = pageData?.rows.length ? tableWindow.offset + 1 : tableWindow.offset
  const lastRow = tableWindow.offset + (pageData?.rows.length ?? 0)
  const rangeSummary =
    `${firstRow}–${lastRow} ${tableWindow.offset ? "↑" : ""}${pageData?.hasMore ? "↓" : ""}`.trimEnd()
  const schemaCount = new Set(catalog?.tables.map((table) => table.schema) ?? []).size
  const compactDataSummary = veryNarrowActions
    ? `${rangeSummary} · cél ${selectedRowIndex + 1},${selectedColumnIndex + 1}${activeConnectionChanges.length ? ` · ${activeConnectionChanges.length} pend.` : ""}`
    : `${rangeSummary} · cél ${selectedRowIndex + 1},${selectedColumnIndex + 1} · ${gridRows.length} itens · ${activeConnectionChanges.length} pend.`
  const dataSummary = translateUi(
    sensitiveVisibility === "confirm"
      ? `${rangeSummary} · cél ${selectedRowIndex + 1},${selectedColumnIndex + 1} · ${gridRows.length} itens`
      : gridAreaWidth < 65
        ? compactDataSummary
        : `CÉLULA ${selectedRowIndex + 1},${selectedColumnIndex + 1}  •  ${gridRows.length} REGISTROS  •  ${activeConnectionChanges.length} ALTERAÇÕES PENDENTES  •  ${rangeSummary}`,
  )
  const tableLoadingSummary = tableWindow.loadingDirection
    ? `${LOADING_FRAMES[motionFrame]} ${translateUi(tableWindow.loadingDirection < 0 ? "Carregando 40 linhas acima…" : "Carregando 40 linhas abaixo…")}`
    : ""
  const sensitiveSummary = translateUi(
    sensitiveVisibility === "confirm"
      ? "⚠ [V] confirmar  ·  "
      : sensitiveDataMasked
        ? "⚠ SENSÍVEIS MASCARADOS  ·  "
        : "",
  )
  if (tutorialMode) return <DatabaseTutorialDemo />
  return (
    <box
      id="database-workspace"
      style={{
        flexGrow: 1,
        flexDirection: connections.length ? "row" : "column",
        padding: LAYOUT.outerPadding,
        gap: LAYOUT.gap,
        backgroundColor: LAYOUT.workspaceBackground,
        ...(connections.length
          ? {}
          : { alignItems: "center" as const, justifyContent: "center" as const }),
      }}
    >
      {connections.length === 0 ? (
        <DatabaseEmptyState
          key={LAYOUT.compact ? "database-empty-compact" : "database-empty-framed"}
          compact={compactEmptyState}
          terminalWidth={terminal.width}
          onOpenConnections={() => {
            setConnectionModalStartsInForm(false)
            setConnectionModalOpen(true)
          }}
        />
      ) : (
        <>
          <box
            id="tutorial-db-catalog"
            style={{
              width: sidebarWidth,
              ...focusedPanelBorder(activePane === "catalog", COLORS.database),
              backgroundColor:
                activePane === "catalog" && LAYOUT.compact ? COLORS.panelRaised : COLORS.panel,
              paddingLeft: 1,
              paddingRight: 1,
            }}
          >
            <box style={{ height: 2, flexShrink: 0 }}>
              <box id="tutorial-db-connection" style={{ height: 1, flexShrink: 0 }}>
                <text
                  content={`◆ ${shorten(activeConnection?.name ?? "Conexão", Math.max(6, sidebarWidth - 6))}`}
                  style={{ fg: COLORS.database }}
                />
              </box>
              <box style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <text
                  content={shorten(
                    catalog?.databaseName ??
                      databaseDriverLabel(activeConnection?.driver ?? "mysql"),
                    Math.max(5, sidebarWidth - 12),
                  )}
                  style={{ fg: COLORS.database }}
                />
                <text
                  content={
                    catalogLoading
                      ? `${LOADING_FRAMES[motionFrame]} sync`
                      : `${schemaCount}s · ${catalog?.tables.length ?? 0}t`
                  }
                  style={{ fg: catalogLoading ? COLORS.database : COLORS.muted }}
                />
              </box>
            </box>
            <input
              ref={searchRef}
              id="table-search"
              placeholder={translateUi("Filtrar schema ou tabela…")}
              onInput={setSearch}
              onMouseDown={() => {
                activatePane("catalog")
                searchRef.current?.focus()
              }}
              onSubmit={() => {
                activatePane("catalog")
                tableListRef.current?.focus()
              }}
              width={Math.max(8, sidebarWidth - 4)}
              style={{
                backgroundColor: COLORS.panelRaised,
                focusedBackgroundColor: COLORS.panelRaised,
                textColor: COLORS.text,
                focusedTextColor: COLORS.text,
                cursorColor: COLORS.database,
                marginBottom: 1,
              }}
            />
            <select
              ref={tableListRef}
              id="table-list"
              options={tableOptions}
              selectedIndex={selectedCatalogIndex}
              onSelect={(_index, option) => {
                const entry = catalogEntries.find((item) => item.value === option?.value)
                if (entry?.table) openTable(entry.table)
              }}
              onMouseDown={(event) => {
                activatePane("catalog")
                handleSelectMouseDown(event, tableListRef.current, {
                  optionCount: tableOptions.length,
                  activateOnClick: true,
                })
              }}
              onMouseScroll={(event) => {
                activatePane("catalog")
                handleSelectMouseScroll(event, tableListRef.current)
              }}
              showDescription={false}
              showScrollIndicator
              wrapSelection
              style={{
                width: Math.max(8, sidebarWidth - 4),
                minHeight: 5,
                flexGrow: 1,
                flexShrink: 1,
                backgroundColor: COLORS.panel,
                focusedBackgroundColor: COLORS.panel,
                textColor: COLORS.muted,
                focusedTextColor: COLORS.text,
                selectedBackgroundColor: COLORS.panelRaised,
                selectedTextColor: COLORS.database,
              }}
            />
            <InlineButton
              id="tutorial-db-new-connection"
              label={sidebarWidth < 28 ? "[C] Conexões" : "[C] Criar nova / conexões"}
              accent={COLORS.database}
              onPress={() => {
                setConnectionModalStartsInForm(false)
                setConnectionModalOpen(true)
              }}
            />
            <InlineButton
              id="tutorial-db-new-query"
              label={sidebarWidth < 28 ? "[W] Query" : "[W] Criar query"}
              accent={COLORS.success}
              active={queryOpen}
              onPress={openQueryWorkspace}
            />
          </box>

          <box
            id="tutorial-db-grid"
            style={{
              position: "relative",
              flexGrow: 1,
              ...focusedPanelBorder(activePane === "grid", COLORS.database),
              backgroundColor:
                activePane === "grid" && LAYOUT.compact
                  ? COLORS.panelRaised
                  : LAYOUT.alternatePanel,
              paddingLeft: 1,
              paddingRight: 1,
            }}
          >
            {tableHistory.length && !queryOpen ? (
              <box
                id="tutorial-db-table-history"
                style={{
                  height: 2,
                  flexShrink: 0,
                  flexDirection: "column",
                  backgroundColor: COLORS.panel,
                }}
              >
                <box
                  style={{
                    height: 1,
                    flexShrink: 0,
                    flexDirection: "row",
                    border: ["bottom"],
                    borderColor: COLORS.border,
                  }}
                >
                  <DirectionalButton
                    direction={-1}
                    accent={COLORS.database}
                    disabled={currentTableHistoryIndex <= 0}
                    onPress={() => navigateTableHistory(-1)}
                  />
                  {visibleTableHistory.map((table, visibleIndex) => {
                    const historyIndex = visibleTableHistoryStart + visibleIndex
                    const current = historyIndex === currentTableHistoryIndex
                    return (
                      <InlineButton
                        key={tableKey(table)}
                        label={shorten(table.name, historyItemWidth - 2)}
                        accent={COLORS.database}
                        active={Boolean(current)}
                        onPress={() => openTable(table, false)}
                      />
                    )
                  })}
                  <DirectionalButton
                    direction={1}
                    accent={COLORS.database}
                    disabled={
                      currentTableHistoryIndex < 0 ||
                      currentTableHistoryIndex >= tableHistory.length - 1
                    }
                    onPress={() => navigateTableHistory(1)}
                  />
                </box>
                <box
                  style={{
                    height: 1,
                    flexShrink: 0,
                    border: ["bottom"],
                    borderColor: COLORS.border,
                  }}
                />
              </box>
            ) : null}

            {selectedTable && !queryOpen ? (
              <box
                style={{
                  height: actionRowCount,
                  flexShrink: 0,
                  flexDirection: "column",
                }}
              >
                <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
                  <InlineButton
                    id="tutorial-db-view-data"
                    label={compactActions ? "[1]" : "[1] Dados"}
                    accent={COLORS.database}
                    active={view === "data"}
                    onPress={() => {
                      setView("data")
                      focusPane("grid")
                    }}
                  />
                  <InlineButton
                    id="tutorial-db-view-columns"
                    label={compactActions ? "[2]" : "[2] Colunas"}
                    accent={COLORS.database}
                    active={view === "columns"}
                    onPress={() => {
                      setView("columns")
                      focusPane("grid")
                    }}
                  />
                  <InlineButton
                    id="tutorial-db-view-indexes"
                    label={compactActions ? "[3]" : "[3] Índices"}
                    accent={COLORS.database}
                    active={view === "indexes"}
                    onPress={() => {
                      setIndexesLoading(!indexes)
                      setView("indexes")
                      focusPane("grid")
                    }}
                  />
                  <InlineButton
                    id="tutorial-db-view-schema"
                    label={compactActions ? "[4]" : "[4] Schema"}
                    accent={COLORS.database}
                    active={view === "schema"}
                    onPress={() => {
                      setStructureLoading(!tableStructure)
                      setView("schema")
                      focusPane("grid")
                      setTimeout(() => structureScrollRef.current?.focus(), 0)
                    }}
                  />
                  {view === "data" ? (
                    <InlineButton
                      id="database-table-sort"
                      label={
                        compactActions
                          ? `[O]${activeTableQuery.sort?.direction === "asc" ? "↑" : activeTableQuery.sort ? "↓" : "↕"}`
                          : activeTableQuery.sort
                            ? `[O] ${translateUi("Ordem")} ${truncateDisplay(activeTableQuery.sort.column, 10)} ${activeTableQuery.sort.direction === "asc" ? "↑" : "↓"}`
                            : `[O] ${translateUi("Ordem normal")}`
                      }
                      accent={COLORS.database}
                      active={Boolean(activeTableQuery.sort)}
                      disabled={!pageData?.columns.length || rowsLoading}
                      onPress={cycleTableSort}
                    />
                  ) : null}
                  {view === "data" && !veryNarrowActions ? (
                    <InlineButton
                      id="database-table-search-open"
                      label={
                        compactActions
                          ? activeTableSearch
                            ? `[S] ${truncateDisplay(activeTableSearch, 5)}`
                            : "[S] Busca"
                          : activeTableSearch
                            ? `[S] ${truncateDisplay(activeTableSearch, 14)}`
                            : `[S] ${translateUi("Buscar")}`
                      }
                      accent={COLORS.database}
                      active={Boolean(activeTableSearch)}
                      disabled={!pageData?.columns.length || rowsLoading}
                      onPress={() => {
                        renderer.currentFocusedRenderable?.blur()
                        setTableSearchOpen(true)
                      }}
                    />
                  ) : null}
                  {view === "data" ? (
                    <InlineButton
                      id="tutorial-db-sensitive"
                      label={
                        compactActions
                          ? sensitiveVisibility === "confirm"
                            ? "[V] !"
                            : revealSensitive
                              ? "[V] ◆"
                              : "[V] ◇"
                          : sensitiveVisibility === "confirm"
                            ? "[V] Confirmar exibição"
                            : revealSensitive
                              ? "[V] Ocultar sensíveis"
                              : "[V] Revelar sensíveis"
                      }
                      accent={sensitiveDataMasked ? COLORS.danger : COLORS.database}
                      active={sensitiveDataMasked}
                      onPress={toggleSensitiveData}
                    />
                  ) : null}
                  {view === "data" && terminal.width < ROW_INSPECTOR_BREAKPOINT ? (
                    <InlineButton
                      id="tutorial-db-inspector-toggle"
                      label={compactActions ? "[I]" : "[I] Inspetor"}
                      accent={COLORS.database}
                      active={narrowDetailOpen}
                      onPress={() => focusPane(narrowDetailOpen ? "grid" : "inspector")}
                    />
                  ) : null}
                </box>
                {view === "data" ? (
                  <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
                    {veryNarrowActions ? (
                      <InlineButton
                        id="database-table-search-open"
                        label={
                          activeTableSearch
                            ? `[S] ${truncateDisplay(activeTableSearch, 5)}`
                            : "[S] Busca"
                        }
                        accent={COLORS.database}
                        active={Boolean(activeTableSearch)}
                        disabled={!pageData?.columns.length || rowsLoading}
                        onPress={() => {
                          renderer.currentFocusedRenderable?.blur()
                          setTableSearchOpen(true)
                        }}
                      />
                    ) : null}
                    <InlineButton
                      id="database-select-current-row"
                      label={selectedRowMarked ? "[Space] ●" : "[Space] ○"}
                      accent={COLORS.database}
                      active={selectedRowMarked}
                      disabled={!selectedGridRow}
                      onPress={() => {
                        if (selectedGridRow) toggleCurrentBatchRow(selectedGridRow)
                      }}
                    />
                    <InlineButton
                      id="database-selection-sweep"
                      label={
                        compactActions ? "[Alt+Space] Sel" : "[Alt+Space] Selecionar intervalo"
                      }
                      accent={COLORS.database}
                      active={selectionSweep.active}
                      disabled={!gridRows.length}
                      onPress={selectionSweep.toggle}
                    />
                    {!veryNarrowActions ? (
                      <>
                        {!currentBatchRows.length ? (
                          <InlineButton
                            id="tutorial-db-new-row"
                            label={compactActions ? "[Ctrl+A]+" : "[Ctrl+A] Nova linha"}
                            accent={COLORS.runner}
                            disabled={!tableCanWrite || writeBusy}
                            onPress={() => {
                              if (tableCanWrite) createNewRow()
                              else setWriteNotice(`⚠ ${tableWriteBlockReason}`)
                            }}
                          />
                        ) : null}
                        <InlineButton
                          id="tutorial-db-edit-cell"
                          label={
                            currentBatchRows.length
                              ? compactActions
                                ? `[E]${currentBatchRows.length}`
                                : `[E] Editar ${currentBatchRows.length}`
                              : compactActions
                                ? "[E]"
                                : "[Enter] Editar célula"
                          }
                          accent={COLORS.warning}
                          disabled={
                            currentBatchRows.length
                              ? !batchRowsCanWrite || !selectedColumn || writeBusy
                              : !selectedRowCanWrite || writeBusy
                          }
                          onPress={openCellEditor}
                        />
                        <InlineButton
                          id="tutorial-db-delete-row"
                          label={
                            currentBatchRows.length
                              ? compactActions
                                ? `[dd]${currentBatchRows.length}`
                                : `[dd] Excluir ${currentBatchRows.length}`
                              : compactActions
                                ? "[dd]"
                                : "[dd] Preparar exclusão"
                          }
                          accent={COLORS.danger}
                          active={deleteSequenceArmed}
                          disabled={
                            currentBatchRows.length
                              ? !batchRowsCanWrite || writeBusy
                              : !selectedRowCanWrite || writeBusy
                          }
                          onPress={stageDeleteSelectedRow}
                        />
                        {currentBatchRows.length ? (
                          <InlineButton
                            id="database-export-selected-rows"
                            label={
                              compactActions
                                ? `[X]${currentBatchRows.length}`
                                : `[X] Exportar ${currentBatchRows.length}`
                            }
                            accent={COLORS.database}
                            onPress={() => setBatchExportOpen(true)}
                          />
                        ) : null}
                      </>
                    ) : null}
                    {!veryNarrowActions ? (
                      <>
                        <InlineButton
                          id="tutorial-db-undo-row"
                          label={
                            currentBatchRows.length && !compactActions
                              ? "[U] Desfazer selecionadas"
                              : compactActions
                                ? "[U]"
                                : "[U] Desfazer linha"
                          }
                          accent={COLORS.database}
                          disabled={
                            currentBatchRows.length
                              ? !currentBatchHasChanges || writeBusy
                              : !selectedGridRow?.change || writeBusy
                          }
                          onPress={undoSelectedChange}
                        />
                        <InlineButton
                          id="tutorial-db-review"
                          label={
                            compactActions
                              ? `[Ctrl+S]${activeConnectionChanges.length}`
                              : `[Ctrl+S] Revisar ${activeConnectionChanges.length}`
                          }
                          accent={COLORS.success}
                          active={activeConnectionChanges.length > 0}
                          disabled={!activeConnectionChanges.length || writeBusy}
                          onPress={() => {
                            setChangesModalNotice("")
                            setChangesModalOpen(true)
                          }}
                        />
                      </>
                    ) : null}
                  </box>
                ) : null}
                {view === "data" && veryNarrowActions ? (
                  <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
                    {!currentBatchRows.length ? (
                      <InlineButton
                        id="tutorial-db-new-row"
                        label="[Ctrl+A]+"
                        accent={COLORS.runner}
                        disabled={!tableCanWrite || writeBusy}
                        onPress={() => {
                          if (tableCanWrite) createNewRow()
                          else setWriteNotice(`⚠ ${tableWriteBlockReason}`)
                        }}
                      />
                    ) : null}
                    <InlineButton
                      id="tutorial-db-edit-cell"
                      label={currentBatchRows.length ? `[E]${currentBatchRows.length}` : "[E]"}
                      accent={COLORS.warning}
                      disabled={
                        currentBatchRows.length
                          ? !batchRowsCanWrite || !selectedColumn || writeBusy
                          : !selectedRowCanWrite || writeBusy
                      }
                      onPress={openCellEditor}
                    />
                    <InlineButton
                      id="tutorial-db-delete-row"
                      label={currentBatchRows.length ? `[dd]${currentBatchRows.length}` : "[dd]"}
                      accent={COLORS.danger}
                      active={deleteSequenceArmed}
                      disabled={
                        currentBatchRows.length
                          ? !batchRowsCanWrite || writeBusy
                          : !selectedRowCanWrite || writeBusy
                      }
                      onPress={stageDeleteSelectedRow}
                    />
                    {currentBatchRows.length ? (
                      <InlineButton
                        id="database-export-selected-rows"
                        label={`[X]${currentBatchRows.length}`}
                        accent={COLORS.database}
                        onPress={() => setBatchExportOpen(true)}
                      />
                    ) : null}
                    <InlineButton
                      id="tutorial-db-undo-row"
                      label="[U]"
                      accent={COLORS.database}
                      disabled={
                        currentBatchRows.length
                          ? !currentBatchHasChanges || writeBusy
                          : !selectedGridRow?.change || writeBusy
                      }
                      onPress={undoSelectedChange}
                    />
                    <InlineButton
                      id="tutorial-db-review"
                      label={`[Ctrl+S]${activeConnectionChanges.length}`}
                      accent={COLORS.success}
                      active={activeConnectionChanges.length > 0}
                      disabled={!activeConnectionChanges.length || writeBusy}
                      onPress={() => {
                        setChangesModalNotice("")
                        setChangesModalOpen(true)
                      }}
                    />
                  </box>
                ) : null}
              </box>
            ) : null}

            {activeConnection && activeConnectionId
              ? queryTabs.map((tab) => (
                  <box
                    key={tab.id}
                    visible={queryOpen && tab.id === activeQueryTabId}
                    style={{
                      flexGrow: queryOpen && tab.id === activeQueryTabId ? 1 : 0,
                      flexShrink: queryOpen && tab.id === activeQueryTabId ? 1 : 0,
                      width: queryOpen && tab.id === activeQueryTabId ? "100%" : 0,
                      height: queryOpen && tab.id === activeQueryTabId ? "100%" : 0,
                      overflow: "hidden",
                    }}
                  >
                    <DatabaseQueryWorkspace
                      active={active && queryOpen && tab.id === activeQueryTabId}
                      tabId={tab.id}
                      tabs={queryTabs}
                      activeTabId={activeQueryTabId}
                      connection={activeConnection}
                      connectionId={activeConnectionId}
                      tables={catalog?.tables ?? []}
                      selectedTable={selectedTable}
                      selectedTableColumns={pageData?.columns ?? null}
                      availableWidth={tableAreaWidth}
                      rerunRequest={
                        tab.id === activeQueryTabId &&
                        queryRerunRequest?.connectionId === activeConnectionId
                          ? queryRerunRequest
                          : null
                      }
                      onRerunRequestHandled={onQueryRerunRequestHandled}
                      onClose={closeQueryWorkspace}
                      onReturnToCatalog={() => {
                        setQueryOpen(false)
                        focusPane("catalog")
                      }}
                      onSelectTab={setActiveQueryTabId}
                      onNewTab={() => createQueryTab()}
                      onCloseTab={closeQueryTab}
                      onSwitchTab={switchQueryTab}
                      stagedChanges={stagedChanges}
                      setStagedChanges={setStagedChanges}
                      changesModalOpen={changesModalOpen}
                      onOpenChangesReview={() => {
                        setChangesModalNotice("")
                        setChangesModalOpen(true)
                      }}
                      writeBusy={writeBusy}
                      dataRevision={refreshKey}
                      maskingTermsSignature={maskingTermsSignature}
                      onDatabaseChanged={() => {
                        loadedCatalogKeyRef.current = null
                        loadedPageKeyRef.current = null
                        setCatalogRefreshKey((current) => current + 1)
                        setRefreshKey((current) => current + 1)
                        if (view === "indexes") setIndexesLoading(true)
                        if (view === "schema") setStructureLoading(true)
                        setIndexes(null)
                        setTableStructure(null)
                      }}
                    />
                  </box>
                ))
              : null}

            {!queryOpen ? (
              error ? (
                <box
                  style={{
                    border: true,
                    borderStyle: "rounded",
                    borderColor: COLORS.danger,
                    padding: 1,
                  }}
                >
                  <text content="ERRO DE CONEXÃO" style={{ fg: COLORS.danger }} />
                  <text content={error} style={{ fg: COLORS.text }} />
                  <InlineButton
                    label="[C] Trocar ou adicionar conexão"
                    accent={COLORS.database}
                    onPress={() => {
                      setConnectionModalStartsInForm(false)
                      setConnectionModalOpen(true)
                    }}
                  />
                </box>
              ) : !selectedTable ? (
                <box style={{ flexGrow: 1, alignItems: "center", justifyContent: "center" }}>
                  <text
                    content={`${catalog?.tables.length ?? 0} objetos em ${schemaCount} schema${schemaCount === 1 ? "" : "s"}`}
                    style={{ fg: COLORS.database }}
                  />
                  <text
                    content="Escolha uma tabela no catálogo à esquerda"
                    style={{ fg: COLORS.text }}
                  />
                  <text content="Dados · colunas · índices · schema" style={{ fg: COLORS.muted }} />
                  {connectionNotice ? (
                    <text content={connectionNotice} style={{ fg: COLORS.warning }} />
                  ) : null}
                </box>
              ) : rowsLoading || !pageData ? (
                <box style={{ flexGrow: 1 }} />
              ) : view === "columns" ? (
                <box style={{ flexGrow: 1 }}>
                  <text
                    content={`${fitCell(translateUi("COLUNA"), metadataNameWidth)}${fitCell(translateUi("TIPO"), metadataTypeWidth)}${fitCell(translateUi("ATRIBUTOS"), metadataDetailWidth)}`}
                    style={{ fg: COLORS.database, bg: COLORS.panelRaised }}
                  />
                  {pageData.columns.map((column) => {
                    const attributes = [
                      column.key === "PRI" ? "PK" : column.key || "",
                      column.nullable ? "NULL" : "NOT NULL",
                      column.defaultValue === null
                        ? translateUi("sem padrão")
                        : `= ${column.defaultValue}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")
                    return (
                      <text
                        key={column.field}
                        content={`${fitCell(column.field, metadataNameWidth)}${fitCell(column.type, metadataTypeWidth)}${fitCell(attributes, metadataDetailWidth)}`}
                        style={{ fg: column.key === "PRI" ? COLORS.database : COLORS.text }}
                      />
                    )
                  })}
                </box>
              ) : view === "indexes" ? (
                <box style={{ flexGrow: 1 }}>
                  <text
                    content={`${fitCell(translateUi("ÍNDICE"), indexNameWidth)}${fitCell(translateUi("TIPO"), indexTypeWidth)}${fitCell(translateUi("DEFINIÇÃO / COLUNAS"), indexDefinitionWidth)}`}
                    style={{ fg: COLORS.database, bg: COLORS.panelRaised }}
                  />
                  {indexesLoading ? null : indexes?.length ? (
                    indexes.map((index) => (
                      <text
                        key={index.name}
                        content={`${fitCell(index.name, indexNameWidth)}${fitCell(index.unique ? "UNIQUE" : "INDEX", indexTypeWidth)}${fitCell(index.definition, indexDefinitionWidth)}`}
                        style={{ fg: index.unique ? COLORS.database : COLORS.text }}
                      />
                    ))
                  ) : (
                    <text content="Nenhum índice encontrado." style={{ fg: COLORS.muted }} />
                  )}
                </box>
              ) : view === "schema" ? (
                <DatabaseSchemaView
                  table={selectedTable}
                  structure={tableStructure}
                  loading={structureLoading}
                  diagramOpen={schemaDiagramOpen}
                  availableWidth={tableAreaWidth}
                  scrollRef={structureScrollRef}
                  onToggleDiagram={() => {
                    setSchemaDiagramOpen((current) => !current)
                    setTimeout(() => structureScrollRef.current?.focus(), 0)
                  }}
                />
              ) : (
                <box style={{ flexGrow: 1, flexDirection: "row" }}>
                  {!detailOnly ? (
                    <box id="tutorial-db-table-grid" style={{ flexGrow: 1 }}>
                      <text
                        id="database-table-summary"
                        content={
                          writeNotice ||
                          tableWindow.loadError ||
                          tableLoadingSummary ||
                          `${sensitiveSummary}${dataSummary}`
                        }
                        style={{
                          height: 1,
                          flexShrink: 0,
                          fg:
                            writeNotice.startsWith("Erro") || tableWindow.loadError
                              ? COLORS.danger
                              : writeNotice || sensitiveDataMasked
                                ? COLORS.warning
                                : COLORS.muted,
                        }}
                      />
                      {visibleColumns.length ? (
                        <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
                          <Button
                            id="database-selection-sweep-gutter"
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
                              activePane === "grid" && absoluteIndex === selectedColumnIndex
                            const sortMarker =
                              activeTableQuery.sort?.column === column.field
                                ? activeTableQuery.sort.direction === "asc"
                                  ? " ↑"
                                  : " ↓"
                                : ""
                            return (
                              <box
                                key={column.field}
                                style={{ height: 1, flexShrink: 0, flexDirection: "row" }}
                              >
                                <text
                                  content={fitCell(
                                    `${column.key === "PRI" ? "◆ " : ""}${column.field}${sortMarker}`,
                                  )}
                                  style={{
                                    fg: selected ? selectionColors.foreground : COLORS.database,
                                    bg: selected ? selectionColors.background : COLORS.panelRaised,
                                  }}
                                />
                                {visibleIndex < visibleColumns.length - 1 ? (
                                  <text
                                    content="│"
                                    style={{ fg: COLORS.border, bg: COLORS.panelRaised }}
                                  />
                                ) : null}
                              </box>
                            )
                          })}
                        </box>
                      ) : (
                        <text content="Tabela sem colunas visíveis" style={{ fg: COLORS.muted }} />
                      )}
                      {/* biome-ignore lint/a11y/noStaticElementInteractions: capture row keys before native scroll */}
                      <scrollbox
                        ref={tableGridScrollRef}
                        id="database-table-rows"
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
                        {gridRows.length ? (
                          gridRows.map((gridRow, index) => {
                            const mutationKind = gridRow.change?.mutation.kind
                            const rowBackground =
                              mutationKind === "insert"
                                ? COLORS.databaseInsertedBg
                                : mutationKind === "delete"
                                  ? COLORS.databaseDeletedBg
                                  : mutationKind === "update"
                                    ? COLORS.databaseEditedBg
                                    : index % 2 === 0
                                      ? COLORS.panel
                                      : COLORS.panelRaised
                            const rowAccent =
                              mutationKind === "insert"
                                ? COLORS.runner
                                : mutationKind === "delete"
                                  ? COLORS.danger
                                  : mutationKind === "update"
                                    ? COLORS.warning
                                    : COLORS.muted
                            return (
                              <box
                                key={gridRow.id}
                                id={`database-row-${index}`}
                                style={{
                                  height: 1,
                                  flexShrink: 0,
                                  flexDirection: "row",
                                  backgroundColor: rowBackground,
                                }}
                              >
                                <Button
                                  id={`database-select-row-${index}`}
                                  onPress={() => {
                                    activatePane("grid")
                                    selectedRowIndexRef.current = index
                                    setSelectedRowIndex(index)
                                    toggleCurrentBatchRow(gridRow)
                                  }}
                                  height={1}
                                  width={BATCH_SELECTOR_WIDTH}
                                  flexShrink={0}
                                >
                                  <text
                                    content={
                                      currentBatchRowIds.has(
                                        databaseBatchRowIdentity(gridRow.rowKey, gridRow.id),
                                      )
                                        ? "● "
                                        : "○ "
                                    }
                                    style={{
                                      fg: currentBatchRowIds.has(
                                        databaseBatchRowIdentity(gridRow.rowKey, gridRow.id),
                                      )
                                        ? COLORS.database
                                        : COLORS.muted,
                                      bg: rowBackground,
                                    }}
                                  />
                                </Button>
                                <text
                                  content="│"
                                  style={{ fg: COLORS.border, bg: rowBackground }}
                                />
                                {visibleColumns.map((column, visibleIndex) => {
                                  const absoluteIndex = columnOffset + visibleIndex
                                  const selectedCell =
                                    activePane === "grid" &&
                                    index === selectedRowIndex &&
                                    absoluteIndex === selectedColumnIndex
                                  const changedCell =
                                    gridRow.change?.mutation.kind === "update" &&
                                    Object.hasOwn(gridRow.change.mutation.values, column.field)
                                  return (
                                    <box
                                      key={column.field}
                                      style={{ height: 1, flexShrink: 0, flexDirection: "row" }}
                                    >
                                      <Button
                                        id={`database-cell-${index}-${absoluteIndex}`}
                                        onPress={() => {
                                          activatePane("grid")
                                          selectedRowIndexRef.current = index
                                          setSelectedRowIndex(index)
                                          selectedColumnIndexRef.current = absoluteIndex
                                          setSelectedColumnIndex(absoluteIndex)
                                        }}
                                        height={1}
                                        width={CELL_WIDTH}
                                        flexShrink={0}
                                      >
                                        {(state) => (
                                          <text
                                            content={fitCell(gridRow.data[column.field])}
                                            style={{
                                              fg: selectedCell
                                                ? selectionColors.foreground
                                                : changedCell || mutationKind
                                                  ? rowAccent
                                                  : state.focused
                                                    ? COLORS.text
                                                    : COLORS.muted,
                                              bg: selectedCell
                                                ? selectionColors.background
                                                : rowBackground,
                                            }}
                                          />
                                        )}
                                      </Button>
                                      {visibleIndex < visibleColumns.length - 1 ? (
                                        <text
                                          content="│"
                                          style={{ fg: COLORS.border, bg: rowBackground }}
                                        />
                                      ) : null}
                                    </box>
                                  )
                                })}
                              </box>
                            )
                          })
                        ) : (
                          <text
                            content={translateUi("A consulta não retornou linhas.")}
                            style={{ fg: COLORS.muted }}
                          />
                        )}
                      </scrollbox>
                    </box>
                  ) : null}
                  {sideInspectorVisible || detailOnly ? (
                    <RowInspector
                      columns={pageData.columns}
                      row={selectedRow}
                      rowIndex={selectedRowIndex}
                      rowCount={gridRows.length}
                      width={detailOnly ? "100%" : rowInspectorWidth}
                      scrollRef={rowInspectorRef}
                      active={activePane === "inspector"}
                      selectedColumnIndex={selectedColumnIndex}
                      onActivate={() => activatePane("inspector")}
                      onSelectColumn={(index) => {
                        selectedColumnIndexRef.current = index
                        setSelectedColumnIndex(index)
                      }}
                    />
                  ) : null}
                </box>
              )
            ) : null}

            {!queryOpen ? (
              <box
                id="tutorial-db-navigation"
                style={{
                  height: compactActions ? 2 : 1,
                  flexShrink: 0,
                  marginTop: 1,
                  flexDirection: compactActions ? "column" : "row",
                  justifyContent: "space-between",
                }}
              >
                <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
                  {selectedTable && view === "data" ? (
                    <>
                      <InlineButton
                        label="[H/←]"
                        accent={COLORS.database}
                        onPress={() => navigateHorizontally(-1)}
                      />
                      <InlineButton
                        label="[L/→]"
                        accent={COLORS.database}
                        onPress={() => navigateHorizontally(1)}
                      />
                    </>
                  ) : null}
                  {!compactActions ? (
                    <ShortcutText
                      content={translateUi(
                        ` [H/←] [L/→] navegação contextual · ${activePane === "catalog" ? "TABELAS" : activePane === "grid" ? "GRADE" : "REGISTRO"}`,
                      )}
                      style={{ fg: COLORS.muted }}
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
                  {compactActions ? (
                    <ShortcutText
                      content={translateUi(
                        `[H/←] [L/→] ${activePane === "catalog" ? "TABELAS" : activePane === "grid" ? "GRADE" : "REGISTRO"}`,
                      )}
                      style={{ fg: COLORS.muted }}
                    />
                  ) : null}
                  <InlineButton
                    label={compactActions ? "[R]" : "[R] Atualizar catálogo"}
                    accent={COLORS.database}
                    disabled={catalogLoading || rowsLoading}
                    onPress={() => {
                      setCatalogRefreshKey((current) => current + 1)
                      setRefreshKey((current) => current + 1)
                      if (view === "indexes") setIndexesLoading(true)
                      if (view === "schema") setStructureLoading(true)
                      setIndexes(null)
                      setTableStructure(null)
                    }}
                  />
                </box>
              </box>
            ) : null}
            <DatabaseLoadingOverlay
              id="database-content-loader"
              catalog={!queryOpen && catalogLoading && !catalog && !selectedTable}
              rows={!queryOpen && rowsLoading}
              indexes={!queryOpen && view === "indexes" && indexesLoading}
              schema={!queryOpen && view === "schema" && structureLoading}
              background={LAYOUT.alternatePanel}
              top={loadingInsets.top}
              bottom={loadingInsets.bottom}
            />
          </box>
        </>
      )}

      <MountWhen when={cellEditorOpen}>
        <DatabaseCellEditor
          open
          tableName={selectedTable ? `${selectedTable.schema}.${selectedTable.name}` : ""}
          column={selectedColumn}
          value={selectedColumn && selectedRow ? selectedRow[selectedColumn.field] : null}
          isNewRow={selectedGridRow?.change?.mutation.kind === "insert"}
          batchRowCount={currentBatchRows.length}
          onClose={() => setCellEditorOpen(false)}
          onApply={currentBatchRows.length ? stageCurrentBatchValue : stageCellValue}
        />
      </MountWhen>

      <MountWhen when={batchExportOpen}>
        <DatabaseBatchExportModal
          open
          tableName={selectedTable ? `${selectedTable.schema}.${selectedTable.name}` : "dados"}
          columns={pageData?.columns.map((column) => column.field) ?? []}
          rows={currentBatchRows}
          onClose={() => {
            setBatchExportOpen(false)
            focusPane("grid")
          }}
        />
      </MountWhen>

      {tableSearchOpen && activeConnectionId && selectedTable && pageData ? (
        <DatabaseTableSearchModal
          open
          table={selectedTable}
          initialValue={activeTableQuery.search}
          onClose={() => {
            setTableSearchOpen(false)
            focusPane("grid")
          }}
          onApply={(searchValue) => {
            applyTableQuery({ ...activeTableQuery, search: searchValue })
          }}
        />
      ) : null}

      <MountWhen when={changesModalOpen}>
        <DatabaseChangesModal
          open
          items={reviewItems}
          busy={writeBusy}
          notice={changesModalNotice}
          onClose={() => setChangesModalOpen(false)}
          onToggle={(changeId) => {
            if (writeInFlightRef.current) return
            setStagedChanges((current) =>
              current.map((change) =>
                change.id === changeId ? { ...change, approved: !change.approved } : change,
              ),
            )
            setChangesModalNotice("")
          }}
          onToggleAll={() => {
            if (writeInFlightRef.current) return
            setStagedChanges((current) => {
              const connectionChanges = current.filter(
                (change) => change.connectionId === activeConnectionId,
              )
              const approve = !connectionChanges.every((change) => change.approved)
              return current.map((change) =>
                change.connectionId === activeConnectionId
                  ? { ...change, approved: approve }
                  : change,
              )
            })
            setChangesModalNotice("")
          }}
          onExecute={() => void executeApprovedChanges()}
        />
      </MountWhen>

      <MountWhen when={connectionModalOpen}>
        <DatabaseConnectionModal
          open
          connections={connections}
          selectedConnectionId={activeConnectionId}
          startInForm={connectionModalStartsInForm}
          onClose={() => setConnectionModalOpen(false)}
          onSelect={switchConnection}
          onCreated={(profile, notice) => {
            const nextConnections = listDatabaseConnections()
            setConnections(nextConnections)
            setActiveConnectionId(profile.id)
            setCatalogRefreshKey((current) => current + 1)
            setDefaultDatabaseConnection(profile.id)
            setConnectionNotice(notice)
            setConnectionModalOpen(false)
            resetTable()
          }}
          onDeleted={(connectionId) => {
            const nextConnections = listDatabaseConnections()
            setConnections(nextConnections)
            setStagedChanges((current) =>
              current.filter((change) => change.connectionId !== connectionId),
            )
            setTableQueries((current) =>
              Object.fromEntries(
                Object.entries(current).filter(([key]) => !key.startsWith(`${connectionId}\u0000`)),
              ),
            )
            setBatchRowsByTable((current) =>
              Object.fromEntries(
                Object.entries(current).filter(([key]) => !key.startsWith(`${connectionId}\u0000`)),
              ),
            )
            if (connectionId === activeConnectionId) {
              const nextConnectionId = nextConnections[0]?.id ?? null
              setActiveConnectionId(nextConnectionId)
              if (nextConnectionId) setDefaultDatabaseConnection(nextConnectionId)
              resetTable()
            }
            setConnectionNotice("Conexão excluída")
          }}
        />
      </MountWhen>
    </box>
  )
}
