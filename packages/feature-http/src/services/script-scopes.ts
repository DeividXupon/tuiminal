import type { HttpVariableContext, HttpVariableValue } from "../model/types"
import type { ScriptExecution, ScriptScope } from "./script-sandbox"

type Values = Record<string, string>
type Scopes = {
  environment: Values
  globals: Values
  collectionVariables: Values
}
type Binding = { scopes: Scopes; commit?: (scopes: Scopes) => void }
const bindings = new WeakMap<HttpVariableContext, Binding>()
const scopeNames = ["globals", "collectionVariables", "environment"] as const

export function hasHttpScriptScopes(context: HttpVariableContext) {
  return bindings.has(context)
}

export function carryHttpScriptScopes(from: HttpVariableContext, to: HttpVariableContext) {
  const binding = bindings.get(from)
  if (binding) bindings.set(to, binding)
  return to
}

function resolvedScopes(base: HttpVariableContext, before: Scopes, after: Scopes, local: Values) {
  const next = new Map(base)
  for (const scopes of [before, after])
    for (const name of scopeNames) for (const key of Object.keys(scopes[name])) next.delete(key)
  for (const [key, value] of Object.entries({
    ...after.globals,
    ...after.collectionVariables,
    ...after.environment,
    ...local,
  }))
    next.set(
      key,
      base.get(key)?.value === value ? base.get(key)! : { value, origin: "private", secret: true },
    )
  return next
}
export function httpScriptLocals(context: HttpVariableContext, scopes: Scopes) {
  return Object.fromEntries(
    [...context]
      .filter(
        ([key, value]) =>
          value.origin === "request" ||
          value.origin === "built-in" ||
          !scopeNames.some((name) => key in scopes[name]),
      )
      .map(([key, value]) => [key, value.value]),
  )
}

/** Volatile, owned by a workspace; scripts never write remote or credential storage. */
export class HttpScriptScopeStore {
  private changes = new Map<string, Map<string, string | null>>()
  private baselines = new Map<string, Values>()
  clear() {
    this.changes.clear()
    this.baselines.clear()
  }
  context(base: HttpVariableContext, keys: Record<keyof Scopes, string>, initial: Scopes) {
    const scopes = { ...initial }
    for (const name of scopeNames) {
      const key = keys[name]
      const changes = this.changes.get(key) ?? new Map<string, string | null>()
      const previous = this.baselines.get(key) ?? {}
      for (const variable of changes.keys())
        if (previous[variable] !== initial[name][variable]) changes.delete(variable)
      this.changes.set(key, changes)
      this.baselines.set(key, { ...initial[name] })
      scopes[name] = { ...initial[name] }
      for (const [variable, value] of changes) {
        if (value === null) {
          delete scopes[name][variable]
        } else {
          scopes[name][variable] = value
        }
      }
    }
    const context = resolvedScopes(base, initial, scopes, httpScriptLocals(base, initial))
    let committedScopes = scopes
    bindings.set(context, {
      scopes,
      commit: (next) => {
        for (const name of scopeNames) {
          const changes = this.changes.get(keys[name])!
          for (const key of new Set([
            ...Object.keys(committedScopes[name]),
            ...Object.keys(next[name]),
          ]))
            if (committedScopes[name][key] !== next[name][key])
              changes.set(key, next[name][key] ?? null)
        }
        committedScopes = next
      },
    })
    return context
  }
}

export function httpScriptScopes(context: HttpVariableContext) {
  const binding = bindings.get(context)
  if (binding) return binding.scopes
  return {
    environment: Object.fromEntries(
      [...context]
        .filter(([, v]) => v.origin === "private" || v.origin === "public")
        .map(([k, v]) => [k, v.value]),
    ),
    globals: {},
    collectionVariables: Object.fromEntries(
      [...context].filter(([, v]) => v.origin === "file").map(([k, v]) => [k, v.value]),
    ),
  }
}
export function scriptScope(values: Values): ScriptScope {
  return {
    values: Object.entries(values).map(([key, value]) => ({ key, value })),
  }
}
function scopeValues(scope: ScriptScope): Values {
  return Object.fromEntries(
    (scope.values ?? [])
      .filter((v) => !v.disabled)
      .map((v) => [v.key, typeof v.value === "string" ? v.value : (JSON.stringify(v.value) ?? "")]),
  )
}
export function applyHttpScriptScopes(context: HttpVariableContext, result: ScriptExecution) {
  const before = httpScriptScopes(context)
  const scopes: Scopes = {
    environment: scopeValues(result.environment),
    globals: scopeValues(result.globals),
    collectionVariables: scopeValues(result.collectionVariables),
  }
  const local = scopeValues(result._variables)
  const next = resolvedScopes(context, before, scopes, local)
  for (const key of Object.keys(httpScriptLocals(context, before)))
    if (!(key in local) && !scopeNames.some((name) => key in scopes[name])) next.delete(key)
  for (const [key, value] of Object.entries(local)) {
    const original = context.get(key)
    if (original?.origin !== "built-in" || original.value !== value)
      next.set(key, {
        value,
        origin: "request",
        secret: original?.value === value ? original.secret : true,
      })
  }
  const binding = bindings.get(context)
  binding?.commit?.(scopes)
  bindings.set(next, {
    scopes,
    ...(binding?.commit ? { commit: binding.commit } : {}),
  })
  return next
}

export function retainHttpScriptVariables(
  before: HttpVariableContext,
  after: HttpVariableContext,
  values: Map<string, HttpVariableValue>,
) {
  const scoped = hasHttpScriptScopes(before)
  for (const [key, value] of after)
    if (before.get(key)?.value !== value.value && (value.origin === "request" || !scoped))
      values.set(key, value)
  for (const key of values.keys()) if (!after.has(key)) values.delete(key)
}
