import { afterEach, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { defaultHttpOAuth2, oauthPreviewAuth } from "../packages/feature-http/src/model/oauth2"
import { createScratchRequest } from "../packages/feature-http/src/model/workspace"
import { createHttpVariableContext } from "../packages/feature-http/src/model/variables"
import {
  parseHttpFile,
  requestFromHttpFile,
  serializeHttpRequestBlock,
} from "../packages/feature-http/src/model/http-file"
import { runHttpCollectionCase } from "../packages/feature-http/src/services/collection-runner"
import { formatHttpRunReport } from "../packages/feature-http/src/cli/report"
import { clearHttpOAuthSessions } from "../packages/feature-http/src/services/oauth2-session"
import { createHttpPreparedRequestPreview } from "../packages/feature-http/src/services/request-preview"
import { prepareHttpRequest } from "../packages/feature-http/src/services/request-builder"
import { saveHttpRequest } from "../packages/feature-http/src/storage/collections"
import { importPostmanCollection } from "../packages/feature-http/src/importing/postman"
import { remoteOAuth2 } from "../packages/feature-http/src/model/oauth2-postman"

const roots: string[] = []
const servers: ReturnType<typeof Bun.serve>[] = []
afterEach(async () => {
  clearHttpOAuthSessions()
  for (const server of servers.splice(0)) await server.stop(true)
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})
async function root() {
  const path = await mkdtemp(join(tmpdir(), "tuiminal-oauth2-test-"))
  roots.push(path)
  return path
}

test("individual and collection execution use OAuth without persisting tokens or exposing secrets in reports", async () => {
  const directory = await root()
  let acquisitions = 0
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      if (new URL(request.url).pathname === "/token") {
        acquisitions++
        expect(await request.text()).toContain("grant_type=client_credentials")
        return Response.json({
          access_token: "issued-private-token",
          token_type: "Bearer",
          expires_in: 3600,
        })
      }
      expect(request.headers.get("authorization")).toBe("Bearer issued-private-token")
      return Response.json({ token: "issued-private-token", secret: "literal-client-secret" })
    },
  })
  servers.push(server)
  const request = createScratchRequest("oauth-fixture", `${server.url}resource`)
  request.auth = {
    ...defaultHttpOAuth2(),
    tokenUrl: `${server.url}token`,
    clientId: "client",
    clientSecret: "{{clientSecret}}",
  }
  const variables = createHttpVariableContext([
    { origin: "private", values: { clientSecret: "literal-client-secret" }, secret: true },
  ])
  for (let iteration = 0; iteration < 2; iteration++) {
    const result = await runHttpCollectionCase({
      name: "oauth",
      items: [{ filePath: "oauth.http", request }],
      root: directory,
      variables,
    })
    expect(result.items[0]?.response?.status).toBe(200)
    const report = formatHttpRunReport([result], "json")
    expect(report).not.toContain("issued-private-token")
    expect(report).not.toContain("literal-client-secret")
  }
  expect(acquisitions).toBe(1)
  expect(request.auth.kind).toBe("oauth2")
  const preview = createHttpPreparedRequestPreview({
    sourceRequest: request,
    effectiveRequest: request,
    revision: 0,
    variables,
    projectRoot: directory,
  })
  expect(preview.ok).toBe(true)
  expect(JSON.stringify(preview)).not.toContain("literal-client-secret")
  expect(JSON.stringify(preview)).not.toContain("issued-private-token")
  const exported = prepareHttpRequest(
    { ...request, auth: oauthPreviewAuth(request.auth) },
    "curl",
    0,
    variables,
    directory,
  )
  expect(new Headers(exported.headers).get("authorization")).toBe("Bearer <OAuth2>")
  expect(acquisitions).toBe(1)
  const serialized = serializeHttpRequestBlock(request)
  const parsed = parseHttpFile(serialized, "oauth.http")
  const block = parsed.requests[0]
  if (!block) throw new Error("Missing OAuth fixture")
  expect(requestFromHttpFile(parsed, block).auth).toEqual(request.auth)
  expect(serialized).not.toContain("issued-private-token")
  expect(serialized).not.toContain("literal-client-secret")
  request.auth.clientSecret = "literal-client-secret"
  await expect(saveHttpRequest(directory, request)).rejects.toThrow("variável do ambiente privado")
})

test("Postman import preserves supported OAuth configuration and privatizes client secret", () => {
  const config = {
    ...defaultHttpOAuth2(),
    tokenUrl: "https://provider.test/token",
    clientId: "client",
    clientSecret: "import-secret",
  }
  const report = importPostmanCollection({
    info: {
      name: "OAuth collection",
      schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    },
    item: [
      {
        name: "OAuth",
        request: {
          method: "GET",
          url: "https://api.test",
          auth: {
            ...remoteOAuth2(config),
            oauth2: [...remoteOAuth2(config).oauth2, { key: "accessToken", value: "import-token" }],
          },
        },
      },
    ],
  })
  expect(report.warnings).toEqual([])
  expect(report.requests[0]?.auth).toMatchObject({
    kind: "oauth2",
    tokenUrl: config.tokenUrl,
    clientSecret: expect.stringContaining("{{"),
  })
  expect(JSON.stringify(report.requests)).not.toContain("import-secret")
  expect(JSON.stringify(report.requests)).not.toContain("import-token")
})
