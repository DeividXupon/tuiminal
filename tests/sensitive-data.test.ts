import { afterEach, describe, expect, test } from "bun:test"
import {
  DEFAULT_SENSITIVE_VISIBILITY,
  DEFAULT_SENSITIVE_TERMS,
  getActiveSensitiveTerms,
  isSensitiveColumnName,
  nextSensitiveVisibility,
  parseSensitiveTerms,
  sensitiveDataIsMasked,
  setActiveSensitiveTerms,
} from "../packages/core/src/security/sensitive-data"

afterEach(() => setActiveSensitiveTerms([...DEFAULT_SENSITIVE_TERMS]))

describe("sensitive database terms", () => {
  test("starts visible and marks the activation state only while data is masked", () => {
    expect(DEFAULT_SENSITIVE_VISIBILITY).toBe("visible")
    expect(sensitiveDataIsMasked("visible")).toBe(false)
    expect(sensitiveDataIsMasked("hidden")).toBe(true)
    expect(sensitiveDataIsMasked("confirm")).toBe(true)
    expect(nextSensitiveVisibility("visible")).toBe("hidden")
    expect(nextSensitiveVisibility("hidden")).toBe("confirm")
    expect(nextSensitiveVisibility("confirm")).toBe("visible")
  })

  test("matches default fragments without case or separator differences", () => {
    expect(isSensitiveColumnName("PASSWORD_HASH")).toBe(true)
    expect(isSensitiveColumnName("customer.email")).toBe(true)
    expect(isSensitiveColumnName("private-key-value")).toBe(true)
    expect(isSensitiveColumnName("display_name")).toBe(false)
  })

  test("uses only the configured terms at runtime", () => {
    setActiveSensitiveTerms(["internal code"])

    expect(isSensitiveColumnName("internal_code_value")).toBe(true)
    expect(isSensitiveColumnName("email")).toBe(false)
    expect(getActiveSensitiveTerms()).toEqual(["internal code"])
  })

  test("parses comma, semicolon, and line separated terms without duplicates", () => {
    expect(parseSensitiveTerms(" Token, api_key; TOKEN\ncpf ")).toEqual(["Token", "api_key", "cpf"])
    expect(parseSensitiveTerms("  ")).toEqual([])
  })

  test("rejects an excessive number or length of terms", () => {
    expect(() =>
      parseSensitiveTerms(Array.from({ length: 65 }, (_, index) => `x${index}`).join(",")),
    ).toThrow("no máximo 64 termos")
    expect(() => parseSensitiveTerms("x".repeat(65))).toThrow("no máximo 64 caracteres")
  })
})
