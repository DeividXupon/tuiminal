import { describe, expect, test } from "bun:test"
import { createScratchRequest } from "../packages/feature-http/src/model/workspace"
import {
  applyHttpUrlQueryEdit,
  applyUrlVariableCompletion,
  syncHttpUrlQuery,
  urlVariableCompletion,
} from "../packages/feature-http/src/model/url-query"
import { prepareHttpRequest } from "../packages/feature-http/src/services/request-builder"
import {
  parseHttpFile,
  requestFromHttpFile,
  serializeHttpRequestBlock,
} from "../packages/feature-http/src/model/http-file"

describe("HTTP URL variables and query parameters", () => {
  test("suggests available names after one or two braces and completes at the cursor", () => {
    const names = ["manga", "mangaka", "token"]
    expect(urlVariableCompletion("https://example.test/{", 22, names)?.suggestions).toEqual([
      "manga",
      "mangaka",
      "token",
    ])
    const source = "https://example.test/{{man}/chapters"
    const completion = urlVariableCompletion(source, source.indexOf("}/chapters"), names)
    expect(completion?.suggestions).toEqual(["manga", "mangaka"])
    if (!completion) throw new Error("Expected variable completion")
    expect(applyUrlVariableCompletion(source, completion.start, completion.end, "manga")).toBe(
      "https://example.test/{{manga}}/chapters",
    )
    expect(urlVariableCompletion("https://example.test/{{manga}}", 30, names)).toBeNull()
  })

  test("mirrors URL query rows, edits them back into the URL, and sends each value once", () => {
    const request = createScratchRequest("scratch", "https://example.test/search?manga=2&manga=3")
    request.query = syncHttpUrlQuery(request.url, request.query, request.id)
    expect(request.query.map(({ name, value }) => [name, value])).toEqual([
      ["manga", "2"],
      ["manga", "3"],
    ])
    expect(new URL(prepareHttpRequest(request, "run", 0).url).searchParams.getAll("manga")).toEqual(
      ["2", "3"],
    )
    const edited = applyHttpUrlQueryEdit(
      request.url,
      request.query.map((entry, index) => (index === 0 ? { ...entry, value: "4" } : entry)),
      request.id,
    )
    expect(edited.url).toBe("https://example.test/search?manga=4&manga=3")
    expect(edited.query.map((entry) => entry.value)).toEqual(["4", "3"])
    const serialized = serializeHttpRequestBlock({ ...request, ...edited })
    expect(serialized).toContain("GET https://example.test/search?manga=4&manga=3")
    const file = parseHttpFile(serialized, "query.http")
    const block = file.requests[0]
    if (!block) throw new Error("Expected saved request")
    const reopened = requestFromHttpFile(file, block)
    expect(
      new URL(prepareHttpRequest(reopened, "reopened", 0).url).searchParams.getAll("manga"),
    ).toEqual(["4", "3"])
  })
})
