import type { ScrollBoxRenderable } from "@opentui/core"
import {
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useCallback,
  useEffect,
  useState,
} from "react"
import {
  DATABASE_QUERY_RESULT_WINDOW_STEP,
  type DatabaseQueryWindowDirection,
  databaseQueryWindowTarget,
  mergeDatabaseQueryWindow,
} from "../model/query-window"
import type { DatabaseQueryResult } from "../model/types"
import { LOADING_FRAMES } from "../rendering/constants"
import { executeDatabaseQuery } from "../services/database"

export function useDatabaseQueryWindow({
  connectionId,
  result,
  sqlRef,
  revealSensitive,
  requestRef,
  scrollRef,
  setBusy,
  setNotice,
  setResult,
  selectRow,
}: {
  connectionId: string
  result: DatabaseQueryResult | null
  sqlRef: RefObject<string | null>
  revealSensitive: boolean
  requestRef: RefObject<AbortController | null>
  scrollRef: RefObject<ScrollBoxRenderable | null>
  setBusy: (busy: boolean) => void
  setNotice: (notice: string) => void
  setResult: Dispatch<SetStateAction<DatabaseQueryResult | null>>
  selectRow: (index: number) => void
}) {
  const [loadingDirection, setLoadingDirection] = useState<DatabaseQueryWindowDirection | null>(
    null,
  )
  const [loadingFrameIndex, setLoadingFrameIndex] = useState(0)

  useEffect(() => {
    if (loadingDirection === null) {
      setLoadingFrameIndex(0)
      return
    }
    const timer = setInterval(
      () => setLoadingFrameIndex((current) => (current + 1) % LOADING_FRAMES.length),
      80,
    )
    return () => clearInterval(timer)
  }, [loadingDirection])

  const load = useCallback(
    async (direction: DatabaseQueryWindowDirection) => {
      const sql = sqlRef.current
      const target = result ? databaseQueryWindowTarget({ direction, ...result }) : null
      if (!result || !sql || !target || requestRef.current) return

      const controller = new AbortController()
      requestRef.current = controller
      setBusy(true)
      setNotice("")
      setLoadingDirection(direction)
      try {
        const nextResult = await executeDatabaseQuery(connectionId, sql, revealSensitive, {
          signal: controller.signal,
          resultOffset: target.fetchOffset,
          resultLimit: DATABASE_QUERY_RESULT_WINDOW_STEP,
          recordHistory: false,
        })
        if (!nextResult.rows.length) {
          setResult((current) => {
            if (current !== result) return current
            const hasRowsBefore = direction < 0 ? false : current.hasRowsBefore
            const hasRowsAfter = direction > 0 ? false : current.hasRowsAfter
            return {
              ...current,
              hasRowsBefore,
              hasRowsAfter,
              truncated: hasRowsBefore || hasRowsAfter,
            }
          })
          return
        }

        const mergedResult = mergeDatabaseQueryWindow({
          current: result,
          fetched: nextResult,
          direction,
          windowOffset: target.offset,
        })
        const selectedIndex = Math.min(target.selectedIndex, mergedResult.rows.length - 1)
        setResult(mergedResult)
        selectRow(selectedIndex)
        setTimeout(() => {
          const scroll = scrollRef.current
          if (!scroll) return
          const viewportHeight = Math.max(1, Math.floor(scroll.viewport.height))
          const maximumScrollTop = Math.max(0, mergedResult.rows.length - viewportHeight)
          const scrollTop =
            direction < 0
              ? Math.min(maximumScrollTop, selectedIndex)
              : Math.max(0, selectedIndex - viewportHeight + 1)
          scroll.scrollTo(scrollTop)
        }, 0)
      } catch (error) {
        setNotice(
          controller.signal.aborted
            ? "Consulta cancelada."
            : error instanceof Error
              ? error.message
              : "Não foi possível carregar os registros.",
        )
      } finally {
        if (requestRef.current === controller) {
          requestRef.current = null
          setBusy(false)
        }
        setLoadingDirection(null)
      }
    },
    [
      connectionId,
      requestRef,
      result,
      revealSensitive,
      scrollRef,
      selectRow,
      setBusy,
      setNotice,
      setResult,
      sqlRef,
    ],
  )

  return {
    load,
    loadingDirection,
    loadingFrame: LOADING_FRAMES[loadingFrameIndex] ?? LOADING_FRAMES[0],
  }
}
