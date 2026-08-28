import type { InputRenderable, SelectRenderable } from "@opentui/core"
import {
  useKeyboard,
  useRenderer,
  useTerminalDimensions,
} from "@opentui/react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  listDatabaseTables,
  loadTablePage,
  type DatabaseCatalog,
  type TablePage,
} from "../database"
import { COLORS } from "../theme"

const SIDEBAR_WIDTH = 29
const CELL_WIDTH = 18
const LOADING_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]

function fitCell(value: unknown, width = CELL_WIDTH) {
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
  if (text.length > width - 1) text = `${text.slice(0, width - 2)}…`
  return text.padEnd(width, " ")
}

export function DatabaseViewer({ active }: { active: boolean }) {
  const renderer = useRenderer()
  const terminal = useTerminalDimensions()
  const searchRef = useRef<InputRenderable | null>(null)
  const tableListRef = useRef<SelectRenderable | null>(null)
  const [catalog, setCatalog] = useState<DatabaseCatalog | null>(null)
  const [search, setSearch] = useState("")
  const [selectedTable, setSelectedTable] = useState<string | null>(null)
  const [pageIndex, setPageIndex] = useState(0)
  const [columnOffset, setColumnOffset] = useState(0)
  const [pageData, setPageData] = useState<TablePage | null>(null)
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [rowsLoading, setRowsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [motionFrame, setMotionFrame] = useState(0)
  const [revealedRows, setRevealedRows] = useState(0)

  const pageSize = Math.max(6, Math.min(30, terminal.height - 12))
  const tableListHeight = Math.max(6, terminal.height - 9)
  const tableAreaWidth = Math.max(20, terminal.width - SIDEBAR_WIDTH - 5)
  const columnsPerView = Math.max(
    1,
    Math.floor(tableAreaWidth / (CELL_WIDTH + 1)),
  )

  const filteredTables = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("pt-BR")
    if (!normalizedSearch) return catalog?.tables ?? []
    return (catalog?.tables ?? []).filter((table) =>
      table.toLocaleLowerCase("pt-BR").includes(normalizedSearch),
    )
  }, [catalog, search])

  const tableOptions = useMemo(
    () =>
      filteredTables.map((table) => ({
        name: table,
        description: "",
        value: table,
      })),
    [filteredTables],
  )

  const visibleColumns = useMemo(
    () =>
      (pageData?.columns ?? []).slice(
        columnOffset,
        columnOffset + columnsPerView,
      ),
    [columnOffset, columnsPerView, pageData],
  )

  const maxColumnOffset = Math.max(
    0,
    (pageData?.columns.length ?? 0) - columnsPerView,
  )

  const openTable = useCallback((tableName: string) => {
    setSelectedTable(tableName)
    setPageIndex(0)
    setColumnOffset(0)
    setPageData(null)
    setError(null)
  }, [])

  useEffect(() => {
    let cancelled = false
    setCatalogLoading(true)
    setError(null)

    void listDatabaseTables()
      .then((nextCatalog) => {
        if (cancelled) return
        setCatalog(nextCatalog)
        setCatalogLoading(false)
      })
      .catch((loadError: unknown) => {
        if (cancelled) return
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Não foi possível carregar as tabelas.",
        )
        setCatalogLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (active && catalog) tableListRef.current?.focus()
  }, [active, catalog])

  useEffect(() => {
    if (!selectedTable) return
    let cancelled = false
    setRowsLoading(true)
    setError(null)

    void loadTablePage(selectedTable, pageIndex * pageSize, pageSize)
      .then((nextPage) => {
        if (cancelled) return
        setPageData(nextPage)
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
  }, [pageIndex, pageSize, refreshKey, selectedTable])

  useEffect(() => {
    if (columnOffset > maxColumnOffset) setColumnOffset(maxColumnOffset)
  }, [columnOffset, maxColumnOffset])

  useEffect(() => {
    if (!catalogLoading && !rowsLoading) {
      setMotionFrame(0)
      return
    }

    const interval = setInterval(() => {
      setMotionFrame((current) => (current + 1) % LOADING_FRAMES.length)
    }, 80)

    return () => clearInterval(interval)
  }, [catalogLoading, rowsLoading])

  useEffect(() => {
    setRevealedRows(0)
    const rowCount = pageData?.rows.length ?? 0
    if (!rowCount) return

    const interval = setInterval(() => {
      setRevealedRows((current) => {
        const next = Math.min(rowCount, current + 3)
        if (next >= rowCount) clearInterval(interval)
        return next
      })
    }, 35)

    return () => clearInterval(interval)
  }, [pageData])

  useKeyboard((key) => {
    if (!active) return

    const focusedId = renderer.currentFocusedRenderable?.id

    if (focusedId === "table-search") {
      if (key.name === "escape") {
        key.preventDefault()
        tableListRef.current?.focus()
      }
      return
    }

    switch (key.name) {
      case "/":
      case "slash":
        key.preventDefault()
        searchRef.current?.focus()
        break
      case "n":
        if (pageData?.hasMore && !rowsLoading) {
          setPageIndex((current) => current + 1)
        }
        break
      case "p":
        if (pageIndex > 0 && !rowsLoading) {
          setPageIndex((current) => Math.max(0, current - 1))
        }
        break
      case "left":
        setColumnOffset((current) => Math.max(0, current - 1))
        break
      case "right":
        setColumnOffset((current) => Math.min(maxColumnOffset, current + 1))
        break
      case "r":
        if (selectedTable && !rowsLoading) {
          setRefreshKey((current) => current + 1)
        }
        break
      case "tab":
        key.preventDefault()
        if (focusedId === "table-list") searchRef.current?.focus()
        else tableListRef.current?.focus()
        break
    }
  })

  const headerLine = visibleColumns
    .map((column) =>
      fitCell(`${column.key === "PRI" ? "◆ " : ""}${column.field}`),
    )
    .join("│")
  const rowLines = (pageData?.rows ?? [])
    .slice(0, revealedRows)
    .map((row) =>
      visibleColumns.map((column) => fitCell(row[column.field])).join("│"),
    )
  const firstRow = pageData?.rows.length
    ? pageIndex * pageSize + 1
    : pageIndex * pageSize
  const lastRow = pageIndex * pageSize + (pageData?.rows.length ?? 0)

  return (
    <box style={{ flexGrow: 1, flexDirection: "row", padding: 1, gap: 1 }}>
      <box
        style={{
          width: SIDEBAR_WIDTH,
          border: true,
          borderStyle: "rounded",
          borderColor: COLORS.border,
          backgroundColor: COLORS.panel,
          paddingLeft: 1,
          paddingRight: 1,
        }}
      >
        <box style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <text
            content={catalog ? catalog.databaseName : "MYSQL MCP"}
            style={{ fg: COLORS.database }}
          />
          <text
            content={
              catalogLoading
                ? `${LOADING_FRAMES[motionFrame]} sync`
                : `${filteredTables.length}/${catalog?.tables.length ?? 0}`
            }
            style={{ fg: catalogLoading ? COLORS.database : COLORS.muted }}
          />
        </box>
        <input
          ref={searchRef}
          id="table-search"
          placeholder="Buscar tabela…"
          onInput={setSearch}
          onSubmit={() => {
            const firstTable = filteredTables[0]
            if (firstTable) openTable(firstTable)
            tableListRef.current?.focus()
          }}
          width={SIDEBAR_WIDTH - 4}
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
          selectedIndex={Math.max(
            0,
            filteredTables.findIndex((table) => table === selectedTable),
          )}
          onSelect={(_index, option) => {
            if (typeof option?.value === "string") openTable(option.value)
          }}
          showDescription={false}
          showScrollIndicator
          wrapSelection
          style={{
            width: SIDEBAR_WIDTH - 4,
            height: tableListHeight,
            backgroundColor: COLORS.panel,
            focusedBackgroundColor: COLORS.panel,
            textColor: COLORS.muted,
            focusedTextColor: COLORS.text,
            selectedBackgroundColor: COLORS.panelRaised,
            selectedTextColor: COLORS.database,
          }}
        />
      </box>

      <box
        style={{
          flexGrow: 1,
          border: true,
          borderStyle: "rounded",
          borderColor: COLORS.border,
          backgroundColor: COLORS.panel,
          paddingLeft: 1,
          paddingRight: 1,
        }}
      >
        <box
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
          }}
        >
          <text
            content={
              selectedTable
                ? selectedTable.length > 22
                  ? `${selectedTable.slice(0, 21)}…`
                  : selectedTable
                : "EXPLORADOR"
            }
            style={{ fg: COLORS.text }}
          />
          <text
            content={
              selectedTable
                ? `p.${pageIndex + 1}  ${firstRow}–${lastRow}  ◇ RO`
                : "selecione com Enter"
            }
            style={{ fg: COLORS.muted }}
          />
        </box>

        {error ? (
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
          </box>
        ) : !selectedTable ? (
          <box
            style={{ flexGrow: 1, alignItems: "center", justifyContent: "center" }}
          >
            <text content="Escolha uma tabela à esquerda" style={{ fg: COLORS.text }} />
            <text
              content="Use ↑/↓ e pressione Enter para visualizar"
              style={{ fg: COLORS.muted }}
            />
          </box>
        ) : rowsLoading || !pageData ? (
          <box
            style={{ flexGrow: 1, alignItems: "center", justifyContent: "center" }}
          >
            <text
              content={`${LOADING_FRAMES[motionFrame]} CONSULTANDO MCP MYSQL`}
              style={{ fg: COLORS.database }}
            />
          </box>
        ) : (
          <box style={{ flexGrow: 1 }}>
            <text
              content={`COLUNAS ${columnOffset + 1}–${Math.min(
                columnOffset + columnsPerView,
                pageData?.columns.length ?? 0,
              )} / ${pageData?.columns.length ?? 0}  •  ${pageData?.rows.length ?? 0} REGISTROS`}
              style={{ fg: COLORS.muted }}
            />
            <text
              content={headerLine || "Tabela sem colunas visíveis"}
              style={{
                fg: COLORS.database,
                bg: COLORS.panelRaised,
              }}
            />
            {rowLines.length ? (
              rowLines.map((line, index) => (
                <text
                  key={`${pageIndex}-${index}`}
                  content={line}
                  style={{
                    fg: COLORS.text,
                    bg:
                      index % 2 === 0 ? COLORS.panel : COLORS.panelRaised,
                  }}
                />
              ))
            ) : (
              <text content="Nenhum registro nesta página." style={{ fg: COLORS.muted }} />
            )}
          </box>
        )}

        <box style={{ marginTop: 1 }}>
          <text
            content="[/] BUSCA  [N/P] PÁG  [←/→] COL  [R] SYNC"
            style={{ fg: COLORS.muted }}
          />
        </box>
      </box>
    </box>
  )
}
