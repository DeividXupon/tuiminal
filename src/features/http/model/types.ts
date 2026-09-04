export const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const

export type HttpMethod = (typeof HTTP_METHODS)[number] | (string & {})
export type HttpLayoutMode = "panorama" | "workbench" | "focus" | "minimum"
export type HttpClientUrlRequest = { id: number; url: string }
export type HttpPane = "navigation" | "request" | "response"
export type HttpNavigationView = "collection" | "history"
export type HttpRequestView = "params" | "headers" | "body" | "auth" | "more"
export type HttpResponseView = "pretty" | "raw" | "headers" | "timing" | "more"
export type HttpWorkspaceOverlay = "jump" | "help" | null
export type HttpJumpTarget =
  | "url"
  | "params"
  | "headers"
  | "body"
  | "auth"
  | "response"
  | "collection"
  | "history"
export type HttpBodyKind = "none" | "json" | "text" | "form"
export type HttpResponseBodyKind = "text" | "json" | "xml" | "html" | "binary"

export type HttpKeyValue = {
  id: string
  enabled: boolean
  name: string
  value: string
  sensitivity: "normal" | "secret-ref" | "literal-secret"
}

export type HttpAuth =
  | { kind: "none" }
  | { kind: "bearer"; token: string }
  | { kind: "basic"; username: string; password: string }
  | { kind: "api-key"; placement: "header" | "query"; name: string; value: string }

export type HttpRequestDefinition = {
  id: string
  source: { kind: "scratch" } | { kind: "file"; path: string; blockId: string; sourceHash: string }
  name: string
  method: HttpMethod
  url: string
  query: HttpKeyValue[]
  path: HttpKeyValue[]
  headers: HttpKeyValue[]
  auth: HttpAuth
  body: { kind: HttpBodyKind; text: string; form: HttpKeyValue[] }
  options: { timeoutMs: number; followRedirects: boolean }
}

export type HttpVariableOrigin = "request" | "file" | "private" | "public" | "built-in"

export type HttpVariableValue = {
  value: string
  origin: HttpVariableOrigin
  secret: boolean
}

export type HttpVariableContext = ReadonlyMap<string, HttpVariableValue>

export type HttpProjectRequestItem = {
  filePath: string
  request: HttpRequestDefinition
}

export type HttpPreparedRequest = {
  executionId: string
  requestId: string
  requestRevision: number
  method: string
  url: string
  headers: Array<[string, string]>
  body?: string
  timeoutMs: number
  followRedirects: boolean
}

export type HttpResponseSnapshot = {
  executionId: string
  requestId: string
  requestRevision: number
  url: string
  status: number
  statusText: string
  headers: Array<[string, string]>
  body: Uint8Array
  bodyKind: HttpResponseBodyKind
  contentType: string
  declaredBytes?: number
  capturedBytes: number
  truncated: boolean
  timings: { headersMs: number; downloadMs: number; totalMs: number }
}

export type HttpExecutionState =
  | { status: "idle" }
  | { status: "running"; executionId: string; requestId: string; requestRevision: number }
  | { status: "success"; response: HttpResponseSnapshot }
  | {
      status: "error"
      executionId: string
      requestId: string
      requestRevision: number
      message: string
    }
  | {
      status: "cancelled"
      executionId: string
      requestId: string
      requestRevision: number
    }

export type HttpDocumentState = {
  request: HttpRequestDefinition
  revision: number
  savedRevision: number
  requestView: HttpRequestView
  responseView: HttpResponseView
  splitRatio: number
  maximizedPane: "request" | "response" | null
  execution: HttpExecutionState
}

export type HttpHistoryEntry = {
  id: string
  createdAt: number
  requestId: string
  method: string
  url: string
  status: number | null
  durationMs: number | null
  error: string | null
}

export type HttpWorkspaceState = {
  documents: HttpDocumentState[]
  activeDocumentId: string
  activePane: HttpPane
  navigationView: HttpNavigationView
  navigationOpen: boolean
  overlay: HttpWorkspaceOverlay
  history: HttpHistoryEntry[]
}
