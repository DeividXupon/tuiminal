export const DEFAULT_SENSITIVE_TERMS = [
  "password",
  "passwd",
  "secret",
  "token",
  "api key",
  "private key",
  "pin",
  "hash",
  "salt",
  "cpf",
  "cnpj",
  "document",
  "email",
  "phone",
  "telefone",
  "celular",
] as const

export const SENSITIVE_TERMS_LIMIT = 64
export const SENSITIVE_TERM_LENGTH_LIMIT = 64

export type SensitiveVisibility = "hidden" | "confirm" | "visible"

// Database values start visible. Masking is an explicit viewing preference,
// while revealing an already masked result still keeps its confirmation step.
export const DEFAULT_SENSITIVE_VISIBILITY: SensitiveVisibility = "visible"

export function sensitiveDataIsMasked(visibility: SensitiveVisibility) {
  return visibility !== "visible"
}

export function nextSensitiveVisibility(visibility: SensitiveVisibility): SensitiveVisibility {
  if (visibility === "visible") return "hidden"
  if (visibility === "hidden") return "confirm"
  return "visible"
}

function comparableTerm(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[\s._-]+/g, "")
}

function sanitizedTerms(values: string[]) {
  const unique = new Map<string, string>()
  for (const value of values) {
    const term = value.trim().replace(/\s+/g, " ")
    const comparable = comparableTerm(term)
    if (!term || !comparable || unique.has(comparable)) continue
    unique.set(comparable, term)
  }
  return [...unique.values()]
}

export function parseSensitiveTerms(text: string) {
  const candidates = text
    .split(/[,;\n]+/)
    .map((term) => term.trim())
    .filter(Boolean)
  if (candidates.length > SENSITIVE_TERMS_LIMIT) {
    throw new Error(`Use no máximo ${SENSITIVE_TERMS_LIMIT} termos.`)
  }
  if (candidates.some((term) => term.length > SENSITIVE_TERM_LENGTH_LIMIT)) {
    throw new Error(`Cada termo pode ter no máximo ${SENSITIVE_TERM_LENGTH_LIMIT} caracteres.`)
  }
  return sanitizedTerms(candidates)
}

export function normalizeSensitiveTerms(value: unknown): string[] {
  if (!Array.isArray(value)) return [...DEFAULT_SENSITIVE_TERMS]
  const values = value
    .filter((term): term is string => typeof term === "string")
    .map((term) => term.slice(0, SENSITIVE_TERM_LENGTH_LIMIT))
    .slice(0, SENSITIVE_TERMS_LIMIT)
  return sanitizedTerms(values)
}

let activeSensitiveTerms: string[] = [...DEFAULT_SENSITIVE_TERMS]
let comparableSensitiveTerms = activeSensitiveTerms.map(comparableTerm)

export function setActiveSensitiveTerms(terms: string[]) {
  activeSensitiveTerms = normalizeSensitiveTerms(terms)
  comparableSensitiveTerms = activeSensitiveTerms.map(comparableTerm)
}

export function getActiveSensitiveTerms() {
  return [...activeSensitiveTerms]
}

export function sensitiveTermsSignature() {
  return comparableSensitiveTerms.join("\u0000")
}

export function isSensitiveColumnName(column: string) {
  const comparableColumn = comparableTerm(column)
  return comparableSensitiveTerms.some((term) => comparableColumn.includes(term))
}
