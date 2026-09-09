import type { KeyboardScope } from "../../core/keyboard/scope"

export const httpKeyboardScope = {
  ids: [
    "http-url-input",
    "http-collection-search",
    "http-curl-import-editor",
    "http-discard-document-modal",
    "http-request-file-modal",
  ],
  prefixes: [
    "http-headers-editor-",
    "http-body-editor-",
    "http-key-value-",
    "http-auth-",
    "http-automation-",
    "http-custom-method-",
    "http-request-name-",
    "http-request-proxy-",
    "http-response-search-",
    "http-response-jsonpath-",
    "http-workspace-settings-",
    "http-overlay",
    "http-environment-",
    "http-collection-runner-",
    "http-collection-import-",
    "http-external-conflict-",
    "http-insecure-tls-",
    "http-redirect-approval-",
    "http-request-move-",
    "http-request-delete-",
    "http-curl-modal",
  ],
} as const satisfies KeyboardScope
