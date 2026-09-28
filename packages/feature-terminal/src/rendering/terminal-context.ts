import { displayWidth, translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import type { RemoteProjectSyncStatus } from "../model/remote-project-sync"
import type { TerminalRepositoryContext } from "../model/terminal-context"

export type TerminalContextTag = {
  kind: "directory" | "branch" | "state" | "sync"
  label: string
}

const MAX_DIRECTORY_WIDTH = 24
const MAX_BRANCH_WIDTH = 28

function cleanLabel(value: string) {
  return value.replace(/[\p{Cc}\p{Cf}]/gu, "").trim()
}

function tagWidth(tag: TerminalContextTag) {
  return displayWidth(tag.label) + 2
}

function fits(tags: readonly TerminalContextTag[], availableWidth: number) {
  return (
    tags.reduce((width, tag) => width + tagWidth(tag), Math.max(0, tags.length - 1)) <=
    availableWidth
  )
}

function stateLabel(context: TerminalRepositoryContext) {
  if (context.state === "clean") return translateUi("Limpo")
  if (context.state === "dirty") return translateUi("Alterado")
  if (context.state === "no-git") return translateUi("Sem Git")
  return null
}

function syncTooltip(sync: RemoteProjectSyncStatus | undefined) {
  if (!sync || sync.kind === "unmapped")
    return translateUi("Escolha uma pasta local para sincronizar o projeto remoto.")
  if (sync.kind === "checking") return translateUi("Verificando a cópia local e o projeto remoto.")
  if (sync.kind === "syncing") return translateUi("Copiando o projeto remoto para a pasta local.")
  if (sync.kind === "error") return translateUi(sync.message)
  if (sync.kind === "synced") return `${translateUi("Cópia local sincronizada:")} ${sync.localPath}`
  const origin =
    sync.difference === "both"
      ? "A cópia local e o projeto remoto mudaram."
      : sync.difference === "local"
        ? "A cópia local mudou desde a última sincronização."
        : "O projeto remoto mudou desde a última sincronização."
  return `${translateUi(origin)} ${sync.localPath}`
}

export function terminalContextTooltip(
  kind: TerminalContextTag["kind"],
  context?: TerminalRepositoryContext,
  sync?: RemoteProjectSyncStatus,
) {
  if (kind === "sync") return syncTooltip(sync)
  if (!context) return ""
  if (kind === "directory") return translateUi("Pasta do projeto atual.")
  if (kind === "branch") return translateUi("Branch Git atual.")
  if (context.state === "clean") return translateUi("Repositório Git sem alterações.")
  if (context.state === "dirty") return translateUi("Repositório Git com alterações.")
  return translateUi("A pasta atual não é um repositório Git.")
}

function syncTag(status: RemoteProjectSyncStatus | undefined, masterKey: string) {
  if (!status) return null
  if (status.kind === "synced") return { kind: "sync" as const, label: translateUi("Sincronizado") }
  if (status.kind === "checking")
    return { kind: "sync" as const, label: translateUi("Verificando sync…") }
  if (status.kind === "syncing")
    return { kind: "sync" as const, label: translateUi("Sincronizando…") }
  const label =
    status.kind === "unmapped"
      ? translateUi("Não sincronizado")
      : status.kind === "out-of-sync"
        ? translateUi("Desincronizado")
        : translateUi("Status indisponível")
  return { kind: "sync" as const, label: `${label} [${masterKey}] > [R]` }
}

/** Fits tags by importance: state, branch, then project directory. */
export function terminalContextTags(
  context: TerminalRepositoryContext | undefined,
  availableWidth: number,
  sync?: RemoteProjectSyncStatus,
  masterKey = "Ctrl+B",
): TerminalContextTag[] {
  const selected: TerminalContextTag[] = []
  const synchronization = syncTag(sync, masterKey)
  if (synchronization) {
    if (fits([synchronization], availableWidth)) selected.push(synchronization)
    else return []
  }
  const state = context ? stateLabel(context) : null
  if (state) {
    const tag = { kind: "state" as const, label: state }
    if (fits([tag, ...selected], availableWidth)) selected.unshift(tag)
  }
  if (context?.branch) {
    const tag = {
      kind: "branch" as const,
      label: truncateDisplay(cleanLabel(context.branch), MAX_BRANCH_WIDTH),
    }
    if (fits([tag, ...selected], availableWidth)) selected.unshift(tag)
  }
  const directory = context && {
    kind: "directory" as const,
    label: truncateDisplay(cleanLabel(context.projectName), MAX_DIRECTORY_WIDTH),
  }
  if (directory?.label && fits([directory, ...selected], availableWidth))
    selected.unshift(directory)
  return selected
}
