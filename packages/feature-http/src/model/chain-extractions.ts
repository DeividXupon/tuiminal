import {
  evaluateHttpJsonPath,
  isValidHttpJsonPathExpression,
  responseBodyText,
  sanitizeTerminalText,
} from "./response"
import { httpHeaderSensitivity } from "./key-value"
import { createHttpPrivacyContext } from "./secrets"
import type { HttpChainExtraction, HttpResponseSnapshot } from "./types"

export function validateHttpExtraction(
  extraction: HttpChainExtraction,
  extractions: HttpChainExtraction[],
) {
  if (extraction.enabled === false) return null
  if (!/^[A-Za-z_$][\w$.-]*$/.test(extraction.name))
    return `Nome de variável extraída inválido: ${extraction.name || "(vazio)"}.`
  if (
    extractions.filter((item) => item.enabled !== false && item.name === extraction.name).length > 1
  )
    return `A variável extraída ${extraction.name} está duplicada.`
  if (extraction.source === "header")
    return /^[!#$%&'*+.^_`|~\dA-Z-]+$/i.test(extraction.jsonPath)
      ? null
      : "Informe um nome de header válido."
  if (extraction.source === "status") return null
  return isValidHttpJsonPathExpression(extraction.jsonPath)
    ? null
    : `JSONPath inválido na extração ${extraction.name}.`
}

export function evaluateHttpExtraction(
  extraction: HttpChainExtraction,
  response: HttpResponseSnapshot,
): string {
  let value: unknown
  if (extraction.source === "status") value = response.status
  else if (extraction.source === "header")
    value = response.headers.find(
      ([name]) => name.toLowerCase() === extraction.jsonPath.toLowerCase(),
    )?.[1]
  else value = evaluateHttpJsonPath(responseBodyText(response, false), extraction.jsonPath)
  if (value === undefined || (value !== null && typeof value === "object"))
    throw new Error(`Extração ${extraction.name} não produziu um valor escalar.`)
  return value === null ? "null" : String(value)
}

export function httpExtractionIsSecret(extraction: HttpChainExtraction) {
  return (
    extraction.secret ||
    (extraction.source === "header" && httpHeaderSensitivity(extraction.jsonPath) !== "normal")
  )
}

export function previewHttpExtractions(
  extractions: HttpChainExtraction[],
  response?: HttpResponseSnapshot,
) {
  // Learn all marked secrets before showing any preview, including a public alias of one.
  const values = extractions.map((item) => {
    if (!response || item.enabled === false) return undefined
    try {
      return evaluateHttpExtraction(item, response)
    } catch {
      return undefined
    }
  })
  const privacy = createHttpPrivacyContext(
    values.filter(
      (value, index): value is string =>
        value !== undefined &&
        Boolean(extractions[index] && httpExtractionIsSecret(extractions[index])),
    ),
  )
  return extractions.map((item, index) => {
    const error = validateHttpExtraction(item, extractions)
    if (error) return { error, value: "" }
    if (item.enabled === false) return { error: null, value: "", message: "Extração desativada" }
    if (!response)
      return { error: null, value: "", message: "Envie o request para visualizar a extração." }
    const value = values[index]
    if (value === undefined)
      return { error: "Valor não encontrado ou não escalar na última resposta.", value: "" }
    const redacted = privacy.redactText(response.privacy?.redactText(value) ?? value)
    return {
      error: null,
      value: httpExtractionIsSecret(item) ? "••••••" : sanitizeTerminalText(redacted),
    }
  })
}

export function parseHttpExtractionValue(source: string): HttpChainExtraction | null {
  try {
    const value = JSON.parse(source)
    if (
      !value ||
      typeof value.name !== "string" ||
      typeof value.jsonPath !== "string" ||
      typeof value.secret !== "boolean"
    )
      return null
    if (
      Object.keys(value).some(
        (key) => !["name", "jsonPath", "secret", "source", "enabled"].includes(key),
      )
    )
      return null
    if (![undefined, "jsonpath", "header", "status"].includes(value.source)) return null
    if (value.enabled !== undefined && typeof value.enabled !== "boolean") return null
    return {
      name: value.name,
      jsonPath: value.jsonPath,
      secret: value.secret,
      ...(value.source ? { source: value.source } : {}),
      ...(value.enabled !== undefined ? { enabled: value.enabled } : {}),
    }
  } catch {
    return null
  }
}
