import { describe, expect, test } from "bun:test"
import type { HttpKeyValue, HttpVariableContext } from "../packages/feature-http/src/model/types"
import { createHttpVariableContext } from "../packages/feature-http/src/model/variables"
import { createScratchRequest } from "../packages/feature-http/src/model/workspace"
import { prepareHttpRequest } from "../packages/feature-http/src/services/request-builder"

function parameter(name: string, value: string, enabled = true): HttpKeyValue {
  return { id: `${name}-${value}`, name, value, enabled, sensitivity: "normal" }
}

function preparedUrl(url: string, path: HttpKeyValue[], variables?: HttpVariableContext) {
  const request = createScratchRequest("path-parameters", url)
  request.path = path
  return prepareHttpRequest(request, "path-parameters", 0, variables).url
}

describe("HTTP path parameters", () => {
  test.each([
    "//{host}.example.test/:id",
    "https:///{host}.example.test/:id",
    "https://\n/{host}.example.test/:id",
  ])("preserves authority in URLs normalized from %s", (url) => {
    const expected = new URL(url.startsWith("//") ? `http://${url}` : url)
    expected.pathname = "/42"
    expect(preparedUrl(url, [parameter("host", "changed"), parameter("id", "42")])).toBe(
      expected.href,
    )
  })

  test("normalizes path separators without rewriting query or fragment backslashes", () => {
    expect(
      preparedUrl("https://example.test\\:id?next=\\:id#\\{id}", [parameter("id", "42")]),
    ).toBe("https://example.test/42?next=\\:id#\\{id}")
  })

  test.each(["https://example.test\\users\\:id", "example.test\\users\\:id"])(
    "resolves tokens after HTTP path separators are normalized in %s",
    (url) => {
      const expected = url.startsWith("https:")
        ? "https://example.test/users/42"
        : "http://example.test/users/42"
      expect(preparedUrl(url, [parameter("id", "42")])).toBe(expected)
    },
  )

  test.each([false, true])(
    "matches overlapping names independently of row order (%s)",
    (reverse) => {
      const path = [parameter("id", "one"), parameter("id2", "two")]
      if (reverse) path.reverse()
      expect(preparedUrl("https://example.test/users/:id2/items/:id/{id2}/{id}", path)).toBe(
        "https://example.test/users/two/items/one/two/one",
      )
    },
  )

  test("matches complete colon segments and explicit embedded brace tokens", () => {
    expect(
      preparedUrl("https://example.test/:identifier/:id.json/urn:id/prefix:id/{id}.json/:id", [
        parameter("id", "42"),
      ]),
    ).toBe("https://example.test/:identifier/:id.json/urn:id/prefix:id/42.json/42")
  })

  test.each([
    "https://user:password@example.test:8080/:id?next=:id#fragment-{id}",
    "http://[::1]:8080/:id?next={id}#fragment-:id",
    "localhost:8080/:id?next=:id#fragment-{id}",
  ])("does not substitute authority, query, or fragment in %s", (url) => {
    const expected = new URL(url.startsWith("localhost") ? `http://${url}` : url)
    expected.pathname = "/42"
    expect(
      preparedUrl(url, [
        parameter("id", "42"),
        parameter("password", "changed"),
        parameter("8080", "9999"),
        parameter(":1", "broken"),
      ]),
    ).toBe(expected.href)
  })

  test("uses the first enabled duplicate, supports empty values, and ignores unused rows", () => {
    const variables = createHttpVariableContext([])
    expect(
      preparedUrl(
        "https://example.test/:id/{id}/:empty/{empty}/:disabled/:unknown",
        [
          parameter("id", "{{missing}}", false),
          parameter("id", "first"),
          parameter("id", "{{missing}}"),
          parameter("empty", ""),
          parameter("disabled", "{{missing}}", false),
          parameter("unused", "{{missing}}"),
          parameter("", "{{missing}}"),
        ],
        variables,
      ),
    ).toBe("https://example.test/first/first///:disabled/:unknown")
  })

  test("encodes values once as data without treating inserted text as another placeholder", () => {
    const value = "a/b ?#%+{next}:id 東京"
    expect(
      preparedUrl("https://example.test/:id/{next}", [
        parameter("id", value),
        parameter("next", "final"),
      ]),
    ).toBe(`https://example.test/${encodeURIComponent(value)}/final`)
  })

  test("resolves URL and path value variables before encoding the selected value", () => {
    const variables = createHttpVariableContext([
      { origin: "public", values: { baseUrl: "https://example.test:8443/api" } },
      { origin: "private", secret: true, values: { identifier: "a/b#c" } },
    ])
    expect(
      preparedUrl(
        "{{baseUrl}}/:id/{file.name}",
        [parameter("id", "{{identifier}}"), parameter("file.name", "report.json")],
        variables,
      ),
    ).toBe("https://example.test:8443/api/a%2Fb%23c/report.json")
  })

  test("preserves encoded literals and keeps environment syntax separate from path tokens", () => {
    expect(
      preparedUrl("https://example.test/%7Bid%7D/%3Aid/{{id}}/{id}/:id", [parameter("id", "42")]),
    ).toBe("https://example.test/%7Bid%7D/%3Aid/%7B%7Bid%7D%7D/42/42")
  })
})
