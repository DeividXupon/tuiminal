/** Keep README captures independent of the OS credential store and real Postman accounts. */
export function installReadmeHttpAccount(connected = false, beforeCreate?: () => Promise<void>) {
  const originalSecrets = Bun.secrets
  const originalFetch = globalThis.fetch
  Object.assign(Bun, {
    secrets: {
      get: async () =>
        connected ? JSON.stringify({ apiKey: "PMAK-demo-fixture", region: "us" }) : null,
      set: async () => {},
      delete: async () => true,
    },
  })
  let collection: { info: { name: string; schema: string }; item: unknown[] } | undefined
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input)).pathname
    if (path === "/workspaces")
      return Response.json({ workspaces: [{ id: "demo-team", name: "Acme API" }] })
    if (path === "/collections" && init?.method === "POST") {
      await beforeCreate?.()
      collection = (JSON.parse(String(init.body)) as { collection: NonNullable<typeof collection> })
        .collection
      return Response.json({ collection: { id: "demo-created", name: collection.info.name } })
    }
    if (path === "/collections/demo-created" && collection) return Response.json({ collection })
    if (path === "/collections")
      return Response.json({
        collections: collection ? [{ id: "demo-created", name: collection.info.name }] : [],
      })
    if (path === "/environments")
      return Response.json({ environments: [{ id: "demo-stage", name: "Staging" }] })
    if (path === "/environments/demo-stage")
      return Response.json({
        environment: {
          name: "Staging",
          values: [
            { key: "base_url", value: "https://staging.example.invalid", enabled: true },
            { key: "tenant", value: "demo", enabled: true },
          ],
        },
      })
    if (path.endsWith("/global-variables"))
      return Response.json({
        values: [{ key: "base_url", value: "https://api.example.invalid", enabled: true }],
      })
    throw new Error(`Unexpected HTTP demo endpoint: ${path}`)
  }) as typeof fetch
  return () => {
    Object.assign(Bun, { secrets: originalSecrets })
    globalThis.fetch = originalFetch
  }
}
