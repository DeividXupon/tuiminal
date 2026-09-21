export const TERMINAL_MASTER_KEYS = [
  "Ctrl+B",
  "Ctrl+A",
  "Ctrl+Space",
  "Ctrl+F",
  "Ctrl+G",
  "Ctrl+N",
  "Ctrl+P",
  "Ctrl+T",
] as const

export type TerminalMasterKey = (typeof TERMINAL_MASTER_KEYS)[number]
export const DEFAULT_TERMINAL_MASTER_KEY: TerminalMasterKey = "Ctrl+B"

export function isTerminalMasterKey(value: unknown): value is TerminalMasterKey {
  return TERMINAL_MASTER_KEYS.some((candidate) => candidate === value)
}

export function matchesTerminalMasterKey(
  key: { name: string; ctrl?: boolean; meta?: boolean; option?: boolean; shift?: boolean },
  masterKey: TerminalMasterKey,
) {
  return Boolean(
    key.ctrl &&
      !key.meta &&
      !key.option &&
      !key.shift &&
      key.name.toLowerCase() === masterKey.slice(5).toLowerCase(),
  )
}

export function terminalMasterKeyBytes(masterKey: TerminalMasterKey) {
  return masterKey === "Ctrl+Space" ? "\u0000" : String.fromCharCode(masterKey.charCodeAt(5) - 64)
}

export function normalizeTerminalAgentCommands(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [
    ...new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim().toLowerCase())
        .filter((item) => item.length > 0 && item.length <= 160 && !/[\p{Cc}\p{Cf}]/u.test(item)),
    ),
  ].slice(0, 64)
}
