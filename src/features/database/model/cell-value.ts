import type { DatabaseColumn } from "./types"

// Covers native NUMERIC ranges while preventing huge exponent-driven allocations.
const MAX_EXPANDED_DECIMAL_LENGTH = 150_000

function exactDecimalValue(text: string) {
  const normalized = text.trim()
  const match = normalized.match(/^([+-]?)(\d+(?:\.\d*)?|\.\d+)(?:[eE]([+-]?\d+))?$/)
  if (!match) throw new Error("Digite um número válido.")
  if (match[3] === undefined) return normalized

  const sign = match[1] ?? ""
  const [integer = "", fraction = ""] = (match[2] ?? "").split(".")
  const digits = integer + fraction
  const exponent = Number(match[3])
  if (!Number.isSafeInteger(exponent)) throw new Error("Digite um número válido.")
  if (/^0+$/.test(digits)) return `${sign}0`

  const point = integer.length + exponent
  const expandedLength = Math.max(point, digits.length) + Math.max(0, -point)
  if (expandedLength > MAX_EXPANDED_DECIMAL_LENGTH) throw new Error("Digite um número válido.")
  if (point <= 0) return `${sign}0.${"0".repeat(-point)}${digits}`
  if (point >= digits.length) return `${sign}${digits}${"0".repeat(point - digits.length)}`
  return `${sign}${digits.slice(0, point)}.${digits.slice(point)}`
}

export function coerceDatabaseCellValue(column: DatabaseColumn, text: string): unknown {
  const type = column.type.trim().toLocaleLowerCase()
  if (/\b(bool|boolean)\b/.test(type)) {
    const normalized = text.trim().toLocaleLowerCase()
    if (["true", "1", "sim", "yes"].includes(normalized)) return true
    if (["false", "0", "não", "nao", "no"].includes(normalized)) return false
    throw new Error("Use true/false ou 1/0 para um valor booleano.")
  }
  if (/\b(json|jsonb)\b/.test(type)) {
    try {
      return JSON.parse(text)
    } catch {
      throw new Error("Digite um JSON válido.")
    }
  }
  if (/\b(tinyint|smallint|mediumint|int|integer|bigint|serial|bigserial)\b/.test(type)) {
    const normalized = text.trim()
    if (!/^[+-]?\d+$/.test(normalized)) throw new Error("Digite um número inteiro válido.")
    const integer = BigInt(normalized)
    return integer >= BigInt(Number.MIN_SAFE_INTEGER) && integer <= BigInt(Number.MAX_SAFE_INTEGER)
      ? Number(integer)
      : integer
  }
  if (/\b(decimal|numeric|dec|fixed|money)\b/.test(type)) return exactDecimalValue(text)
  if (/\b(real|float|double)\b/.test(type)) {
    const number = Number(text.trim())
    if (!text.trim() || !Number.isFinite(number)) throw new Error("Digite um número válido.")
    return number
  }
  return text
}
