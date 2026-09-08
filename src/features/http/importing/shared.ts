import type { HttpRequestDefinition } from "../model/types"

export type HttpImportReport = {
  format: "postman" | "openapi"
  requests: HttpRequestDefinition[]
  ignored: string[]
  warnings: string[]
}

export function importedHttpRequest(
  id: string,
  name: string,
  method: string,
  url: string,
): HttpRequestDefinition {
  return {
    id,
    source: { kind: "scratch" },
    name: name.trim() || `${method} ${url}`,
    method: method.toUpperCase(),
    url,
    query: [],
    path: [],
    headers: [],
    auth: { kind: "none" },
    body: { kind: "none", text: "", form: [] },
    options: {
      timeoutMs: 30_000,
      followRedirects: true,
      cookieJar: true,
      tlsVerification: "strict",
    },
  }
}

export function importId(format: string, index: number, name: string) {
  const stem = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return `http-import-${format}-${index + 1}-${stem || "request"}`
}

export function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

export function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback
}
