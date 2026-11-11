import type { HttpKey } from "./keyboard-types"

export type HttpVariableSuggestion = {
  name: string
  value: string
  scope: "environment" | "global" | "collection" | "request" | "built-in"
}
export type HttpCompletionKey = HttpKey & {
  preventDefault(): void
  stopPropagation(): void
}

export function httpVariableInput(id: string) {
  return (
    id === "http-url-input" ||
    /^http-(key-value-(name|value)-|auth-(token|username|password|key-name|key-value|oauth2-field)-|body-editor-|request-proxy-)/.test(
      id,
    )
  )
}
