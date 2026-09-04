import type { HttpVariableContext, HttpVariableOrigin, HttpVariableValue } from "./types"

export type HttpVariableLayer = {
  origin: HttpVariableOrigin
  values: Readonly<Record<string, string>>
  secret?: boolean
}

export class HttpVariableError extends Error {
  constructor(
    readonly kind: "unresolved" | "cycle",
    readonly variableName: string,
  ) {
    super(
      kind === "cycle"
        ? `A variável ${variableName} possui uma referência circular.`
        : `A variável ${variableName} não foi definida.`,
    )
    this.name = "HttpVariableError"
  }
}

const VARIABLE_PATTERN = /\{\{\s*([A-Za-z_$][\w$.-]*)\s*\}\}/g

export function createHttpVariableContext(layers: readonly HttpVariableLayer[]) {
  const context = new Map<string, HttpVariableValue>()
  for (const layer of layers) {
    for (const [name, value] of Object.entries(layer.values)) {
      if (!context.has(name)) {
        context.set(name, { value, origin: layer.origin, secret: layer.secret ?? false })
      }
    }
  }
  return context
}

function resolveVariable(
  name: string,
  context: HttpVariableContext,
  stack: ReadonlySet<string>,
): string {
  if (stack.has(name)) throw new HttpVariableError("cycle", name)
  const definition = context.get(name)
  if (!definition) throw new HttpVariableError("unresolved", name)
  const nextStack = new Set(stack)
  nextStack.add(name)
  return definition.value.replace(VARIABLE_PATTERN, (_match, nested: string) =>
    resolveVariable(nested, context, nextStack),
  )
}

export function resolveHttpTemplate(source: string, context?: HttpVariableContext) {
  if (!context || !source.includes("{{")) return source
  return source.replace(VARIABLE_PATTERN, (_match, name: string) =>
    resolveVariable(name, context, new Set()),
  )
}

export function redactHttpTemplate(source: string, context?: HttpVariableContext) {
  if (!context || !source.includes("{{")) return source
  return source.replace(VARIABLE_PATTERN, (match, name: string) => {
    const definition = context.get(name)
    return definition?.secret ? `<${name}:mascarado>` : match
  })
}

export function httpVariableSuggestions(source: string, context?: HttpVariableContext) {
  const match = source.match(/\{\{\s*([\w$.-]*)$/)
  if (!match || !context) return []
  const prefix = (match[1] ?? "").toLowerCase()
  return [...context.keys()].filter((name) => name.toLowerCase().startsWith(prefix)).sort()
}
