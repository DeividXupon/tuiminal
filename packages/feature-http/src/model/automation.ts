import { isHttpAssertionExpressionSupported } from "./assertions"
import { validateHttpExtraction } from "./chain-extractions"
import type { HttpAssertionDefinition, HttpChainExtraction, HttpRequestDefinition } from "./types"

function uniqueId(requestId: string, kind: "assertion" | "extraction") {
  return `${requestId}-${kind}-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function createHttpAssertionDraft(requestId: string): HttpAssertionDefinition {
  return { id: uniqueId(requestId, "assertion"), expression: "status == 200" }
}

export function createHttpExtractionDraft(
  requestId: string,
  names: readonly string[] = [],
): HttpChainExtraction {
  let number = 1
  while (names.includes(`value_${number}`)) number += 1
  return {
    id: uniqueId(requestId, "extraction"),
    name: `value_${number}`,
    jsonPath: "$.value",
    secret: false,
  }
}

export function validateHttpRequestAutomation(request: HttpRequestDefinition) {
  const invalidAssertion = request.assertions?.find(
    (assertion) => !isHttpAssertionExpressionSupported(assertion.expression),
  )
  if (invalidAssertion) {
    return `Assertion inválida: ${invalidAssertion.expression || "(vazia)"}.`
  }

  for (const extraction of request.chain?.extract ?? []) {
    const error = validateHttpExtraction(extraction, request.chain?.extract ?? [])
    if (error) return error
  }
  return null
}
