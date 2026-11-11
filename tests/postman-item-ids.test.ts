import { expect, test } from "bun:test"
import { PostmanApi } from "../packages/feature-http/src/postman/api"
import { LivePostmanSession } from "../packages/feature-http/src/postman/live-session"

const collectionId = "12ece9e1-2abf-4edc-8e34-de66e74114d2"
const collectionUid = `12345678-${collectionId}`
const folderId = "65a99e60-8e0a-4b6e-b79c-7d8264cc5caa"
const requestId = "b64ce176-82e0-42bd-a14e-2589050f568f"

test.each([collectionId, collectionUid])(
  "item endpoints use the collection ID for %s",
  async (id) => {
    const calls: Array<{ path: string; method: string; body?: unknown }> = []
    const api = new PostmanApi({ apiKey: "PMAK-fixture", region: "us" }, async (input, init) => {
      calls.push({
        path: new URL(String(input)).pathname,
        method: init?.method ?? "GET",
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      })
      return Response.json({ collection: {}, data: { owner: 12345678 } })
    })
    await api.collection(collectionUid)
    await api.updateRequest(id, requestId, { description: "# Updated docs" })
    await api.createRequest(id, "New request")
    await api.deleteRequest(id, requestId)
    await api.createFolder(id, "New folder")
    await api.renameFolder(id, folderId, "Renamed")
    await api.deleteFolder(id, folderId)
    await api.copyFolder(id, folderId)
    expect(calls.map(({ method, path }) => `${method} ${path}`)).toEqual([
      `GET /collections/${collectionUid}`,
      `PUT /collections/${collectionId}/requests/${requestId}`,
      `POST /collections/${collectionId}/requests`,
      `DELETE /collections/${collectionId}/requests/${requestId}`,
      `POST /collections/${collectionId}/folders`,
      `PUT /collections/${collectionId}/folders/${folderId}`,
      `DELETE /collections/${collectionId}/folders/${folderId}`,
      `GET /collections/${collectionId}/folders/${folderId}`,
      "POST /collection-folders-transfers",
    ])
    expect(calls[1]?.body).toEqual({ description: "# Updated docs" })
    expect(calls.at(-1)?.body).toMatchObject({
      ids: [`12345678-${folderId}`],
      target: { id: collectionUid, model: "collection" },
    })
  },
)

test("live documentation saves read by UID and update by ID, including clearing the description", async () => {
  const remoteRequest = { method: "GET", url: "https://example.invalid", description: "Original" }
  const remote = {
    info: { name: "Documentation" },
    item: [
      {
        id: requestId,
        name: "Read",
        request: remoteRequest,
        event: [{ listen: "test", script: { exec: ["// preserved"] } }],
      },
    ],
  }
  const updates: unknown[] = []
  const api = new PostmanApi({ apiKey: "PMAK-fixture", region: "us" }, async (input, init) => {
    const path = new URL(String(input)).pathname
    if (path === "/collections")
      return Response.json({
        collections: [{ id: collectionId, uid: collectionUid, name: "Documentation" }],
      })
    if (path === "/workspaces/w1/global-variables") return Response.json({ values: [] })
    if (path === `/collections/${collectionUid}` && init?.method === "GET")
      return Response.json({ collection: remote })
    if (path === `/collections/${collectionId}/requests/${requestId}` && init?.method === "PUT") {
      const update = JSON.parse(String(init.body))
      updates.push(update)
      Object.assign(remoteRequest, update)
      return Response.json({ data: { id: requestId } })
    }
    return Response.json({ error: { message: "Collection ID required" } }, { status: 400 })
  })
  const session = new LivePostmanSession(api, "w1")
  try {
    await session.load()
    const original = session.view.projectRequests[0]?.request
    if (!original) throw new Error("Missing request fixture")
    const description = "# Updated\n\nDescrição **editada** 日本語.\n"
    const saved = await session.save({ ...original, description })
    expect(saved.description).toBe(description)
    expect(updates).toEqual([{ description }])
    const cleared = await session.save({ ...saved, description: "" })
    expect(cleared.description).toBe("")
    expect(updates).toEqual([{ description }, { description: "" }])
    expect(remote.item[0]?.event).toEqual([{ listen: "test", script: { exec: ["// preserved"] } }])
  } finally {
    session.dispose()
  }
})
