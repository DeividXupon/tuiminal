import { type RefObject, useCallback, useEffect, useRef, useState } from "react"
import {
  type DatabaseBatchSelectedRow,
  databaseBatchRange,
  databaseBatchRangeDirection,
} from "../model/batch"
import { batchRow, type DatabaseGridRow } from "../model/workspace"

export function useDatabaseSelectionSweep({
  rows,
  selectedIndexRef,
  updateSelectedRows,
  moveRow,
  resetKey,
}: {
  rows: DatabaseGridRow[]
  selectedIndexRef: RefObject<number>
  updateSelectedRows: (
    update: (current: DatabaseBatchSelectedRow[]) => DatabaseBatchSelectedRow[],
  ) => void
  moveRow: (delta: number) => void
  resetKey: unknown
}) {
  const [active, setActive] = useState(false)
  const activeRef = useRef(false)
  const anchorIndexRef = useRef<number | null>(null)
  const selectRange = useCallback(
    (currentIndex: number) => {
      const anchorIndex = anchorIndexRef.current ?? currentIndex
      const batchRows = rows.map(batchRow)
      updateSelectedRows(() => databaseBatchRange(batchRows, anchorIndex, currentIndex))
    },
    [rows, updateSelectedRows],
  )
  const toggle = useCallback(() => {
    if (activeRef.current) {
      activeRef.current = false
      anchorIndexRef.current = null
      setActive(false)
      return
    }
    const anchorIndex = Math.max(0, Math.min(rows.length - 1, selectedIndexRef.current))
    if (!rows[anchorIndex]) return
    activeRef.current = true
    anchorIndexRef.current = anchorIndex
    selectRange(anchorIndex)
    setActive(true)
  }, [rows, selectRange, selectedIndexRef])
  const move = useCallback(
    (delta: number) => {
      const index = Math.max(0, Math.min(rows.length - 1, selectedIndexRef.current + delta))
      if (activeRef.current) selectRange(index)
      moveRow(delta)
    },
    [moveRow, rows.length, selectRange, selectedIndexRef],
  )
  const handleVerticalKey = useCallback(
    (key: { name: string; preventDefault: () => void; stopPropagation: () => void }) => {
      const direction = databaseBatchRangeDirection(key.name)
      if (!direction) return false
      key.preventDefault()
      key.stopPropagation()
      move(direction)
      return true
    },
    [move],
  )
  const clear = useCallback(() => {
    activeRef.current = false
    anchorIndexRef.current = null
    setActive(false)
  }, [])
  useEffect(() => {
    void resetKey
    clear()
  }, [clear, resetKey])
  return { active, clear, handleVerticalKey, move, toggle }
}
