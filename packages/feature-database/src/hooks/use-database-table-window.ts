import type { ScrollBoxRenderable } from "@opentui/core"
import {
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react"
import { databaseQueryWindowTarget } from "../model/query-window"
import { DATABASE_TABLE_WINDOW_STEP, mergeDatabaseTableWindow } from "../model/table-window"
import type { DatabaseTable, DatabaseTableQuery, TablePage } from "../model/types"
import { loadTablePage } from "../services/database"

function scrollToWindowRow(
  scroll: ScrollBoxRenderable | null,
  direction: -1 | 1,
  selectedIndex: number,
) {
  if (!scroll) return
  const viewportHeight = Math.max(1, Math.floor(scroll.viewport.height))
  scroll.scrollTo(direction < 0 ? selectedIndex : Math.max(0, selectedIndex - viewportHeight + 1))
}

export function useDatabaseTableWindow({
  connectionId,
  table,
  query,
  revealSensitive,
  contextKey,
  page,
  setPage,
  selectRow,
  scrollRef,
  onQueryStart,
}: {
  connectionId: string | null
  table: DatabaseTable | null
  query: DatabaseTableQuery
  revealSensitive: boolean
  contextKey: string
  page: TablePage | null
  setPage: Dispatch<SetStateAction<TablePage | null>>
  selectRow: (index: number) => void
  scrollRef: RefObject<ScrollBoxRenderable | null>
  onQueryStart?: (sql: string) => void
}) {
  const [offset, setOffset] = useState(0)
  const [loadingDirection, setLoadingDirection] = useState<-1 | 1 | null>(null)
  const [loadError, setLoadError] = useState("")
  const requestRef = useRef<object | null>(null)
  const contextRef = useRef(contextKey)
  const activeContextRef = useRef(contextKey)
  contextRef.current = contextKey

  useEffect(() => {
    if (activeContextRef.current === contextKey) return
    activeContextRef.current = contextKey
    requestRef.current = null
    setLoadingDirection(null)
    setLoadError("")
  }, [contextKey])

  useEffect(
    () => () => {
      requestRef.current = null
    },
    [],
  )

  const reset = useCallback(() => {
    requestRef.current = null
    setOffset(0)
    setLoadingDirection(null)
    setLoadError("")
  }, [])

  const applyFetched = useCallback(
    (
      fetched: TablePage,
      direction: -1 | 1,
      target: NonNullable<ReturnType<typeof databaseQueryWindowTarget>>,
      request: object,
    ) => {
      if (requestRef.current !== request || contextRef.current !== contextKey || !page) return
      if (!fetched.rows.length) {
        if (direction > 0) {
          setPage((current) => (current === page ? { ...current, hasMore: false } : current))
        }
        return
      }
      const merged = mergeDatabaseTableWindow(page, fetched, direction)
      const selectedIndex = Math.min(target.selectedIndex, merged.rows.length - 1)
      setPage(merged)
      setOffset(target.offset)
      selectRow(selectedIndex)
      setTimeout(() => {
        if (contextRef.current !== contextKey) return
        scrollToWindowRow(scrollRef.current, direction, selectedIndex)
      }, 0)
    },
    [contextKey, page, scrollRef, selectRow, setPage],
  )

  const load = useCallback(
    async (direction: -1 | 1) => {
      if (!connectionId || !table || !page || requestRef.current) return
      const target = databaseQueryWindowTarget({
        direction,
        windowOffset: offset,
        rowCount: page.rows.length,
        hasRowsBefore: offset > 0,
        hasRowsAfter: page.hasMore,
      })
      if (!target) return
      const request = {}
      requestRef.current = request
      setLoadingDirection(direction)
      setLoadError("")
      try {
        const fetched = await loadTablePage(
          connectionId,
          table,
          target.fetchOffset,
          DATABASE_TABLE_WINDOW_STEP,
          revealSensitive,
          query,
          {
            recordHistory: false,
            onQueryStart: (sql) => {
              if (requestRef.current === request && contextRef.current === contextKey) {
                onQueryStart?.(sql)
              }
            },
          },
        )
        applyFetched(fetched, direction, target, request)
      } catch (error) {
        if (requestRef.current === request && contextRef.current === contextKey) {
          setLoadError(
            error instanceof Error ? error.message : "Não foi possível carregar os registros.",
          )
        }
      } finally {
        if (requestRef.current === request) {
          requestRef.current = null
          setLoadingDirection(null)
        }
      }
    },
    [
      applyFetched,
      connectionId,
      contextKey,
      offset,
      onQueryStart,
      page,
      query,
      revealSensitive,
      table,
    ],
  )

  return { offset, loadingDirection, loadError, load, reset }
}
