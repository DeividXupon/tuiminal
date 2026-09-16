export const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const

export type HttpMethod = (typeof HTTP_METHODS)[number] | (string & {})
export type HttpLayoutMode = "panorama" | "workbench" | "focus" | "minimum"
export type HttpClientUrlRequest = { id: number; url: string }
export type HttpPane = "url" | "navigation" | "request" | "response"
export type HttpNavigationView = "collection" | "history"
export type HttpRequestView = "params" | "headers" | "body" | "auth" | "more"
export type HttpRequestMoreView = "options" | "assertions" | "chaining" | "preview"
export type HttpResponseView = "pretty" | "raw" | "headers" | "timing" | "more"
export type HttpResponseMoreView = "summary" | "cookies" | "redirects" | "assertions" | "console"
export type HttpWorkspaceOverlay =
  | "jump"
  | "help"
  | "curl-import"
  | "curl-export"
  | "history-diff"
  | "request-move"
  | "request-delete"
  | "collection-import"
  | "collection-runner"
  | "discard-document"
  | "external-conflict"
  | "environment-manager"
  | "insecure-tls-confirmation"
  | null
export type HttpJumpTarget = "url" | "response" | "collection" | "history"
export type HttpBodyKind = "none" | "json" | "text" | "xml" | "form" | "multipart" | "file"
export type HttpResponseBodyKind = "text" | "json" | "xml" | "html" | "binary"
export type HttpFailureKind =
  | "url"
  | "dns"
  | "network"
  | "tls"
  | "timeout"
  | "cancelled"
  | "redirect"
  | "body"
  | "parse"

export type HttpRedirectHop = {
  status: number
  url: string
  location: string
  crossOrigin: boolean
}

export type HttpKeyValue = {
  id: string
  enabled: boolean
  name: string
  value: string
  sensitivity: "normal" | "secret-ref" | "literal-secret"
  origin?: "request" | "collection" | "workspace"
}

export type HttpAuth =
  | { kind: "none" }
  | { kind: "bearer"; token: string }
  | { kind: "basic"; username: string; password: string }
  | { kind: "api-key"; placement: "header" | "query"; name: string; value: string }

export type HttpMultipartPart = {
  id: string
  enabled: boolean
  name: string
  value: string
  kind: "text" | "file"
  sensitivity: "normal" | "secret-ref" | "literal-secret"
}

export type HttpAssertionDefinition = { id: string; expression: string }
export type HttpAssertionResult = {
  id: string
  expression: string
  passed: boolean
  actual: string
  message: string
}

export type HttpChainExtraction = { id?: string; name: string; jsonPath: string; secret: boolean }

export type HttpRequestDefinition = {
  id: string
  source:
    | { kind: "scratch" }
    | {
        kind: "file"
        path: string
        blockId: string
        sourceHash: string
        supported?: boolean
        rawText?: string
      }
  name: string
  method: HttpMethod
  url: string
  query: HttpKeyValue[]
  path: HttpKeyValue[]
  headers: HttpKeyValue[]
  auth: HttpAuth
  body: {
    kind: HttpBodyKind
    text: string
    form: HttpKeyValue[]
    multipart?: HttpMultipartPart[]
    filePath?: string
  }
  options: {
    timeoutMs: number
    followRedirects: boolean
    timeoutExplicit?: boolean
    followRedirectsExplicit?: boolean
    cookieJar?: boolean
    proxy?: string
    tlsVerification?: "strict" | "insecure"
    noLog?: boolean
  }
  assertions?: HttpAssertionDefinition[]
  chain?: { dependsOn?: string; extract: HttpChainExtraction[] }
}

export type HttpVariableOrigin = "request" | "file" | "private" | "public" | "built-in"

export type HttpVariableValue = {
  value: string
  origin: HttpVariableOrigin
  secret: boolean
}

export type HttpVariableContext = ReadonlyMap<string, HttpVariableValue>

// Values are captured privately by these functions, never as serializable fields.
export type HttpPrivacyContext = {
  readonly hasSecrets: boolean
  redactText: (value: string) => string
  redactUrl: (value: string) => string
  toJSON: () => undefined
}

export type HttpProjectRequestItem = {
  filePath: string
  request: HttpRequestDefinition
}

export type HttpPreparedRequest = {
  privacy?: HttpPrivacyContext
  credentialHeaderNames?: readonly string[]
  executionId: string
  requestId: string
  requestRevision: number
  method: string
  url: string
  headers: Array<[string, string]>
  body?: string | Blob | FormData
  bodyDescriptor?:
    | { kind: "file"; path: string }
    | {
        kind: "multipart"
        parts: Array<{
          name: string
          value: string
          kind: "text" | "file"
          sensitivity: HttpMultipartPart["sensitivity"]
        }>
      }
  timeoutMs: number
  followRedirects: boolean
  useCookieJar?: boolean
  proxyUrl?: string
  tlsVerification?: "strict" | "insecure"
}

export type HttpResponseSnapshot = {
  privacy?: HttpPrivacyContext
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
  downloadedBytes?: number
  encoding: string
  redirects: HttpRedirectHop[]
  timings: { headersMs: number; downloadMs: number; totalMs: number }
  assertions?: HttpAssertionResult[]
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
      kind: HttpFailureKind
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
  requestMoreView: HttpRequestMoreView
  responseView: HttpResponseView
  responsePresentation: {
    wrap: boolean
    lineNumbers: boolean
    foldDepth: number | null
    jsonSelectedPath: string | null
    jsonCollapsedPaths: string[]
    searchOpen: boolean
    searchQuery: string
    searchMatchIndex: number
    jsonPathOpen: boolean
    jsonPath: string
    moreView: HttpResponseMoreView
  }
  splitRatio: number
  maximizedPane: "request" | "response" | null
  execution: HttpExecutionState
}

export type HttpHistoryEntry = {
  privacy?: HttpPrivacyContext
  id: string
  createdAt: number
  requestId: string
  requestName: string
  environmentName: string | null
  method: string
  url: string
  status: number | null
  durationMs: number | null
  error: string | null
  response?: Omit<HttpResponseSnapshot, "body"> & { body?: Uint8Array }
  bodyDiscarded: boolean
  persisted: boolean
}

export type HttpWorkspaceState = {
  documents: HttpDocumentState[]
  activeDocumentId: string
  activePane: HttpPane
  navigationView: HttpNavigationView
  navigationOpen: boolean
  overlay: HttpWorkspaceOverlay
  history: HttpHistoryEntry[]
  historySelection: string[]
}
