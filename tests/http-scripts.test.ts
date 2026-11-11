import { expect, test } from "bun:test"
import { createScratchRequest } from "../packages/feature-http/src/model/workspace"
import { runHttpScript } from "../packages/feature-http/src/services/request-scripts"
import {
  parseHttpFile,
  serializeHttpRequestBlock,
} from "../packages/feature-http/src/model/http-file"
test("scripts update variables and requests, collect assertions and remain serializable", async () => {
  const request = createScratchRequest("scripts")
  request.scripts = {
    preRequest:
      'pm.variables.set("token", "demo"); pm.request.headers.upsert({ key: "X-Test", value: "yes" }); pm.test("value", () => pm.expect(pm.variables.get("token")).to.equal("demo"));',
    postResponse: "",
  }
  const result = await runHttpScript(request.scripts.preRequest, request, new Map())
  expect(result.variables.get("token")?.value).toBe("demo")
  expect(result.request.headers.some((h) => h.name === "X-Test")).toBe(true)
  expect(result.assertions[0]?.passed).toBe(true)
  expect(request.headers.some((h) => h.name === "X-Test")).toBe(false)
  const file = parseHttpFile(serializeHttpRequestBlock(request), "/fixture.http")
  expect(file.requests[0]?.editable).toBe(true)
  expect(file.requests[0]?.scripts).toEqual(request.scripts)
})
test("scripts report failures and enforce a deadline", async () => {
  const request = createScratchRequest("scripts")
  await expect(runHttpScript('throw Error("failure")', request, new Map())).rejects.toThrow(
    "failure",
  )
  await expect(runHttpScript("while (true) {}", request, new Map())).rejects.toThrow()
  const result = await runHttpScript(
    'pm.test("failed", () => pm.expect(1).to.equal(2))',
    request,
    new Map(),
  )
  expect(result.assertions[0]?.passed).toBe(false)
})

test("Postman environment scopes survive sends, isolate environments and preserve precedence", async () => {
  const { HttpScriptScopeStore } = await import(
    "../packages/feature-http/src/services/script-scopes"
  )
  const store = new HttpScriptScopeStore()
  const request = createScratchRequest("scopes")
  const context = (environment = "staging") =>
    store.context(
      new Map(),
      {
        environment,
        globals: "globals",
        collectionVariables: "collection",
      },
      {
        environment: { host: "staging" },
        globals: { shared: "global" },
        collectionVariables: { count: "1" },
      },
    )
  const first = await runHttpScript(
    `
    pm.environment.set("token", "private-token");
    pm.globals.set("globalToken", "shared-token");
    pm.collectionVariables.set("count", "2");
    pm.test("scopes", () => {
      pm.expect(pm.environment.get("host")).to.equal("staging");
      pm.expect(pm.variables.get("shared")).to.equal("global");
    });
  `,
    request,
    context(),
  )
  expect(first.assertions[0]?.passed).toBe(true)
  expect(context().get("token")?.value).toBe("private-token")
  expect(context("production").get("token")).toBeUndefined()
  expect(context("production").get("globalToken")?.value).toBe("shared-token")
  await runHttpScript('pm.environment.unset("token")', request, context())
  expect(context().has("token")).toBe(false)
})

test("pre-request and post-response run through transport and preserve response on script failure", async () => {
  const { runHttpCollectionCase } = await import(
    "../packages/feature-http/src/services/collection-runner"
  )
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: (request) => Response.json({ token: request.headers.get("X-Token") }),
  })
  try {
    const request = createScratchRequest("transport-script")
    request.url = `http://127.0.0.1:${server.port}`
    request.scripts = {
      preRequest:
        'pm.environment.set("token", "private-fixture"); pm.request.headers.upsert({key:"X-Token",value:pm.environment.get("token")});',
      postResponse:
        'pm.test("received", () => { pm.response.to.have.status(200); pm.expect(pm.response.json()).to.deep.equal({token: "private-fixture"}); }); pm.environment.set("result", pm.response.json().token);',
    }
    const send = () =>
      runHttpCollectionCase({
        name: "scripts",
        items: [{ filePath: "fixture.http", request }],
        variables: new Map(),
        root: "/tmp",
      })
    const success = await send()
    expect(success.items[0]?.response?.status).toBe(200)
    expect(success.items[0]?.response?.assertions?.[0]?.passed).toBe(true)
    request.scripts.postResponse = 'throw Error("post failure")'
    const failed = await send()
    expect(failed.items[0]?.response?.status).toBe(200)
    expect(failed.items[0]?.response?.assertions?.[0]?.passed).toBe(false)
    request.scripts.preRequest = 'throw Error("pre failure")'
    expect((await send()).items[0]?.error?.message).toContain("pre failure")
  } finally {
    server.stop(true)
  }
}, 15000)

test("async Postman tests settle and cancellation stops an owned script worker", async () => {
  const request = createScratchRequest("async-script")
  const result = await runHttpScript(
    'pm.test("async", done => setTimeout(() => { pm.expect(true).to.be.true; done(); }, 10));',
    request,
    new Map(),
  )
  expect(result.assertions[0]?.passed).toBe(true)
  const controller = new AbortController()
  const promise = runHttpScript(
    "setTimeout(() => {}, 10000)",
    request,
    new Map(),
    undefined,
    controller.signal,
  )
  controller.abort()
  await expect(promise).rejects.toThrow()
})

test("script failures retain generated secrets in privacy context", async () => {
  const { HttpScriptExecutionError } = await import(
    "../packages/feature-http/src/services/request-scripts"
  )
  try {
    await runHttpScript(
      'pm.environment.set("token", "new-private-token"); throw Error(pm.environment.get("token"));',
      createScratchRequest("private-script"),
      new Map(),
    )
    throw new Error("Expected script failure")
  } catch (error) {
    expect(error).toBeInstanceOf(HttpScriptExecutionError)
    expect((error as Error).message).not.toContain("new-private-token")
    expect(
      (error as InstanceType<typeof HttpScriptExecutionError>).variables.get("token")?.secret,
    ).toBe(true)
  }
})

test("collection script variables do not leak into another collection in a run", async () => {
  const { HttpScriptScopeStore } = await import(
    "../packages/feature-http/src/services/script-scopes"
  )
  const { runHttpCollectionCase } = await import(
    "../packages/feature-http/src/services/collection-runner"
  )
  const store = new HttpScriptScopeStore()
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("ok") })
  try {
    const first = createScratchRequest("first", `http://127.0.0.1:${server.port}`)
    first.scripts = {
      preRequest:
        'pm.collectionVariables.set("collectionToken", "only-first"); pm.environment.set("sharedToken", "both");',
      postResponse: "",
    }
    const second = createScratchRequest("second", first.url)
    second.scripts = {
      preRequest:
        'pm.test("isolated", () => { pm.expect(pm.variables.has("collectionToken")).to.be.false; pm.expect(pm.environment.get("sharedToken")).to.equal("both"); });',
      postResponse: "",
    }
    const run = await runHttpCollectionCase({
      name: "scopes",
      root: "/tmp",
      variables: new Map(),
      items: [
        { filePath: "first.http", request: first },
        { filePath: "second.http", request: second },
      ],
      variablesForRequest: (request) =>
        store.context(
          new Map(),
          { environment: "env", globals: "globals", collectionVariables: request.id },
          { environment: {}, globals: {}, collectionVariables: {} },
        ),
    })
    expect(run.items[1]?.response?.assertions?.[0]?.passed).toBe(true)
  } finally {
    server.stop(true)
  }
})
