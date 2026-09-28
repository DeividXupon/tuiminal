import type { KeyEvent } from "@opentui/core"
import type { TerminalRemoteCodexProfile } from "@xupon/tuiminal-core/settings/theme"
import type {
  RemoteCodexConnectionTestResult,
  RemoteServerBarrierCode,
  RemoteServerReadinessReport,
} from "@xupon/tuiminal-feature-terminal"

export function contextualRemoteSettingsOwnKey(
  focusedId: string | null | undefined,
  keyName: string,
) {
  return (
    (focusedId?.startsWith("configuration-terminal-remote-") ?? false) &&
    ["escape", "a", "c", "r", "t", "v", "enter", "return", "up", "down", "j", "k", "tab"].includes(
      keyName,
    )
  )
}

export type TerminalRemoteSettingsDetailProps = {
  profiles: TerminalRemoteCodexProfile[]
  activeProfileId: string | null
  notice: string
  compact: boolean
  contentWidth: number
  onBack: () => void
  onListProfiles: (signal?: AbortSignal) => Promise<TerminalRemoteCodexProfile[]>
  onActivateProfile: (profile: TerminalRemoteCodexProfile) => void
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

export type RemoteProfileKeyAction =
  | "activate"
  | "close"
  | "previous"
  | "next"
  | "reload"
  | "test"
  | "verify"
  | "configure"

const REMOTE_PROFILE_KEY_ACTIONS: Record<string, RemoteProfileKeyAction | undefined> = {
  a: "activate",
  escape: "close",
  enter: "activate",
  return: "activate",
  up: "previous",
  k: "previous",
  down: "next",
  j: "next",
  tab: "next",
  r: "reload",
  t: "test",
  v: "verify",
  c: "configure",
}

export function remoteProfileKeyAction(key: KeyEvent, busy: boolean) {
  const action = REMOTE_PROFILE_KEY_ACTIONS[key.name]
  if (!action) return undefined
  if (key.name === "tab" && key.shift) return "previous"
  if (
    ["activate", "reload", "test", "verify", "configure"].includes(action) &&
    (key.ctrl || key.meta)
  )
    return undefined
  if (busy && ["reload", "test", "verify", "configure"].includes(action)) return undefined
  return action
}

export function resultMessage(result: RemoteCodexConnectionTestResult) {
  const messages: Record<RemoteCodexConnectionTestResult["code"], string> = {
    connected: "Conexão SSH confirmada.",
    invalidProfile: "O alias SSH selecionado é inválido.",
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
    codexAppServerUnavailable: "Esta versão do Codex não oferece o app-server.",
    codexUnauthenticated: "A conta do Codex ainda não está conectada.",
    invalidProfile: "O alias SSH selecionado é inválido.",
    timeout: "A verificação excedeu o tempo limite.",
    cancelled: "Verificação cancelada.",
    sshUnavailable: "O cliente SSH local não está disponível.",
    failed: "Não foi possível concluir a verificação.",
  }
  return messages[code]
}
