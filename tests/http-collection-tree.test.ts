import { describe, expect, test } from "bun:test"
import {
  buildHttpCollectionTree,
  httpCollectionNodeId,
} from "../src/features/http/model/collection-tree"
import { createScratchRequest, nextHttpMethod } from "../src/features/http/model/workspace"
import type { HttpProjectRequestItem } from "../src/features/http/model/types"

function item(filePath: string, id: string, name: string, method = "GET"): HttpProjectRequestItem {
  return {
    filePath,
    request: {
      ...createScratchRequest(id),
      source: { kind: "file", path: filePath, blockId: id, sourceHash: "hash" },
      name,
      method,
    },
  }
}

describe("HTTP collection tree", () => {
  const requests = [
    item("api/users.http", "list", "List users"),
    item("api/users.http", "create", "Create user", "POST"),
    item("health.http", "health", "Health check"),
  ]

  test("groups requests by directory and file with stable depths", () => {
    const rows = buildHttpCollectionTree(requests)
    expect(rows.map((row) => [row.kind, row.path, row.depth])).toEqual([
      ["directory", "api", 0],
      ["file", "api/users.http", 1],
      ["request", "api/users.http", 2],
      ["request", "api/users.http", 2],
      ["file", "health.http", 0],
      ["request", "health.http", 1],
    ])
  })

  test("collapses branches and expands matching ancestors while searching", () => {
    const collapsed = new Set([
      httpCollectionNodeId("directory", "api"),
      httpCollectionNodeId("file", "health.http"),
    ])
    expect(buildHttpCollectionTree(requests, collapsed).map((row) => row.id)).toEqual([
      "directory:api",
      "file:health.http",
    ])
    const matches = buildHttpCollectionTree(requests, collapsed, "POST create")
    expect(matches.map((row) => row.id)).toEqual([
      "directory:api",
      "file:api/users.http",
      "request:create",
    ])
  })
})

describe("HTTP method cycling", () => {
  test("cycles forward and backward through the stable method list", () => {
    expect(nextHttpMethod("GET", -1)).toBe("OPTIONS")
    expect(nextHttpMethod("OPTIONS", 1)).toBe("GET")
    expect(nextHttpMethod("CUSTOM", 1)).toBe("GET")
  })
})
