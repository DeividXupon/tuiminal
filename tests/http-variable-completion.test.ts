import { expect, test } from "bun:test"
import { createHttpVariableContext } from "../packages/feature-http/src/model/variables"
import { httpVariableInput } from "../packages/feature-http/src/model/variable-completion"
import { httpVariableSuggestions } from "../packages/feature-http/src/services/variable-suggestions"
import { HttpScriptScopeStore } from "../packages/feature-http/src/services/script-scopes"
import { createScratchRequest } from "../packages/feature-http/src/model/workspace"
import { prepareHttpRequest } from "../packages/feature-http/src/services/request-builder"
import { createHttpPreparedRequestPreview } from "../packages/feature-http/src/services/request-preview"
import {
  httpRequestSecretValues,
  httpSensitiveHeaderNames,
} from "../packages/feature-http/src/model/secrets"
import { urlVariableCompletion } from "../packages/feature-http/src/model/url-query"

const scopes = {
  environment: { env_env: "environment value", env_2: "second", shared: "winner" },
  globals: { golbal: "254157", shared: "global" },
  collectionVariables: { lps_name: "collection value", shared: "collection" },
}
function context() {
  const store = new HttpScriptScopeStore()
  return store.context(
    new Map(),
    { environment: "e", globals: "g", collectionVariables: "c" },
    scopes,
  )
}
test("suggestions retain scope, selected values and winning override in E/G/C order", () => {
  expect(httpVariableSuggestions(context())).toEqual([
    { name: "shared", value: "winner", scope: "environment" },
    { name: "env_env", value: "environment value", scope: "environment" },
    { name: "env_2", value: "second", scope: "environment" },
    { name: "golbal", value: "254157", scope: "global" },
    { name: "lps_name", value: "collection value", scope: "collection" },
  ])
  const names = Array.from({ length: 12 }, (_, i) => `env_${i}`)
  expect(urlVariableCompletion("{{env_", 6, names)?.suggestions).toEqual(names)
})
test("all request template fields accept completion, documentation/scripts/search do not", () => {
  for (const id of [
    "http-url-input",
    "http-key-value-name-query",
    "http-key-value-value-header",
    "http-auth-token-id",
    "http-auth-password-id",
    "http-auth-key-name-id",
    "http-body-editor-id",
    "http-request-proxy-id",
  ])
    expect(httpVariableInput(id)).toBe(true)
  for (const id of [
    "http-script-editor-preRequest-id",
    "http-docs-editor-id",
    "http-request-name-id",
    "http-collection-search",
    "http-response-search-id",
  ])
    expect(httpVariableInput(id)).toBe(false)
})
test("names and values resolve consistently for query, headers, auth and body forms", () => {
  const request = createScratchRequest("fixture", "https://example.invalid/:id")
  const entry = (name: string, value: string) => ({
    id: name,
    name,
    value,
    enabled: true,
    sensitivity: "normal" as const,
  })
  const variables = createHttpVariableContext([
    {
      origin: "public",
      values: {
        param: "query",
        header: "X-Example",
        value: "payload",
        auth: "X-Key",
        field: "form",
        path: "id",
      },
    },
  ])
  request.method = "POST"
  request.query = [entry("{{param}}", "{{value}}")]
  request.path = [entry("{{path}}", "{{value}}")]
  request.headers = [entry("{{header}}", "{{value}}")]
  request.auth = { kind: "api-key", placement: "header", name: "{{auth}}", value: "{{value}}" }
  request.body = { kind: "form", text: "", form: [entry("{{field}}", "{{value}}")] }
  const prepared = prepareHttpRequest(request, "run", 0, variables)
  expect(prepared.url).toBe("https://example.invalid/payload?query=payload")
  expect(prepared.headers).toContainEqual(["X-Example", "payload"])
  expect(prepared.headers).toContainEqual(["X-Key", "payload"])
  expect(String(prepared.body)).toBe("form=payload")
  expect(httpSensitiveHeaderNames(request, prepared.headers, variables)).toContain("x-key")
  request.body = {
    kind: "multipart",
    text: "",
    form: [],
    multipart: [{ ...entry("{{field}}", "{{value}}"), kind: "text" }],
  }
  expect((prepareHttpRequest(request, "run", 0, variables).body as FormData).get("form")).toBe(
    "payload",
  )
  const preview = createHttpPreparedRequestPreview({
    sourceRequest: request,
    effectiveRequest: request,
    revision: 0,
    variables,
  })
  expect(preview.ok && preview.headers.find((header) => header.name === "X-Key")).toMatchObject({
    origin: "auth",
    value: "<redacted>",
    masked: true,
  })
  variables.set("header", { value: "Authorization", origin: "public", secret: false })
  request.headers[0] = entry("{{header}}", "Bearer fixture-private")
  expect(httpRequestSecretValues(request, variables)).toContain("Bearer fixture-private")
  request.headers[0] = entry("{{header}}", "unsafe\r\nInjected: yes")
  expect(() => prepareHttpRequest(request, "run", 0, variables)).toThrow()
  variables.set("header", { value: "invalid header", origin: "public", secret: false })
  expect(() => prepareHttpRequest(request, "run", 0, variables)).toThrow("Nome de header inválido")
})
