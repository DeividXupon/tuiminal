import { describe, expect, test } from "bun:test"
import {
  httpCollectionSelectionAfterAction,
  visibleHttpCollectionSelection,
  resolveHttpCollectionTreeCommand,
} from "../packages/feature-http/src/model/collection-tree-navigation"
import type { HttpCollectionTreeRow } from "../packages/feature-http/src/model/collection-tree"
import type { HttpProjectRequestItem } from "../packages/feature-http/src/model/types"

const rows: HttpCollectionTreeRow[] = [
  {
    id: "directory:api",
    kind: "directory",
    path: "api",
    name: "api",
    depth: 0,
    expanded: true,
    requestCount: 1,
  },
  {
    id: "file:api/users.http",
    kind: "file",
    path: "api/users.http",
    name: "users.http",
    depth: 1,
    expanded: true,
    requestCount: 1,
  },
  {
    id: "request:api/users.http#list",
    kind: "request",
    path: "api/users.http",
    depth: 2,
    item: {
      filePath: "api/users.http",
      request: { id: "api/users.http#list" },
    } as HttpProjectRequestItem,
  },
]

describe("HTTP collection tree keyboard", () => {
  test("moves between visible rows and handles parent and child", () => {
    expect(resolveHttpCollectionTreeCommand({ name: "down" }, rows, null, false)).toEqual({
      kind: "select",
      id: rows[0]!.id,
    })
    expect(resolveHttpCollectionTreeCommand({ name: "j" }, rows, rows[0]!.id, false)).toEqual({
      kind: "select",
      id: rows[1]!.id,
    })
    expect(resolveHttpCollectionTreeCommand({ name: "right" }, rows, rows[1]!.id, false)).toEqual({
      kind: "select",
      id: rows[2]!.id,
    })
    expect(resolveHttpCollectionTreeCommand({ name: "left" }, rows, rows[2]!.id, false)).toEqual({
      kind: "select",
      id: rows[1]!.id,
    })
    expect(resolveHttpCollectionTreeCommand({ name: "left" }, rows, rows[1]!.id, false)).toEqual({
      kind: "toggle",
      id: rows[1]!.id,
    })
    expect(resolveHttpCollectionTreeCommand({ name: "end" }, rows, null, false)).toEqual({
      kind: "select",
      id: rows[2]!.id,
    })
    expect(resolveHttpCollectionTreeCommand({ name: "right" }, rows, null, false)).toEqual({
      kind: "select",
      id: rows[0]!.id,
    })
    expect(resolveHttpCollectionTreeCommand({ name: "right" }, rows, rows[2]!.id, false)).toEqual({
      kind: "noop",
    })
    expect(
      resolveHttpCollectionTreeCommand({ name: "enter" }, rows, rows[2]!.id, false)?.kind,
    ).toBe("open")
  })

  test("scopes editing shortcuts and deletion confirmation", () => {
    expect(resolveHttpCollectionTreeCommand({ name: "n" }, rows, null, false)).toEqual({
      kind: "create-request",
    })
    expect(resolveHttpCollectionTreeCommand({ name: "n", shift: true }, rows, null, false)).toEqual(
      { kind: "create-collection" },
    )
    expect(resolveHttpCollectionTreeCommand({ name: "p" }, rows, null, false)).toEqual({
      kind: "create-folder",
    })
    expect(resolveHttpCollectionTreeCommand({ name: "d" }, rows, rows[1]!.id, false)).toEqual({
      kind: "delete",
    })
    expect(resolveHttpCollectionTreeCommand({ name: "escape" }, rows, rows[1]!.id, true)).toEqual({
      kind: "cancel-delete",
    })
    expect(resolveHttpCollectionTreeCommand({ name: "enter" }, rows, rows[1]!.id, true)).toEqual({
      kind: "confirm-delete",
    })
    expect(
      resolveHttpCollectionTreeCommand({ name: "n", ctrl: true }, rows, null, false),
    ).toBeNull()
  })

  test("keeps the keyboard cursor on the created or renamed item", () => {
    expect(httpCollectionSelectionAfterAction("create-folder", rows[0]!, "v2")).toBe(
      "directory:api/v2",
    )
    expect(httpCollectionSelectionAfterAction("create-collection", rows[0]!, "Users")).toBe(
      "file:api/Users.http",
    )
    expect(httpCollectionSelectionAfterAction("create-request", rows[1]!, "List")).toBe(rows[1]!.id)
    expect(httpCollectionSelectionAfterAction("rename", rows[1]!, "People")).toBe(
      "file:api/People.http",
    )
    expect(httpCollectionSelectionAfterAction("delete", rows[2]!, "")).toBe(rows[1]!.id)
    expect(visibleHttpCollectionSelection(rows.slice(0, 1), rows[1]!.id)).toBe(rows[0]!.id)
  })
})
