import { describe, expect, test } from "bun:test"
import {
  httpBodyKindCycleDirection,
  nextHttpBodyKind,
} from "../packages/feature-http/src/model/body-kind-navigation"

describe("HTTP body kind navigation", () => {
  test("cycles all body kinds with the nested Z/V convention", () => {
    expect(nextHttpBodyKind("none", 1)).toBe("json")
    expect(nextHttpBodyKind("file", 1)).toBe("none")
    expect(nextHttpBodyKind("none", -1)).toBe("file")
    expect(httpBodyKindCycleDirection({ name: "z" })).toBe(-1)
    expect(httpBodyKindCycleDirection({ name: "v" })).toBe(1)
    expect(httpBodyKindCycleDirection({ name: "v", ctrl: true })).toBeNull()
  })
})
