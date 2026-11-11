import {
  createHttpWorkspaceState,
  createScratchRequest,
} from "../../packages/feature-http/src/model/workspace"
import type { HttpDocumentState } from "../../packages/feature-http/src/model/types"
import type { HttpCookie } from "../../packages/feature-http/src/services/cookies"

export const responseTableCookies: HttpCookie[] = [
  {
    name: "session",
    value: "PRIVATE_COOKIE_FIXTURE",
    domain: "api.test",
    path: "/v1",
    secure: true,
    httpOnly: true,
    hostOnly: true,
    sameSite: "strict",
  },
]
export function responseTableFixture(): HttpDocumentState {
  const document = createHttpWorkspaceState(createScratchRequest("table", "https://api.test/users"))
    .documents[0]
  if (!document) throw new Error("Missing fixture")
  const body = new TextEncoder().encode('{"hello":"ação 中文 👩‍💻","number":42}\n')
  return {
    ...document,
    execution: {
      status: "success",
      response: {
        executionId: "fixture",
        requestId: "table",
        requestRevision: 0,
        url: "https://api.test/users",
        status: 201,
        statusText: "Created",
        body,
        bodyKind: "json",
        contentType: "application/json",
        capturedBytes: body.length,
        declaredBytes: body.length,
        encoding: "utf-8",
        truncated: false,
        headers: [
          ["content-type", "application/json"],
          ["x-trace", "long-continuous-searchable-identifier-中文-👩‍💻-ending"],
          ["set-cookie", "one=fixture"],
          ["set-cookie", "two=fixture"],
        ],
        timings: { headersMs: 100, downloadMs: 300, totalMs: 400 },
        redirects: [
          {
            status: 302,
            url: "https://old.test/users",
            location: "https://api.test/users",
            crossOrigin: true,
          },
        ],
        assertions: [
          { id: "one", expression: "status == 201", actual: "201", passed: true, message: "" },
          {
            id: "two",
            expression: "status == 200",
            actual: "201",
            passed: false,
            message: "Expected 200",
          },
        ],
      },
    },
  }
}
