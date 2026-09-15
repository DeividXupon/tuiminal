import { describe, expect, test } from "bun:test"
import {
  httpAuthForKind,
  nestedHttpViewCycleDirection,
  nextHttpAuthKind,
  nextHttpRequestMoreView,
  nextHttpResponseMoreView,
  nextHttpResponseView,
} from "../packages/feature-http/src/model/nested-view-navigation"

describe("HTTP horizontal navigation hierarchy", () => {
  test("cycles nested strips with Z/V", () => {
    expect(nestedHttpViewCycleDirection({ name: "z" })).toBe(-1)
    expect(nestedHttpViewCycleDirection({ name: "v" })).toBe(1)
    expect(nestedHttpViewCycleDirection({ name: "v", shift: true })).toBeNull()
    expect(nextHttpAuthKind("none", -1)).toBe("api-key")
    expect(nextHttpRequestMoreView("preview", 1)).toBe("options")
    expect(nextHttpResponseMoreView("summary", -1)).toBe("console")
  })

  test("cycles response primary views separately and creates safe empty auth values", () => {
    expect(nextHttpResponseView("more", 1)).toBe("pretty")
    expect(httpAuthForKind("basic")).toEqual({ kind: "basic", username: "", password: "" })
  })
})
