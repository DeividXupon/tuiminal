import { useMemo, useRef } from "react"

export function useIdentifiedQueryRows(rows: Array<Record<string, unknown>>) {
  const ids = useRef(new WeakMap<object, string>())
  const sequence = useRef(0)
  return useMemo(
    () =>
      rows.map((row) => {
        let id = ids.current.get(row)
        if (!id) {
          sequence.current += 1
          id = `query-row-${sequence.current}`
          ids.current.set(row, id)
        }
        return { id, row }
      }),
    [rows],
  )
}
