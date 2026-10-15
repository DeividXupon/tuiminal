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

export type TerminalRemoteCodexProfile = {
  id: string
  name: string
  host: string
}

const TERMINAL_REMOTE_PROFILE_LIMIT = 16

function normalizedProfileText(value: unknown, maximumLength: number) {
  if (typeof value !== "string") return ""
  const normalized = value.trim()
  if (
    normalized.length === 0 ||
    normalized.length > maximumLength ||
    /[\p{Cc}\p{Cf}]/u.test(normalized)
  )
    return ""
  return normalized
}

export function terminalRemoteProfileValidationError(
  profile: TerminalRemoteCodexProfile,
): "name" | "host" | null {
  if (!normalizedProfileText(profile.name, 80)) return "name"
  if (!normalizedProfileText(profile.host, 255) || !/^[a-z\d_][a-z\d_.-]*$/iu.test(profile.host))
    return "host"
  return null
}

export function normalizeTerminalRemoteCodexProfiles(value: unknown): TerminalRemoteCodexProfile[] {
  if (!Array.isArray(value)) return []
  const profiles = new Map<string, TerminalRemoteCodexProfile>()
  for (const item of value) {
    if (!item || typeof item !== "object") continue
    const candidate = item as Partial<TerminalRemoteCodexProfile>
    // Legacy profiles stored connection details directly. Their host cannot be
    // assumed to name an OpenSSH config entry, so selecting a config alias again
    // is safer than silently changing how they authenticate.
    if ("user" in candidate || "port" in candidate || "identityFile" in candidate) continue
    const profile: TerminalRemoteCodexProfile = {
      id: normalizedProfileText(candidate.id, 80),
      name: normalizedProfileText(candidate.name, 80),
      host: normalizedProfileText(candidate.host, 255),
    }
    if (!profile.id || terminalRemoteProfileValidationError(profile)) continue
    profiles.set(profile.id, profile)
    if (profiles.size >= TERMINAL_REMOTE_PROFILE_LIMIT) break
  }
  return [...profiles.values()]
}

export function normalizeTerminalRemoteActiveProfileId(
  value: unknown,
  profiles: readonly TerminalRemoteCodexProfile[],
) {
  return profiles.some((profile) => profile.id === value)
    ? (value as string)
    : (profiles[0]?.id ?? null)
}

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
