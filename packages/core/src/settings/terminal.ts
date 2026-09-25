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
  user: string
  port: number
  identityFile: string
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
): "name" | "host" | "user" | "port" | "identityFile" | null {
  if (!normalizedProfileText(profile.name, 80)) return "name"
  if (
    !normalizedProfileText(profile.host, 255) ||
    !/^(?:[a-z\d](?:[a-z\d.-]*[a-z\d])?|[\da-f:]+)$/iu.test(profile.host)
  )
    return "host"
  if (!normalizedProfileText(profile.user, 64) || !/^[a-z_][a-z\d_.-]*\$?$/iu.test(profile.user))
    return "user"
  if (!Number.isInteger(profile.port) || profile.port < 1 || profile.port > 65_535) return "port"
  if (!normalizedProfileText(profile.identityFile, 4_096)) return "identityFile"
  return null
}

export function normalizeTerminalRemoteCodexProfiles(value: unknown): TerminalRemoteCodexProfile[] {
  if (!Array.isArray(value)) return []
  const profiles = new Map<string, TerminalRemoteCodexProfile>()
  for (const item of value) {
    if (!item || typeof item !== "object") continue
    const candidate = item as Partial<TerminalRemoteCodexProfile>
    const profile: TerminalRemoteCodexProfile = {
      id: normalizedProfileText(candidate.id, 80),
      name: normalizedProfileText(candidate.name, 80),
      host: normalizedProfileText(candidate.host, 255),
      user: normalizedProfileText(candidate.user, 64),
      port: typeof candidate.port === "number" ? candidate.port : Number.NaN,
      identityFile: normalizedProfileText(candidate.identityFile, 4_096),
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
