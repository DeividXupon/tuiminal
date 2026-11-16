import { equivalentShortcutActions } from "./equivalent-actions"
import { TOOL_SHORTCUT_KEYS } from "./defaults"
import {
  displayShortcut,
  eventShortcut,
  keyForShortcut,
  normalizeShortcut,
  type ShortcutKey,
} from "./key-combination"
export { normalizeShortcut, type ShortcutKey } from "./key-combination"
export type ShortcutTool = "global" | "database" | "git" | "runner" | "http" | "terminal"
export type ShortcutBindings = Record<string, Record<string, string[]>>

const globalDefaults: ShortcutBindings = {
  workspace: {
    database: ["Alt+1"],
    git: ["Alt+2"],
    runner: ["Alt+3"],
    http: ["Alt+4"],
    terminal: ["Alt+5"],
    settings: [","],
    quit: ["q"],
    escape: ["Esc"],
    interrupt: ["Ctrl+c"],
  },
}
const active = new Map<ShortcutTool, ShortcutBindings>()
const mappedEvents = new WeakMap<object, string>()
const defaultsCache = new Map<ShortcutTool, ShortcutBindings>()

function defaultsFor(tool: ShortcutTool): ShortcutBindings {
  if (tool === "global") return globalDefaults
  const cached = defaultsCache.get(tool)
  if (cached) return cached
  const contexts = TOOL_SHORTCUT_KEYS[tool]!
  const result = Object.fromEntries(
    Object.entries(contexts).map(([context, keys]) => [
      context,
      Object.fromEntries(
        keys.map((key) => {
          const normalized = normalizeShortcut(key)
          return [normalized, [normalized]]
        }),
      ),
    ]),
  )
  defaultsCache.set(tool, result)
  return result
}

export function getDefaultShortcuts(tool: ShortcutTool): ShortcutBindings {
  return structuredClone(defaultsFor(tool))
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function shortcutList(value: unknown, path: string) {
  if (value === null) return []
  const values = typeof value === "string" ? [value] : value
  if (!Array.isArray(values) || values.some((item) => typeof item !== "string"))
    throw new Error(`${path}: expected a key, a list of keys, or null`)
  const result = values.map(normalizeShortcut)
  if (new Set(result).size !== result.length) throw new Error(`${path}: duplicate key`)
  return result
}

function applyContext(
  tool: ShortcutTool,
  context: string,
  bindings: Record<string, string[]>,
  configured: Record<string, unknown>,
) {
  const seen = new Set<string>()
  for (const [action, keys] of Object.entries(configured)) {
    const normalized = tool === "global" ? action : normalizeShortcut(action)
    if (!Object.hasOwn(bindings, normalized))
      throw new Error(`shortcuts.${context}.${action}: unknown key`)
    if (seen.has(normalized))
      throw new Error(`shortcuts.${context}.${action}: duplicate key identity`)
    seen.add(normalized)
    bindings[normalized] = shortcutList(keys, `shortcuts.${context}.${action}`)
  }
}

function validateContextConflicts(
  tool: ShortcutTool,
  context: string,
  bindings: Record<string, string[]>,
) {
  const owners = new Map<string, string>()
  for (const [action, keys] of Object.entries(bindings))
    for (const key of keys) {
      const previous = owners.get(key)
      if (previous && !equivalentShortcutActions(tool, context, previous, action))
        throw new Error(`shortcuts.${context}: ${previous} and ${action} conflict on ${key}`)
      owners.set(key, action)
    }
}

/** Validate after filling missing defaults, so upgrades detect newly introduced collisions. */
export function validateShortcuts(tool: ShortcutTool, value: unknown): ShortcutBindings {
  const result = getDefaultShortcuts(tool)
  if (!record(value)) throw new Error("shortcuts: expected a mapping of contexts")
  for (const [context, configured] of Object.entries(value)) {
    if (!Object.hasOwn(result, context)) throw new Error(`shortcuts.${context}: unknown context`)
    if (!record(configured)) throw new Error(`shortcuts.${context}: expected a mapping of keys`)
    applyContext(tool, context, result[context]!, configured)
  }
  for (const [context, bindings] of Object.entries(result))
    validateContextConflicts(tool, context, bindings)

  return result
}

export function setToolShortcuts(tool: ShortcutTool, bindings: ShortcutBindings) {
  active.set(tool, structuredClone(bindings))
}

export function getToolShortcuts(tool: ShortcutTool) {
  return structuredClone(active.get(tool) ?? getDefaultShortcuts(tool))
}

function binding(tool: ShortcutTool, context: string, action: string) {
  const defaults = defaultsFor(tool)
  return active.get(tool)?.[context]?.[action] ?? defaults[context]?.[action]
}

function contextualPhysical(bindings: Record<string, string[]>, event: string) {
  const unshifted = event.replace(/(^|\+)Shift\+/, "$1")
  const explicit =
    Object.hasOwn(bindings, event) || Object.values(bindings).some((keys) => keys.includes(event))
  return explicit ? event : unshifted
}

export function shortcutMatches(
  tool: ShortcutTool,
  context: string,
  action: string,
  key: ShortcutKey,
) {
  const bindings = active.get(tool)?.[context] ?? defaultsFor(tool)[context] ?? {}
  const physical = eventShortcut(key)
  const allowShiftAlias =
    tool !== "global" || (physical.startsWith("Shift+") && [...physical.slice(6)].length === 1)
  return (
    binding(tool, context, action)?.includes(
      allowShiftAlias ? contextualPhysical(bindings, physical) : physical,
    ) ?? false
  )
}

export function shortcutLabel(tool: ShortcutTool, context: string, action: string) {
  const keys = binding(tool, context, action) ?? []
  return keys.length ? `[${keys.map(displayShortcut).join("/")}]` : ""
}

/** Never mutate the input event: native text editors and PTYs keep the original bytes. */
export function remapShortcutKey<T extends ShortcutKey>(
  tool: ShortcutTool,
  context: string,
  key: T,
): T {
  const scopeId = `${tool}:${context}`
  if (mappedEvents.get(key) === scopeId) return key
  const configured = active.get(tool)?.[context]
  if (!configured) return key
  const event = eventShortcut(key)
  const candidate = contextualPhysical(configured, event)
  const physical =
    Object.hasOwn(configured, candidate) ||
    Object.values(configured).some((keys) => keys.includes(candidate))
      ? candidate
      : event
  const target = Object.entries(configured).find(([, keys]) => keys.includes(physical))?.[0]
  if (
    (target === physical && event === physical) ||
    (!target && !Object.hasOwn(configured, physical))
  )
    return key
  if (
    event !== physical &&
    target === physical &&
    configured[physical]?.length === 1 &&
    configured[physical]?.[0] === physical
  )
    return key
  const fields = target ? keyForShortcut(target) : keyForShortcut("F24")
  if (!target) {
    fields.name = "unbound-shortcut"
    fields.sequence = ""
    fields.raw = ""
  }
  const mapped = new Proxy(key, {
    get(original, property) {
      if (Object.hasOwn(fields, property)) return fields[property as keyof ShortcutKey]
      const value = Reflect.get(original, property, original)
      return typeof value === "function" ? value.bind(original) : value
    },
  })
  mappedEvents.set(mapped, scopeId)
  return mapped
}

function hintTokens(content: string) {
  const arrows = /^[↑↓←→]{2,}$/.test(content)
  const parts = arrows ? [...content] : content.split("/")
  const inherited = parts[0]?.match(/^((?:(?:Ctrl|Alt|Shift|Super)\+)+)/i)?.[1] ?? ""
  return parts.map((part, index) =>
    index > 0 && inherited && !part.includes("+") ? `${inherited}${part}` : part,
  )
}

function remappedHint(tool: ShortcutTool, context: string, part: string) {
  const directional = /^([a-z])([←→])$/i.exec(part)
  const token = directional?.[1] ?? part
  let canonical: string
  try {
    canonical = normalizeShortcut(token)
  } catch {
    return { changed: false, labels: [part] }
  }
  const keys = binding(tool, context, canonical)
  const changed = keys !== undefined && !(keys.length === 1 && keys[0] === canonical)
  return {
    changed,
    labels: changed
      ? keys.map((key) => `${displayShortcut(key)}${directional?.[2] ?? ""}`)
      : [part],
  }
}

export function formatShortcutHints(tool: ShortcutTool, context: string, text: string) {
  return text.replace(/\[([^\[\]\n]+)\]/g, (original, content: string) => {
    const mapped = hintTokens(content).map((part) => remappedHint(tool, context, part))
    if (!mapped.some(({ changed }) => changed)) return original
    const labels = [...new Set(mapped.flatMap(({ labels }) => labels))]
    return labels.length ? `[${labels.join("/")}]` : ""
  })
}
