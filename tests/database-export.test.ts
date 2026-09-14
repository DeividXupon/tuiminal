import { expect, test } from "bun:test"
import {
  previewDatabaseBatchExport,
  serializeDatabaseBatchRows,
  type DatabaseBatchSelectedRow,
} from "../packages/feature-database/src/model/batch"

const rows: DatabaseBatchSelectedRow[] = Array.from({ length: 30 }, (_, index) => ({
  id: String(index),
  rowKey: null,
  data: {
    id: BigInt(index),
    name: 'quoted, "tab\tline\n中文🧪',
    payload: new Uint8Array([1, 2]),
    object: { nested: [1, "two"] },
  },
}))

test.each(["csv", "tsv", "json"] as const)(
  "bounded %s previews exactly match complete export prefixes",
  (format) => {
    for (const selected of [[], rows.slice(0, 1), rows]) {
      for (const columns of [[], ["id"], ["id", "name", "payload", "object", "missing"]]) {
        const complete = serializeDatabaseBatchRows(selected, columns, format)
        for (const limit of [0, 1, 2, 3, 4, 7, 20, 80]) {
          expect(previewDatabaseBatchExport(selected, columns, format, limit)).toEqual(
            complete.split("\n", limit),
          )
        }
      }
    }
  },
)

test.each(["csv", "tsv", "json"] as const)(
  "%s preview does not read rows outside its visible prefix",
  (format) => {
    let reads = 0
    const selected = Array.from({ length: 2000 }, (_, index) => ({
      id: String(index),
      rowKey: null,
      data: {
        get value() {
          reads += 1
          return index
        },
      },
    }))
    expect(previewDatabaseBatchExport(selected, ["value"], format, 10)).toHaveLength(10)
    expect(reads).toBe(10)
  },
)
