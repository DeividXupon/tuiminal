import { isHttpAssertionExpressionSupported } from "./assertions"
import { isValidHttpJsonPathExpression } from "./response"
import type { HttpAssertionDefinition, HttpChainExtraction, HttpRequestDefinition } from "./types"

function uniqueId(requestId: string, kind: "assertion" | "extraction") {
  return `${requestId}-${kind}-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function createHttpAssertionDraft(requestId: string): HttpAssertionDefinition {
  return { id: uniqueId(requestId, "assertion"), expression: "status == 200" }
}

export function createHttpExtractionDraft(requestId: string): HttpChainExtraction {
  return {
    id: uniqueId(requestId, "extraction"),
    name: `value_${Date.now().toString(36)}`,
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

  const names = new Set<string>()
  for (const extraction of request.chain?.extract ?? []) {
    if (!/^[A-Za-z_$][\w$.-]*$/.test(extraction.name)) {
      return `Nome de variável extraída inválido: ${extraction.name || "(vazio)"}.`
    }
    if (names.has(extraction.name)) {
      return `A variável extraída ${extraction.name} está duplicada.`
    }
    names.add(extraction.name)
    if (!isValidHttpJsonPathExpression(extraction.jsonPath)) {
      return `JSONPath inválido na extração ${extraction.name}.`
    }
  }
  return null
}
