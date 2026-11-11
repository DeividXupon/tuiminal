export type HttpEnvironmentVariable = {
  id: string
  name: string
  value: string
  metadata?: Record<string, unknown>
}
export type HttpEnvironmentDocument = {
  id: string
  scope: string
  key: string
  name: string
  rows: HttpEnvironmentVariable[]
  baseline: string
  revision: number
  savedRevision: number
  fresh?: boolean
  loading?: boolean
  busy?: boolean
  error?: string
}
export type HttpEnvironmentDocumentAction =
  | { type: "open-environment-document"; document: HttpEnvironmentDocument }
  | { type: "update-environment-document"; id: string; patch: Partial<HttpEnvironmentDocument> }
  | { type: "close-environment-document"; id: string }
  | { type: "clear-environment-documents" }
