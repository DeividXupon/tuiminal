import { describe, expect, test } from "bun:test"
import {
  buildHttpCollectionTree,
  httpCollectionNodeId,
} from "../packages/feature-http/src/model/collection-tree"
import { createScratchRequest, nextHttpMethod } from "../packages/feature-http/src/model/workspace"
import type { HttpProjectRequestItem } from "../packages/feature-http/src/model/types"

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

  test("shows Postman collections directly and keeps folder rows stable across toggles", () => {
    const path = "postman/users.http"
    const linked = [item(path, "one", "Admin / List"), item(path, "two", "Admin / Create", "POST")]
    const folders = [{ filePath: path, id: "folder-1", path: "Admin", remoteHash: "hash" }]
    const open = buildHttpCollectionTree(linked, new Set(), "", ["postman"], [path], folders, true)
    const folderId = `folder:${path}:folder-1`
    expect(open.map((row) => [row.kind, row.depth])).toEqual([
      ["file", 0],
      ["folder", 1],
      ["request", 2],
      ["request", 2],
    ])
    expect(open.some((row) => row.id === "directory:postman")).toBe(false)
    const closed = buildHttpCollectionTree(
      linked,
      new Set([folderId]),
      "",
      ["postman"],
      [path],
      folders,
      true,
    )
    expect(closed.map((row) => row.id)).toEqual([`file:${path}`, folderId])
    expect(
      buildHttpCollectionTree(linked, new Set(), "", ["postman"], [path], folders, true),
    ).toEqual(open)
  })
})

describe("HTTP method cycling", () => {
  test("cycles forward and backward through the stable method list", () => {
    expect(nextHttpMethod("GET", -1)).toBe("OPTIONS")
    expect(nextHttpMethod("OPTIONS", 1)).toBe("GET")
    expect(nextHttpMethod("CUSTOM", 1)).toBe("GET")
  })
})
