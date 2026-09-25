import { type KeyEvent, RGBA } from "@opentui/core"
import { COLORS, type TerminalRemoteCodexProfile } from "@xupon/tuiminal-core/settings/theme"
import { blendTextColor } from "@xupon/tuiminal-core/ui/text-shimmer"
import type {
  RemoteCodexConnectionTestResult,
  RemoteServerBarrierCode,
  RemoteServerReadinessReport,
} from "@xupon/tuiminal-feature-terminal"

export function contextualRemoteSettingsOwnKey(
  focusedId: string | null | undefined,
  keyName: string,
) {
  if (/^configuration-terminal-remote-(?:name|user|host|port|identityFile)$/.test(focusedId ?? ""))
    return true
  return (
    (focusedId?.startsWith("configuration-terminal-remote-") ?? false) &&
    [
      "escape",
      "a",
      "c",
      "n",
      "s",
      "t",
      "v",
      "enter",
      "return",
      "up",
      "down",
      "j",
      "k",
      "tab",
    ].includes(keyName)
  )
}

export type RemoteProfileDraft = Omit<TerminalRemoteCodexProfile, "port"> & { port: string }

export type TerminalRemoteSettingsDetailProps = {
  profiles: TerminalRemoteCodexProfile[]
  activeProfileId: string | null
  notice: string
  compact: boolean
  contentWidth: number
  onBack: () => void
  onActiveProfileChange: (profileId: string) => void
  onChange: (profiles: TerminalRemoteCodexProfile[]) => void
  onTest: (
    profile: TerminalRemoteCodexProfile,
    signal?: AbortSignal,
  ) => Promise<RemoteCodexConnectionTestResult>
  onCheckReadiness: (
    profile: TerminalRemoteCodexProfile,
    signal?: AbortSignal,
  ) => Promise<RemoteServerReadinessReport>
  onConfigureServer: (profile: TerminalRemoteCodexProfile) => void
}

export function remoteFieldHighlight() {
  return blendTextColor(RGBA.fromHex(COLORS.panel), RGBA.fromHex(COLORS.terminal), 0.22)
}

export const FIELD_IDS = ["name", "user", "host", "port", "identityFile"] as const
export type FieldId = (typeof FIELD_IDS)[number]

type RemoteFormKeyAction =
  | "activate"
  | "blur"
  | "close"
  | "edit"
  | "previous"
  | "next"
  | "new"
  | "save"
  | "test"
  | "verify"
  | "configure"

const REMOTE_FORM_KEY_ACTIONS: Record<string, RemoteFormKeyAction | undefined> = {
  a: "activate",
  escape: "close",
  enter: "edit",
  return: "edit",
  up: "previous",
  k: "previous",
  down: "next",
  j: "next",
  tab: "next",
  n: "new",
  s: "save",
  t: "test",
  v: "verify",
  c: "configure",
}

const MODIFIER_FREE_ACTIONS = new Set<RemoteFormKeyAction>([
  "activate",
  "new",
  "save",
  "test",
  "verify",
  "configure",
])

export function remoteFormKeyAction(key: KeyEvent, inputFocused: boolean, busy: boolean) {
  if (inputFocused) return key.name === "escape" ? "blur" : undefined
  const action = REMOTE_FORM_KEY_ACTIONS[key.name]
  if (!action) return undefined
  if (key.name === "tab" && key.shift) return "previous"
  if (MODIFIER_FREE_ACTIONS.has(action) && (key.ctrl || key.meta)) return undefined
  if (busy && ["test", "verify", "configure"].includes(action)) return undefined
  return action
}

export function runRemoteFormKeyAction(
  action: RemoteFormKeyAction,
  handlers: Record<RemoteFormKeyAction, () => void>,
) {
  handlers[action]()
}

export const FIELD_LABELS: Record<FieldId, string> = {
  name: "Nome do perfil",
  user: "Usuário SSH",
  host: "Host ou IP",
  port: "Porta SSH",
  identityFile: "Chave privada",
}

export const FIELD_PLACEHOLDERS: Record<FieldId, string> = {
  name: "Oracle VPS",
  user: "ubuntu",
  host: "203.0.113.10",
  port: "22",
  identityFile: "~/.ssh/id_ed25519",
}

export function createDraft(profile?: TerminalRemoteCodexProfile): RemoteProfileDraft {
  if (profile) return { ...profile, port: String(profile.port) }
  return {
    id: `remote-${crypto.randomUUID()}`,
    name: "",
    host: "",
    user: "ubuntu",
    port: "22",
    identityFile: "",
  }
}

export function profileFromDraft(draft: RemoteProfileDraft): TerminalRemoteCodexProfile {
  return { ...draft, port: Number(draft.port) }
}

export function resultMessage(result: RemoteCodexConnectionTestResult) {
  const messages: Record<RemoteCodexConnectionTestResult["code"], string> = {
    connected: "Conexão SSH confirmada.",
    invalidProfile: "Preencha todos os campos com valores válidos.",
    identityMissing: "A chave privada não foi encontrada.",
    hostKey: "A identidade do servidor ainda não foi confirmada no known_hosts.",
    authentication: "A autenticação SSH foi recusada.",
    unreachable: "Não foi possível alcançar o servidor SSH.",
    timeout: "O teste de conexão excedeu o tempo limite.",
    cancelled: "Teste de conexão cancelado.",
    sshUnavailable: "O cliente SSH não está disponível.",
    failed: "O teste de conexão SSH falhou.",
  }
  return messages[result.code]
}

export function readinessCodeMessage(code: RemoteServerBarrierCode) {
  const messages: Record<RemoteServerBarrierCode, string> = {
    ready: "Pronto",
    gitMissing: "Git não está instalado.",
    sshMissing: "O cliente SSH não está instalado no servidor.",
    hostKey: "O GitHub ainda não foi confirmado no known_hosts do servidor.",
    authentication: "O GitHub não aceitou a chave SSH do servidor.",
    unreachable: "O servidor não conseguiu alcançar o GitHub.",
    codexMissing: "O Codex CLI não está instalado.",
    codexUnauthenticated: "A conta do Codex ainda não está conectada.",
    invalidProfile: "O perfil remoto é inválido.",
    identityMissing: "A chave privada não foi encontrada.",
    timeout: "A verificação excedeu o tempo limite.",
    cancelled: "Verificação cancelada.",
    sshUnavailable: "O cliente SSH local não está disponível.",
    failed: "Não foi possível concluir a verificação.",
  }
  return messages[code]
}
