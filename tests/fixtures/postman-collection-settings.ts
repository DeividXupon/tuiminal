export function collectionSettingsFixture() {
  const collectionId = "12ece9e1-2abf-4edc-8e34-de66e74114d2"
  const collectionUid = `12345678-${collectionId}`
  const path = `postman/${collectionId}.http`
  let remote: Record<string, unknown> = {
    info: {
      name: "Settings Demo",
      _postman_id: collectionId,
      schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    },
    auth: { type: "bearer", bearer: [{ key: "token", value: "{{token}}" }] },
    variable: [{ key: "token", value: "synthetic-token", description: "Preserve metadata" }],
    event: [
      {
        listen: "prerequest",
        script: { type: "text/javascript", exec: ['pm.variables.set("collectionScript", "yes");'] },
      },
    ],
    item: [
      {
        id: "folder-1",
        name: "Parent Folder",
        auth: {
          type: "basic",
          basic: [
            { key: "username", value: "user" },
            { key: "password", value: "{{password}}" },
          ],
        },
        item: [
          {
            id: "folder-2",
            name: "Child Folder",
            item: [
              {
                id: "request-1",
                name: "Read",
                request: { method: "GET", url: "https://example.invalid/read" },
                response: [{ name: "Saved example" }],
              },
            ],
          },
        ],
      },
    ],
  }
  const controls = {
    failRead: false,
    failWrite: false,
    ignoreWrite: false,
    failConfirmation: false,
  }
  let confirmationPending = false
  const writes: Record<string, unknown>[] = []
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    if (url.origin !== "https://api.postman.com") throw new Error("Unexpected fixture origin")
    const endpoint = url.pathname
    if (endpoint === "/workspaces")
      return Response.json({ workspaces: [{ id: "settings-w1", name: "Settings Workspace" }] })
    if (endpoint === "/environments") return Response.json({ environments: [] })
    if (endpoint === "/collections")
      return Response.json({
        collections: [{ id: collectionId, uid: collectionUid, name: "Settings Demo" }],
      })
    if (endpoint === "/workspaces/settings-w1/global-variables")
      return Response.json({ values: [] })
    if (endpoint === `/collections/${collectionUid}`) {
      if (init?.method === "PUT") {
        const document = JSON.parse(String(init.body)).collection
        writes.push(document)
        if (controls.failWrite) return new Response(null, { status: 400 })
        if (!controls.ignoreWrite) remote = structuredClone(document)
        confirmationPending = controls.failConfirmation
        return Response.json({ collection: { id: collectionId } })
      }
      if (controls.failRead || confirmationPending) {
        confirmationPending = false
        return new Response(null, { status: 503 })
      }
      return Response.json({ collection: remote })
    }
    throw new Error(`Unexpected fixture endpoint: ${endpoint}`)
  }) as typeof globalThis.fetch
  return { collectionId, collectionUid, path, controls, writes, fetch, remote: () => remote }
}
