import { expect, test } from "bun:test"
import {
  LivePostmanSession,
  type LivePostmanApi,
} from "../packages/feature-http/src/postman/live-session"
import { createLivePostmanRequest } from "../packages/feature-http/src/postman/live-mutations"
import { createScratchRequest } from "../packages/feature-http/src/model/workspace"

function fixture() {
  const item: Record<string, unknown>[] = []
  const writes: Record<string, unknown>[] = []
  let readFailure = false
  const api = {
    async collections() {
      return [{ id: "c1", name: "Remote" }]
    },
    async collection() {
      if (readFailure) throw new Error("offline")
      return structuredClone({ info: { name: "Remote" }, item })
    },
    async globals() {
      return []
    },
    async createRequest(
      _collection: string,
      name: string,
      _folder: string | undefined,
      fields: Record<string, unknown>,
    ) {
      writes.push(fields)
      item.push({
        id: "r1",
        name,
        event: [
          { listen: "prerequest", script: { exec: fields.preRequestScript ?? "" } },
          { listen: "test", script: { exec: fields.tests ?? "" } },
        ],
        request: {
          method: fields.method,
          url: fields.url,
          description: fields.description,
          header: fields.headerData,
          auth: fields.auth,
          ...(fields.dataMode === "raw"
            ? { body: { mode: "raw", raw: fields.rawModeData, options: fields.dataOptions } }
            : {}),
        },
      })
      return { data: { id: "r1" } }
    },
    async updateRequest(_collection: string, _id: string, fields: Record<string, unknown>) {
      writes.push(fields)
      const request = item[0]!.request as Record<string, unknown>
      if (fields.headerData) request.header = fields.headerData
      if (fields.auth) request.auth = fields.auth
      return {}
    },
  } as unknown as LivePostmanApi
  return {
    session: new LivePostmanSession(api, "w1"),
    item,
    writes,
    failReads: (fail: boolean) => {
      readFailure = fail
    },
  }
}

test("scratch creation sends the edited payload in one API call and confirms it without local storage", async () => {
  const { session, item, writes } = fixture()
  await session.load()
  const draft = {
    ...createScratchRequest("draft", "https://example.invalid/create"),
    name: "Create",
    method: "POST",
    description: "Documentation",
    body: { kind: "json" as const, text: '{"enabled":true}', form: [] },
  }
  const created = await createLivePostmanRequest(session, "postman/c1.http", draft)
  expect(writes).toHaveLength(1)
  expect(writes[0]).toMatchObject({
    method: "POST",
    url: draft.url,
    description: draft.description,
    dataMode: "raw",
    rawModeData: draft.body.text,
  })
  expect(created.source).toMatchObject({ postman: { requestId: "r1" } })
  expect(created.body.text).toBe(draft.body.text)
  expect(item).toHaveLength(1)
})

test("retrying creation after a failed confirmation does not create another remote request", async () => {
  const { session, item, writes, failReads } = fixture()
  await session.load()
  const draft = {
    ...createScratchRequest("draft", "https://example.invalid/create"),
    name: "Create",
  }
  failReads(true)
  await expect(createLivePostmanRequest(session, "postman/c1.http", draft)).rejects.toThrow(
    "confirmação falhou",
  )
  expect(writes).toHaveLength(1)
  failReads(false)
  const created = await createLivePostmanRequest(session, "postman/c1.http", draft)
  expect(created.url).toBe(draft.url)
  expect(writes).toHaveLength(1)
  expect(item).toHaveLength(1)
})

test("creating after clearing proxy, assertions and chaining sends only supported request fields", async () => {
  const { session, writes } = fixture()
  await session.load()
  const draft = createScratchRequest("draft", "https://example.invalid/create")
  draft.options = { ...draft.options, proxy: "", noLog: false }
  draft.assertions = []
  draft.chain = { dependsOn: "", extract: [] }
  const created = await createLivePostmanRequest(session, "postman/c1.http", draft)
  expect(created.url).toBe(draft.url)
  expect(writes).toHaveLength(1)
  expect(writes[0]).not.toHaveProperty("options")
  expect(writes[0]).not.toHaveProperty("assertions")
  expect(writes[0]).not.toHaveProperty("chain")
})

test.each(["Opções", "Assertions", "Chaining"])(
  "creation rejects unsupported %s without writing or changing the draft",
  async (section) => {
    const { session, writes } = fixture()
    await session.load()
    const draft = createScratchRequest("draft", "https://example.invalid/create")
    if (section === "Opções") draft.options = { ...draft.options, proxy: "http://localhost:8080" }
    if (section === "Assertions") draft.assertions = [{ id: "check", expression: "status == 200" }]
    if (section === "Chaining")
      draft.chain = { extract: [{ name: "token", jsonPath: "$.token", secret: true }] }
    const original = structuredClone(draft)
    await expect(createLivePostmanRequest(session, "postman/c1.http", draft)).rejects.toThrow(
      `${section} e tente novamente.`,
    )
    expect(writes).toHaveLength(0)
    expect(draft).toEqual(original)
  },
)

test("editing other headers preserves imported secrets and confirms the new header", async () => {
  const { session, item, writes } = fixture()
  item.push({
    id: "r1",
    name: "Read",
    request: {
      method: "GET",
      url: "https://example.invalid",
      header: [{ key: "Authorization", value: "Bearer synthetic-fixture" }],
    },
  })
  await session.load()
  const request = session.view.projectRequests[0]!.request
  expect(JSON.stringify(request)).not.toContain("synthetic-fixture")
  const saved = await session.save({
    ...request,
    headers: [
      ...request.headers,
      { id: "new", name: "X-Mode", value: "test", enabled: true, sensitivity: "normal" },
    ],
  })
  expect(writes[0]).toMatchObject({
    headerData: [
      { key: "Authorization", value: "Bearer synthetic-fixture" },
      { key: "X-Mode", value: "test" },
    ],
  })
  expect(saved.headers[1]?.value).toBe("test")
  expect(JSON.stringify(saved)).not.toContain("synthetic-fixture")
})

test("a remote secret change in edited headers is a conflict, without exposing the secret", async () => {
  const { session, item, writes } = fixture()
  item.push({
    id: "r1",
    name: "Read",
    request: {
      method: "GET",
      url: "https://example.invalid",
      header: [{ key: "Authorization", value: "Bearer synthetic-before" }],
    },
  })
  await session.load()
  const request = session.view.projectRequests[0]!.request
  ;(item[0]!.request as Record<string, unknown>).header = [
    { key: "Authorization", value: "Bearer synthetic-after" },
  ]
  const draft = {
    ...request,
    headers: [
      ...request.headers,
      { id: "new", name: "X-Mode", value: "test", enabled: true, sensitivity: "normal" as const },
    ],
  }
  await expect(session.save(draft)).rejects.toThrow("campos editados")
  expect(writes).toHaveLength(0)
})

test("Postman creation preserves both scripts through failed confirmation and retry", async () => {
  const { session, writes, failReads } = fixture()
  await session.load()
  const draft = {
    ...createScratchRequest("scripts-draft", "https://example.invalid"),
    scripts: {
      preRequest: 'pm.environment.set("token", "fixture");',
      postResponse: 'pm.test("OK", () => pm.response.to.have.status(200));',
    },
  }
  failReads(true)
  await expect(createLivePostmanRequest(session, "postman/c1.http", draft)).rejects.toThrow()
  expect(draft.scripts.preRequest).toContain("pm.environment")
  expect(writes[0]).toMatchObject({
    preRequestScript: draft.scripts.preRequest,
    tests: draft.scripts.postResponse,
  })
  failReads(false)
  const saved = await createLivePostmanRequest(session, "postman/c1.http", draft)
  expect(saved.scripts).toEqual(draft.scripts)
  expect(writes).toHaveLength(1)
})
