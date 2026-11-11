import { expect, test } from "bun:test"
import {
  LivePostmanSession,
  type LivePostmanApi,
} from "../packages/feature-http/src/postman/live-session"
import { manageLivePostmanCollection } from "../packages/feature-http/src/postman/live-mutations"
import {
  POSTMAN_EDIT_CONFLICT,
  POSTMAN_SAVE_UNCONFIRMED,
} from "../packages/feature-http/src/postman/live-save"

function fixture() {
  const remote = {
    info: { name: "API Collection" },
    variable: [{ key: "scope", value: "collection" }],
    item: [
      {
        id: "r1",
        name: "Read",
        request: {
          method: "GET",
          url: "https://example.invalid/original",
          description: "Original",
        },
        event: [{ listen: "test" }],
      },
    ],
  }
  let writes = 0
  let fail = false
  let ignore = false
  const api = {
    async collections() {
      return [{ id: "c1", name: "API Collection" }]
    },
    async collection() {
      if (fail) throw new Error("offline")
      return structuredClone(remote)
    },
    async globals() {
      return [{ key: "scope", value: "global" }]
    },
    async environments() {
      return [{ id: "e1", name: "Test" }]
    },
    async environment() {
      return { name: "Test", values: [{ key: "scope", value: "environment" }] }
    },
    async updateRequest(
      _collectionId: string,
      _requestId: string,
      fields: Record<string, unknown>,
    ) {
      writes++
      if (ignore) return {}
      Object.assign(remote.item[0]!.request, fields)
      return {}
    },
    async createFolder(_id: string, name: string) {
      ;(remote.item as unknown[]).push({ id: "folder1", name, item: [] })
      return {}
    },
  } as unknown as LivePostmanApi
  const session = new LivePostmanSession(api, "w1", "e1")
  return {
    session,
    remote,
    writes: () => writes,
    fail: () => {
      fail = true
    },
    ignore: () => {
      ignore = true
    },
  }
}

test("Postman reads each workspace from the API, retains variables only in its session and uses stable remote IDs", async () => {
  const { session, remote } = fixture()
  await session.load()
  const first = session.view.projectRequests[0]!.request
  expect(first.id).toBe("postman/c1.http#r1")
  expect(session.variablesForRequest(first).get("scope")).toMatchObject({
    value: "environment",
    secret: true,
  })
  remote.item[0]!.request.url = "https://example.invalid/latest"
  const next = await session.openRequest(first)
  expect(next.url).toBe("https://example.invalid/latest")
  expect(next.id).toBe(first.id)
  remote.item = []
  await session.load()
  expect(session.view.projectRequests).toEqual([])
  session.dispose()
  expect(session.variablesForRequest(first).has("scope")).toBe(false)
})

test("saving merges an unrelated remote edit and ignores scripts when checking edited fields", async () => {
  const { session, remote, writes } = fixture()
  await session.load()
  const draft = { ...session.view.projectRequests[0]!.request, method: "POST" }
  remote.item[0]!.request.description = "Collaborator docs"
  remote.item[0]!.event.push({ listen: "prerequest" })
  const saved = await session.save(draft)
  expect(saved.method).toBe("POST")
  expect(saved.description).toBe("Collaborator docs")
  expect(writes()).toBe(1)
  expect(remote.item[0]!.event).toHaveLength(2)
})

test.each(["proxy", "assertions", "chain", "defaults", "order"])(
  "saving after restoring %s does not mistake empty editor state for unsupported settings",
  async (field) => {
    const { session, remote, writes } = fixture()
    await session.load()
    const draft = { ...session.view.projectRequests[0]!.request, method: "POST" }
    if (field === "proxy") draft.options = { ...draft.options, proxy: "  " }
    if (field === "assertions") draft.assertions = []
    if (field === "chain") draft.chain = { dependsOn: "", extract: [] }
    if (field === "defaults")
      draft.options = { ...draft.options, noLog: false, timeoutExplicit: false }
    if (field === "order")
      draft.options = Object.fromEntries(
        Object.entries(draft.options).reverse(),
      ) as typeof draft.options
    const saved = await session.save(draft)
    expect(saved.method).toBe("POST")
    expect(writes()).toBe(1)
    expect(remote.item[0]!.request).toEqual({
      method: "POST",
      url: "https://example.invalid/original",
      description: "Original",
    })
  },
)

test.each(["Opções", "Assertions", "Chaining"])(
  "saving retains unsupported %s edits and explains how to correct them",
  async (section) => {
    const { session, writes } = fixture()
    await session.load()
    const before = session.view.projectRequests[0]!.request
    const draft = { ...before, method: "POST" }
    if (section === "Opções") draft.options = { ...draft.options, timeoutExplicit: true }
    if (section === "Assertions") draft.assertions = [{ id: "check", expression: "status == 200" }]
    if (section === "Chaining") draft.chain = { dependsOn: "login", extract: [] }
    const original = structuredClone(draft)
    await expect(session.save(draft)).rejects.toThrow(`${section} e tente novamente.`)
    expect(writes()).toBe(0)
    expect(draft).toEqual(original)
    expect(session.view.projectRequests[0]!.request).toBe(before)
  },
)

test("same-field conflicts and failed reads keep drafts and the last confirmed view untouched", async () => {
  const { session, remote, writes, fail } = fixture()
  await session.load()
  const before = session.view.projectRequests[0]!.request
  const draft = { ...before, method: "POST" }
  remote.item[0]!.request.method = "PUT"
  await expect(session.save(draft)).rejects.toThrow(POSTMAN_EDIT_CONFLICT)
  expect(writes()).toBe(0)
  expect(session.view.projectRequests[0]!.request).toBe(before)
  fail()
  await expect(session.save(draft)).rejects.toThrow("offline")
  expect(draft.method).toBe("POST")
  expect(writes()).toBe(0)
})

test("an ignored remote update never marks the request saved", async () => {
  const { session, ignore } = fixture()
  await session.load()
  const before = session.view.projectRequests[0]!.request
  ignore()
  await expect(session.save({ ...before, method: "POST" })).rejects.toThrow(
    POSTMAN_SAVE_UNCONFIRMED,
  )
  expect(session.view.projectRequests[0]!.request).toBe(before)
})

test("retry after an uncertain but accepted update confirms without replaying the write", async () => {
  const { session, remote, writes } = fixture()
  await session.load()
  const draft = { ...session.view.projectRequests[0]!.request, method: "POST" }
  remote.item[0]!.request.method = "POST"
  const result = await session.save(draft)
  expect(result.method).toBe("POST")
  expect(writes()).toBe(0)
})

test("creating a folder uses current API data without rejecting unrelated collection changes", async () => {
  const { session, remote } = fixture()
  await session.load()
  remote.item[0]!.request.url = "https://example.invalid/changed"
  await manageLivePostmanCollection(
    session,
    "create-folder",
    { kind: "file", path: "postman/c1.http" } as Parameters<typeof manageLivePostmanCollection>[2],
    "Customers",
  )
  expect(session.view.sourcePostmanFolders[0]?.path).toBe("Customers")
  expect(session.view.projectRequests[0]?.request.url).toBe("https://example.invalid/changed")
})

test("a late save confirmation preserves later edits and adopts unrelated remote fields", async () => {
  const { rebaseHttpSavedRequest } = await import(
    "../packages/feature-http/src/model/saved-request"
  )
  const { session } = fixture()
  await session.load()
  const submitted = { ...session.view.projectRequests[0]!.request, method: "POST" }
  const current = { ...submitted, url: "https://example.invalid/typed-while-saving" }
  const saved = { ...submitted, description: "Collaborator docs" }
  const result = rebaseHttpSavedRequest(current, submitted, saved)
  expect(result.url).toBe(current.url)
  expect(result.description).toBe("Collaborator docs")
  expect(result.method).toBe("POST")
})

test("reordering same-name requests retains remote IDs and their bodies", async () => {
  const { livePostmanCollection } = await import("../packages/feature-http/src/postman/live-view")
  const items = ["a", "b", "c"].map((id) => ({
    id,
    name: "New Request",
    request: {
      method: "POST",
      url: "",
      body: { mode: "urlencoded", urlencoded: [{ key: "key", value: id }] },
    },
  }))
  const before = livePostmanCollection({ id: "c1", name: "Same" }, { item: items })
  const after = livePostmanCollection({ id: "c1", name: "Same" }, { item: items.toReversed() })
  expect(before.file.requests).toHaveLength(3)
  expect(new Set(before.requests.map((item) => item.request.id)).size).toBe(3)
  for (const item of before.requests) {
    const current = after.requests.find((next) => next.request.id === item.request.id)
    expect(current?.request.body).toEqual(item.request.body)
  }
})
