import { expect, test } from "bun:test"
import { PostmanApi } from "../packages/feature-http/src/postman/api"

test("creates a personal workspace through the regional API and returns its remote identity", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  const api = new PostmanApi({ apiKey: "PMAK-fixture", region: "eu" }, async (input, init) => {
    calls.push({ url: String(input), ...(init ? { init } : {}) })
    return Response.json({ workspace: { id: "created-id", name: "My workspace" } })
  })
  expect(await api.createWorkspace("  My workspace  ")).toEqual({
    id: "created-id",
    name: "My workspace",
  })
  expect(calls).toHaveLength(1)
  expect(calls[0]?.url).toBe("https://api.eu.postman.com/workspaces")
  expect(calls[0]?.init).toMatchObject({
    method: "POST",
    headers: { "x-api-key": "PMAK-fixture", "content-type": "application/json" },
    redirect: "error",
  })
  expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
    workspace: { name: "My workspace", type: "personal" },
  })
})

test("a denied creation is reported without retrying or exposing the response body", async () => {
  let calls = 0
  const api = new PostmanApi({ apiKey: "PMAK-fixture", region: "us" }, async () => {
    calls++
    return new Response("PMAK-fixture", { status: 403 })
  })
  await expect(api.createWorkspace("Denied")).rejects.toThrow("A conta não tem acesso")
  expect(calls).toBe(1)
})
