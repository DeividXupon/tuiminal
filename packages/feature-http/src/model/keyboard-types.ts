import type { HttpJsonTreeAction } from "./json-tree"
import type {
  HttpJumpTarget,
  HttpPane,
  HttpRequestMoreView,
  HttpRequestView,
  HttpResponseMoreView,
  HttpWorkspaceOverlay,
} from "./types"

export type HttpKey = {
  name: string
  ctrl?: boolean
  shift?: boolean
  option?: boolean
  meta?: boolean
}

export type HttpKeyboardCommand =
  | {
      kind: "none" | "ignore" | "blur-url" | "blur-editor" | "blur-control" | "send" | "cancel"
    }
  | {
      kind:
        | "add-document"
        | "close-document"
        | "close-navigation"
        | "save-document"
        | "open-environment-manager"
        | "open-response-search"
        | "open-response"
        | "focus-collection-search"
        | "blur-navigation-control"
        | "duplicate-document"
        | "back-import-preview"
        | "cycle-runner-target"
        | "cycle-runner-concurrency"
        | "approve-runner-insecure-tls"
        | "add-automation-row"
        | "cycle-request-timeout"
        | "toggle-request-redirects"
        | "toggle-request-cookie-jar"
        | "toggle-request-tls-verification"
        | "toggle-request-no-log"
    }
  | {
      kind: "resolve-external-conflict"
      resolution: "reload" | "apply-local" | "save-copy"
    }
  | { kind: "toggle-maximize" }
  | { kind: "open-overlay"; overlay: Exclude<HttpWorkspaceOverlay, null> }
  | { kind: "close-overlay" }
  | { kind: "apply-overlay" }
  | { kind: "close-response-control"; control: "search" | "jsonpath" }
  | { kind: "jump"; target: HttpJumpTarget }
  | { kind: "resize-split"; direction: -1 | 1 }
  | { kind: "cycle-document" | "cycle-method"; direction: -1 | 1 }
  | { kind: "focus-url" }
  | { kind: "request-view"; view: HttpRequestView }
  | { kind: "request-more-view"; view: HttpRequestMoreView }
  | { kind: "response-more-view"; view: HttpResponseMoreView }
  | { kind: "navigation"; view: "collection" | "history" }
  | { kind: "pane"; pane: HttpPane }
  | { kind: "cycle-pane"; direction: -1 | 1 }
  | { kind: "cycle-body-kind"; direction: -1 | 1 }
  | { kind: "cycle-auth-kind"; direction: -1 | 1 }
  | { kind: "cycle-response"; direction: -1 | 1 }
  | { kind: "response-json"; action: HttpJsonTreeAction }
