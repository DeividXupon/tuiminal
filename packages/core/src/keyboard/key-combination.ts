/** The physical event stays intact; scoped remapping only changes a handler's view. */
export type ShortcutKey = {
  name: string
  sequence?: string | undefined
  raw?: string | undefined
  ctrl?: boolean | undefined
  meta?: boolean | undefined
  option?: boolean | undefined
  shift?: boolean | undefined
  super?: boolean | undefined
}

const names: Record<string, string> = {
  escape: "Esc",
  esc: "Esc",
  return: "Enter",
  enter: "Enter",
  tab: "Tab",
  space: "Space",
  up: "Up",
  down: "Down",
  left: "Left",
  right: "Right",
  home: "Home",
  end: "End",
  pageup: "PageUp",
  pagedown: "PageDown",
  backspace: "Backspace",
  delete: "Delete",
  insert: "Insert",
  comma: ",",
  "↵": "Enter",
  "⏎": "Enter",
  spc: "Space",
  del: "Delete",
  pgup: "PageUp",
  pgdn: "PageDown",
  "↑": "Up",
  "↓": "Down",
  "←": "Left",
  "→": "Right",
}
const eventNames: Record<string, string> = { Esc: "escape", Enter: "return", Space: "space" }
const optionNumbers = ["º", "¡", "™", "£", "¢", "∞", "§", "¶", "•", "ª"]

export function normalizeShortcut(value: string): string {
  const input = value.trim().replace(/^\[(.*)\]$/, "$1")
  const parts = input === "+" ? ["+"] : input.split("+")
  const rawName = parts.pop() || (parts.pop() === "" ? "+" : "")
  const name =
    names[rawName.toLowerCase()] ??
    (/^f\d{1,2}$/i.test(rawName) ? rawName.toUpperCase() : rawName.toLowerCase())
  if (
    !(name in eventNames) &&
    !Object.values(names).includes(name) &&
    !/^f(?:[1-9]|1\d|2[0-4])$/i.test(name) &&
    [...name].length !== 1
  )
    throw new Error(`Invalid key combination: ${value}`)
  const modifiers = parts.map((part) => part.toLowerCase())
  if (
    modifiers.some(
      (part) => !["ctrl", "control", "alt", "meta", "option", "shift", "super"].includes(part),
    )
  )
    throw new Error(`Invalid key combination: ${value}`)
  const result = [
    modifiers.some((part) => part === "ctrl" || part === "control") ? "Ctrl" : "",
    modifiers.some((part) => ["alt", "meta", "option"].includes(part)) ? "Alt" : "",
    modifiers.includes("shift") ? "Shift" : "",
    modifiers.includes("super") ? "Super" : "",
  ].filter(Boolean)
  if (result.length !== modifiers.length) throw new Error(`Duplicate key modifier: ${value}`)
  return [...result, name].join("+")
}

export function eventShortcut(key: ShortcutKey): string {
  const values = [key.name, key.sequence, key.raw]
  const optionIndex = optionNumbers.findIndex((symbol) => values.includes(symbol))
  const alt = Boolean(key.meta || key.option || optionIndex >= 0)
  const name = optionIndex >= 0 ? String(optionIndex) : key.name
  try {
    return normalizeShortcut(
      `${key.ctrl ? "Ctrl+" : ""}${alt ? "Alt+" : ""}${key.shift ? "Shift+" : ""}${key.super ? "Super+" : ""}${name}`,
    )
  } catch {
    return ""
  }
}

export function keyForShortcut(value: string): ShortcutKey {
  const normalized = normalizeShortcut(value)
  const parts = normalized.split("+")
  const name = parts.pop() || "+"
  return {
    name: eventNames[name] ?? name.toLowerCase(),
    sequence: name.length === 1 ? name : "",
    raw: name.length === 1 ? name : "",
    ctrl: parts.includes("Ctrl"),
    meta: parts.includes("Alt"),
    option: parts.includes("Alt"),
    shift: parts.includes("Shift"),
    super: parts.includes("Super"),
  }
}

export function displayShortcut(value: string) {
  return normalizeShortcut(value).replace(/(?:^|\+)([a-z])$/g, (match) => match.toUpperCase())
}
