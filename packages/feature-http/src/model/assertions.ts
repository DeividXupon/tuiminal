import { evaluateHttpJsonPath, responseBodyText } from "./response"
import type { HttpAssertionDefinition, HttpAssertionResult, HttpResponseSnapshot } from "./types"

const STATUS_ASSERTION = /^status\s*(?:==|=)?\s*(\d{3})$/i
const HEADER_ASSERTION = /^header\s+(.+?)\s+(==|=|contains|matches|exists)(?:\s+([\s\S]*))?$/i
const BODY_ASSERTION = /^body\s+(==|=|contains|matches)(?:\s+([\s\S]*))?$/i
const JSON_PATH_ASSERTION = /^jsonpath\s+(\S+)\s+(==|=|contains|matches|exists)(?:\s+([\s\S]*))?$/i

export function isHttpAssertionExpressionSupported(expression: string) {
  const value = expression.trim()
  return (
    STATUS_ASSERTION.test(value) ||
    HEADER_ASSERTION.test(value) ||
    BODY_ASSERTION.test(value) ||
    JSON_PATH_ASSERTION.test(value)
  )
}

function scalar(value: unknown) {
  if (typeof value === "string") return value
  if (value === undefined) return "<ausente>"
  return JSON.stringify(value)
}

function compare(
  assertion: HttpAssertionDefinition,
  actual: unknown,
  operator: string,
  expected = "",
): HttpAssertionResult {
  const actualText = scalar(actual)
  const normalizedOperator = operator === "=" ? "==" : operator
  const passed =
    normalizedOperator === "exists"
      ? actual !== undefined
      : normalizedOperator === "contains"
        ? actualText.includes(expected)
        : normalizedOperator === "matches"
          ? (() => {
              try {
                return new RegExp(expected).test(actualText)
              } catch {
                return false
              }
            })()
          : actualText === expected
  return {
    id: assertion.id,
    expression: assertion.expression,
    passed,
    actual: actualText,
    message: passed ? "OK" : `Esperado ${normalizedOperator} ${expected || "um valor"}.`,
  }
}

export function evaluateHttpAssertion(
  assertion: HttpAssertionDefinition,
  response: HttpResponseSnapshot,
): HttpAssertionResult {
  const expression = assertion.expression.trim()
  const status = expression.match(STATUS_ASSERTION)
  if (status?.[1]) return compare(assertion, response.status, "==", status[1])

  const header = expression.match(HEADER_ASSERTION)
  if (header?.[1] && header[2]) {
    const values = response.headers
      .filter(([name]) => name.toLowerCase() === header[1]!.toLowerCase())
      .map(([, value]) => value)
    return compare(assertion, values.length ? values.join(", ") : undefined, header[2], header[3])
  }

  const body = expression.match(BODY_ASSERTION)
  if (body?.[1]) {
    return compare(assertion, responseBodyText(response, false), body[1], body[2])
  }

  const jsonPath = expression.match(JSON_PATH_ASSERTION)
  if (jsonPath?.[1] && jsonPath[2]) {
    try {
      const value = evaluateHttpJsonPath(responseBodyText(response, false), jsonPath[1])
      return compare(assertion, value, jsonPath[2], jsonPath[3])
    } catch (error) {
      return {
        id: assertion.id,
        expression,
        passed: false,
        actual: "<erro>",
        message: error instanceof Error ? error.message : String(error),
      }
    }
  }

  return {
    id: assertion.id,
    expression,
    passed: false,
    actual: "<inválida>",
    message: "Assertion não reconhecida.",
  }
}

export function evaluateHttpAssertions(
  assertions: HttpAssertionDefinition[] | undefined,
  response: HttpResponseSnapshot,
) {
  return (assertions ?? []).map((assertion) => evaluateHttpAssertion(assertion, response))
}
