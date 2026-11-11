import { expect, test } from "bun:test"
import {
  countPostmanRequests,
  countPostmanWorkspaceRequests,
} from "../packages/feature-http/src/postman/request-count"

test("Postman totals include nested requests, empty folders and unsupported methods", () => {
  expect(
    countPostmanRequests({
      item: [
        { request: { method: "GET" } },
        {
          item: [
            { request: "https://example.test" },
            { item: [{ request: { method: "CUSTOM" } }] },
          ],
        },
        { item: [] },
        null,
        { name: "No request" },
      ],
    }),
  ).toBe(3)
  expect(countPostmanRequests({ item: [] })).toBe(0)
})

test("workspace totals use collection UIDs and stop scheduling when dismissed", async () => {
  const calls: string[] = []
  let cancelled = false
  const api = {
    collections: async () => [
      { id: "one", uid: "owner-one", name: "One" },
      { id: "two", name: "Two" },
    ],
    collection: async (id: string) => {
      calls.push(id)
      return { item: [{ request: {} }] }
    },
  }
  expect(await countPostmanWorkspaceRequests(api, "workspace", () => cancelled)).toBe(2)
  expect(calls).toEqual(["owner-one", "two"])
  calls.length = 0
  api.collection = async (id) => {
    calls.push(id)
    cancelled = true
    return { item: [{ request: {} }] }
  }
  expect(await countPostmanWorkspaceRequests(api, "workspace", () => cancelled)).toBeUndefined()
  expect(calls).toEqual(["owner-one"])
})

test("failed collection reads never become misleading partial totals", async () => {
  const api = {
    collections: async () => [
      { id: "one", name: "One" },
      { id: "two", name: "Two" },
    ],
    collection: async (id: string) => {
      if (id === "two") throw new Error("unavailable")
      return { item: [{ request: {} }] }
    },
  }
  await expect(countPostmanWorkspaceRequests(api, "workspace", () => false)).rejects.toThrow(
    "unavailable",
  )
})
