import { expect, test } from "bun:test"
import { rebaseHttpSavedRequest } from "../packages/feature-http/src/model/saved-request"
import {
  POSTMAN_EDIT_CONFLICT,
  POSTMAN_SAVE_UNCONFIRMED,
  saveLivePostmanRequest,
} from "../packages/feature-http/src/postman/live-save"
import { livePostmanCollection } from "../packages/feature-http/src/postman/live-view"

const phases = ["preRequest", "postResponse"] as const
const listeners = { preRequest: "prerequest", postResponse: "test" }
const payloadKeys = { preRequest: "preRequestScript", postResponse: "tests" }

function fixture() {
  const selected = { id: "c1", name: "Scripts" }
  const item = {
    id: "r1",
    name: "Read",
    request: { method: "GET", url: "https://example.invalid" },
    event: phases.map((phase) => ({
      listen: listeners[phase],
      script: { exec: [`// original ${phase}`] },
    })),
  }
  const remote = { info: { name: selected.name }, item: [item] }
  const collection = livePostmanCollection(selected, structuredClone(remote))
  const imported = collection.requests[0]?.request
  if (!imported?.scripts) throw new Error("Missing fixture request scripts")
  const request = { ...imported, scripts: imported.scripts }
  const writes: Record<string, unknown>[] = []
  let ignore = false
  let afterWrite = () => {}
  const setScript = (phase: (typeof phases)[number], text: string) => {
    const event = item.event.find((event) => event.listen === listeners[phase])
    if (!event) throw new Error("Missing fixture event")
    event.script.exec = [text]
  }
  const api = {
    async collection() {
      return structuredClone(remote)
    },
    async updateRequest(_collection: string, _request: string, fields: Record<string, unknown>) {
      writes.push(fields)
      if (ignore) return {}
      if (typeof fields.method === "string") item.request.method = fields.method
      for (const phase of phases) {
        const value = fields[payloadKeys[phase]]
        if (typeof value === "string") setScript(phase, value)
      }
      afterWrite()
      return {}
    },
  }
  return {
    request,
    writes,
    item,
    setScript,
    save: (draft: typeof imported = request) => saveLivePostmanRequest(api, collection, draft),
    ignore: (value: boolean) => {
      ignore = value
    },
    afterWrite: (callback: () => void) => {
      afterWrite = callback
    },
  }
}

for (const phase of phases) {
  const other = phase === "preRequest" ? "postResponse" : "preRequest"

  test.each(["// local edit", ""])(
    `saves ${phase} as %j with other pending edits while preserving remote ${other}`,
    async (text) => {
      const h = fixture()
      const draft = {
        ...h.request,
        method: "POST",
        scripts: { ...h.request.scripts, [phase]: text },
      }
      h.setScript(other, "// collaborator edit")
      const result = await h.save(draft)
      expect(h.writes).toEqual([{ method: "POST", [payloadKeys[phase]]: text }])
      expect(result.request.scripts).toEqual({
        ...h.request.scripts,
        [phase]: text,
        [other]: "// collaborator edit",
      })
      expect(result.request.method).toBe("POST")
      await h.save(result.request)
      expect(h.writes).toHaveLength(1)
    },
  )

  test(`conflicting ${phase} keeps the entire draft and sends no update`, async () => {
    const h = fixture()
    const draft = {
      ...h.request,
      method: "POST",
      scripts: { ...h.request.scripts, [phase]: "// local edit" },
    }
    const original = structuredClone(draft)
    h.setScript(phase, "// collaborator edit")
    await expect(h.save(draft)).rejects.toThrow(POSTMAN_EDIT_CONFLICT)
    expect(h.writes).toEqual([])
    expect(h.item.request.method).toBe("GET")
    expect(draft).toEqual(original)
  })

  test(`an already accepted ${phase} edit confirms without replaying and adopts remote ${other}`, async () => {
    const h = fixture()
    const draft = {
      ...h.request,
      scripts: { ...h.request.scripts, [phase]: "// accepted" },
    }
    h.setScript(phase, "// accepted")
    h.setScript(other, "// collaborator edit")
    const result = await h.save(draft)
    expect(h.writes).toEqual([])
    expect(result.request.scripts).toEqual({
      ...h.request.scripts,
      [phase]: "// accepted",
      [other]: "// collaborator edit",
    })
  })

  test(`confirmation checks only edited ${phase} when remote ${other} changes during save`, async () => {
    const h = fixture()
    h.afterWrite(() => h.setScript(other, "// changed during save"))
    const result = await h.save({
      ...h.request,
      scripts: { ...h.request.scripts, [phase]: "// local edit" },
    })
    expect(result.request.scripts?.[other]).toBe("// changed during save")
    expect(h.writes).toEqual([{ [payloadKeys[phase]]: "// local edit" }])
  })

  test(`unconfirmed ${phase} edits remain retryable without replacing remote ${other}`, async () => {
    const h = fixture()
    const draft = {
      ...h.request,
      scripts: { ...h.request.scripts, [phase]: "// local edit" },
    }
    const original = structuredClone(draft)
    h.setScript(other, "// collaborator edit")
    h.ignore(true)
    await expect(h.save(draft)).rejects.toThrow(POSTMAN_SAVE_UNCONFIRMED)
    expect(draft).toEqual(original)
    h.ignore(false)
    const result = await h.save(draft)
    expect(result.request.scripts).toEqual({
      ...h.request.scripts,
      [phase]: "// local edit",
      [other]: "// collaborator edit",
    })
  })

  test(`editing ${phase} during save preserves the confirmed remote ${other}`, () => {
    const h = fixture()
    const submitted = { ...h.request, method: "POST" }
    const current = {
      ...submitted,
      scripts: { ...submitted.scripts, [phase]: "" },
    }
    const saved = {
      ...submitted,
      scripts: { ...submitted.scripts, [other]: "// collaborator edit" },
    }
    const rebased = rebaseHttpSavedRequest(current, submitted, saved)
    expect(rebased.scripts).toEqual({
      ...h.request.scripts,
      [phase]: "",
      [other]: "// collaborator edit",
    })
    expect(rebased.source).toBe(saved.source)
  })
}

test("saves edits to both script phases together", async () => {
  const h = fixture()
  const scripts = { preRequest: "// before", postResponse: "// after" }
  const result = await h.save({ ...h.request, scripts })
  expect(result.request.scripts).toEqual(scripts)
  expect(h.writes).toEqual([{ preRequestScript: scripts.preRequest, tests: scripts.postResponse }])
})
