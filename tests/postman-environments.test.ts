import "./setup"
import { expect, test } from "bun:test"
import { PostmanApi } from "../packages/feature-http/src/postman/api"

test("environment writes use scoped Postman endpoints and retain variable metadata", async () => {
  const calls: Array<{ url: URL; method: string; body: unknown }> = []
  const api = new PostmanApi(
    { apiKey: "PMAK-environment-tests", region: "us" },
    async (input, init) => {
      calls.push({
        url: new URL(String(input)),
        method: init?.method ?? "GET",
        body: init?.body ? JSON.parse(String(init.body)) : null,
      })
      return Response.json({ environment: { id: "environment", uid: "owner-environment" } })
    },
  )
  const values = [
    {
      key: "token",
      value: "fixture",
      enabled: false,
      type: "secret",
      source: { provider: "fixture" },
    },
  ]
  expect(await api.createEnvironment("workspace", "Staging", values)).toBe("owner-environment")
  await api.saveEnvironment("owner-environment", "Renamed", values)
  await api.saveGlobals("workspace", values)
  await api.deleteEnvironment("owner-environment")
  expect(calls.map((call) => [call.method, call.url.pathname, call.url.search])).toEqual([
    ["POST", "/environments", "?workspace=workspace"],
    ["PUT", "/environments/owner-environment", ""],
    ["PUT", "/workspaces/workspace/global-variables", ""],
    ["DELETE", "/environments/owner-environment", ""],
  ])
  expect(calls[1]?.body).toEqual({ environment: { name: "Renamed", values } })
  expect(calls[2]?.body).toEqual({ values })
  await expect(api.saveGlobals("../other-workspace", values)).rejects.toThrow()
  await expect(api.deleteEnvironment("environment?workspace=other")).rejects.toThrow()
  expect(calls).toHaveLength(4)
})

test("environment selection and saving globals publish fresh variable contexts", async () => {
  const { LivePostmanSession } = await import("../packages/feature-http/src/postman/live-session")
  const { createScratchRequest } = await import("../packages/feature-http/src/model/workspace")
  const api = new PostmanApi({ apiKey: "PMAK-environment-tests", region: "us" }, async () =>
    Response.json({}),
  )
  const session = new LivePostmanSession(api, "workspace")
  const request = createScratchRequest("request")
  const first = session.view
  session.setGlobals([{ key: "host", value: "global", enabled: true }])
  expect(session.view.variablesForRequest).not.toBe(first.variablesForRequest)
  expect(session.view.variablesForRequest(request).get("host")?.value).toBe("global")
  session.setEnvironment("env", "Staging", [{ key: "host", value: "stage", enabled: true }])
  expect(session.variablesForRequest(request).get("host")?.value).toBe("stage")
  session.setEnvironment(undefined, null, [])
  expect(session.variablesForRequest(request).get("host")?.value).toBe("global")
  session.dispose()
  expect(() => session.setGlobals([])).toThrow("Conexão Postman cancelada.")
})
