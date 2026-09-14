import { describe, expect, test } from "bun:test"
import { httpParameterSectionForKey } from "../packages/feature-http/src/model/parameter-navigation"

describe("HTTP parameter subpanel navigation", () => {
  test("uses plain J/K and arrows without stealing modified shortcuts", () => {
    expect(httpParameterSectionForKey({ name: "j" })).toBe("path")
    expect(httpParameterSectionForKey({ name: "down" })).toBe("path")
    expect(httpParameterSectionForKey({ name: "k" })).toBe("query")
    expect(httpParameterSectionForKey({ name: "up" })).toBe("query")
    expect(httpParameterSectionForKey({ name: "j", ctrl: true })).toBeNull()
    expect(httpParameterSectionForKey({ name: "n" })).toBeNull()
  })
})
