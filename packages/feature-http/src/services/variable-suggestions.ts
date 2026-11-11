import type { HttpVariableContext } from "../model/types"
import type { HttpVariableSuggestion } from "../model/variable-completion"
import { httpScriptScopes } from "./script-scopes"

/** Preserve the winning scope after overrides, including session script edits. */
export function httpVariableSuggestions(context: HttpVariableContext): HttpVariableSuggestion[] {
  const scopes = httpScriptScopes(context)
  const priority = { environment: 0, global: 1, collection: 2, request: 3, "built-in": 4 }
  return [...context]
    .map(([name, definition]): HttpVariableSuggestion => {
      let scope: HttpVariableSuggestion["scope"]
      if (definition.origin === "built-in") scope = "built-in"
      else if (definition.origin === "request") scope = "request"
      else if (Object.hasOwn(scopes.environment, name)) scope = "environment"
      else if (Object.hasOwn(scopes.collectionVariables, name)) scope = "collection"
      else if (Object.hasOwn(scopes.globals, name)) scope = "global"
      else scope = definition.origin === "file" ? "collection" : "global"
      return { name, value: definition.value, scope }
    })
    .sort((a, b) => priority[a.scope] - priority[b.scope])
}
