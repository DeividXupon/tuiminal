import { expect, test } from "bun:test"
import { collectionSettingsFixture } from "./fixtures/postman-collection-settings"
import { PostmanApi } from "../packages/feature-http/src/postman/api"
import { LivePostmanSession } from "../packages/feature-http/src/postman/live-session"
import {
  postmanCollectionSettings,
  postmanSettingsNode,
} from "../packages/feature-http/src/postman/collection-settings"
import type { HttpCollectionSettingsDocument } from "../packages/feature-http/src/model/collection-settings"
import { runHttpScriptPhase } from "../packages/feature-http/src/services/request-scripts"

async function fixture(folderId?: string) {
  const fake = collectionSettingsFixture()
  const session = new LivePostmanSession(
    new PostmanApi({ apiKey: "PMAK-settings-fixture", region: "us" }, fake.fetch),
    "settings-w1",
  )
  await session.load()
  const editor = postmanCollectionSettings(session)
  const target = {
    id: folderId ?? "collection",
    name: "Settings",
    path: fake.path,
    kind: folderId ? ("folder" as const) : ("file" as const),
    ...(folderId ? { folderId } : {}),
  }
  const doc: HttpCollectionSettingsDocument = {
    ...(await editor.read(target)),
    id: "settings",
    target,
    tab: "authorization",
    revision: 1,
    savedRevision: 0,
  }
  return { ...fake, session, editor, doc }
}

test("saved inherited settings apply to an already open request without replacing its own edits", async () => {
  const f = await fixture("folder-1")
  const draft = { ...f.session.view.projectRequests[0]!.request, method: "POST" }
  f.doc.auth = { kind: "inherit" }
  f.doc.scripts.preRequest =
    'pm.test("folder", () => pm.expect(pm.variables.get("collectionScript")).to.eql("yes"));'
  await f.editor.save(f.doc)
  const request = f.session.requestForExecution(draft)
  expect(request.method).toBe("POST")
  expect(request.auth).toEqual({ kind: "bearer", token: "{{token}}" })
  expect(draft.auth.kind).toBe("basic")
  const custom = f.session.requestForExecution({ ...draft, auth: { kind: "none" } })
  expect(custom.auth).toEqual({ kind: "none" })
  const result = await runHttpScriptPhase(
    "preRequest",
    request,
    f.session.variablesForRequest(request),
  )
  expect(result.assertions).toMatchObject([{ passed: true }])
  f.session.dispose()
})

test("collection settings save auth, scripts and variables while preserving requests and unrelated edits", async () => {
  const f = await fixture()
  const items = structuredClone(f.remote().item)
  f.remote().description = "Concurrent description"
  f.doc.auth = { kind: "bearer", token: "{{newToken}}" }
  f.doc.scripts.postResponse = 'pm.test("collection", () => pm.expect(true).to.be.true);'
  f.doc.variables[0]!.value = "new-synthetic-token"
  const saved = await f.editor.save(f.doc)
  expect(saved.auth).toEqual(f.doc.auth)
  expect(saved.scripts).toEqual(f.doc.scripts)
  expect(f.remote().item).toEqual(items)
  expect(f.remote().description).toBe("Concurrent description")
  expect(saved.variables[0]?.metadata?.description).toBe("Preserve metadata")
  expect(f.writes).toHaveLength(1)
  f.session.dispose()
})

test("variable confirmation accepts server-generated IDs and retry does not replay an accepted write", async () => {
  const f = await fixture()
  const replace = f.session.api.replaceCollection?.bind(f.session.api)
  if (!replace) throw new Error("Missing fixture writer")
  f.session.api.replaceCollection = async (id, document) => {
    await replace(id, document)
    const values = f.remote().variable as Array<Record<string, unknown>>
    for (const [index, variable] of values.entries()) variable.id = `remote-${index}`
    return structuredClone(f.remote())
  }
  f.doc.variables.push({ id: "draft", name: "newVar", value: "newValue", enabled: true })
  f.controls.failConfirmation = true
  await expect(f.editor.save(f.doc)).rejects.toThrow()
  f.controls.failConfirmation = false
  const saved = await f.editor.save(f.doc)
  expect(saved.variables[1]).toMatchObject({ name: "newVar", value: "newValue" })
  expect(f.writes).toHaveLength(1)
  f.session.dispose()
})

test("nested folders inherit the nearest parent, can override it, or explicitly disable auth", async () => {
  const f = await fixture("folder-2")
  expect(f.doc.auth).toEqual({ kind: "inherit" })
  expect(f.session.view.projectRequests[0]!.request.auth.kind).toBe("basic")
  f.doc.auth = { kind: "bearer", token: "{{childToken}}" }
  Object.assign(f.doc, await f.editor.save(f.doc))
  expect(f.session.view.projectRequests[0]!.request.auth).toEqual(f.doc.auth)
  f.doc.auth = { kind: "inherit" }
  Object.assign(f.doc, await f.editor.save(f.doc))
  expect(postmanSettingsNode(f.remote(), "folder-2").auth).toBeNull()
  expect(f.session.view.projectRequests[0]!.request.auth.kind).toBe("basic")
  f.doc.auth = { kind: "none" }
  await f.editor.save(f.doc)
  expect(postmanSettingsNode(f.remote(), "folder-2").auth).toEqual({ type: "noauth" })
  expect(f.session.view.projectRequests[0]!.request.auth).toEqual({ kind: "none" })
  f.session.dispose()
})

test("same-field conflicts reject the save, unrelated auth does not overwrite unsupported auth", async () => {
  const f = await fixture()
  f.remote().auth = { type: "oauth2", oauth2: [{ key: "accessToken", value: "{{oauth}}" }] }
  f.doc.scripts.preRequest = "// edited"
  await f.editor.save(f.doc)
  expect(f.remote().auth).toMatchObject({ type: "oauth2" })
  f.doc.auth = { kind: "none" }
  await expect(f.editor.save(f.doc)).rejects.toThrow("configurações mudaram")
  expect(f.writes).toHaveLength(1)
  f.session.dispose()
})

test.each(["failRead", "failWrite", "ignoreWrite", "failConfirmation"] as const)(
  "%s preserves settings and retry confirms an accepted write without replay",
  async (failure) => {
    const f = await fixture()
    f.doc.auth = { kind: "none" }
    f.controls[failure] = true
    const original = structuredClone(f.doc)
    await expect(f.editor.save(f.doc)).rejects.toThrow()
    expect(f.doc).toEqual(original)
    f.controls[failure] = false
    const result = await f.editor.save(f.doc)
    expect(result.auth).toEqual({ kind: "none" })
    expect(f.writes).toHaveLength(failure === "failRead" || failure === "failConfirmation" ? 1 : 2)
    f.session.dispose()
  },
)
