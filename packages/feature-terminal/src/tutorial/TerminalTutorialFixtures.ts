import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import type { TerminalRemoteCodexProfile } from "@xupon/tuiminal-core/settings/theme"
import type { AgentProviderId } from "../model/agent-provider"
import type { AgentResumeThread } from "../model/agent-resume-thread"
import type { AgentStatus } from "../model/agent-state"
import type { RemoteProjectSyncChange, RemoteProjectSyncReview } from "../model/remote-project-sync"
import {
  DEFAULT_FOLDER,
  DEFAULT_FOLDER_NAME,
  EXTERNAL_FOLDER,
  EXTERNAL_FOLDER_NAME,
  type IntegratedAgentLaunch,
  type TerminalFolder,
  type TerminalSession,
} from "../model/sessions"
import type { TerminalRepositoryContext } from "../model/terminal-context"
import { TUIMINAL_TMUX_FOLDER } from "../model/tmux"
import type { TerminalTutorialScene } from "./TerminalTutorialVisualState"

// Everything here is fictional: no path, alias or command is ever opened or executed.
export const TUTORIAL_PROJECT = "/home/dev/projetos/lojinha"
export const TUTORIAL_SYNC_DESTINATION = "/home/dev/projetos/lojinha-sync"
export const TUTORIAL_PROFILE: TerminalRemoteCodexProfile = {
  id: "vps-staging",
  name: "vps-staging",
  host: "vps-staging",
}
export const TUTORIAL_PROFILES: TerminalRemoteCodexProfile[] = [
  TUTORIAL_PROFILE,
  { id: "homelab", name: "homelab", host: "homelab" },
]

export const TUTORIAL_FOLDERS: TerminalFolder[] = [
  { id: DEFAULT_FOLDER, name: DEFAULT_FOLDER_NAME },
  { id: TUIMINAL_TMUX_FOLDER, name: "tmux" },
  { id: EXTERNAL_FOLDER, name: EXTERNAL_FOLDER_NAME },
]

export const TUTORIAL_SESSION_IDS = {
  dev: "tutorial-dev",
  lazygit: "tutorial-lazygit",
  codex: "tutorial-codex",
  remote: "tutorial-remote-codex",
  setup: "tutorial-remote-setup",
} as const

export function tutorialRepositoryContext(remote = false): TerminalRepositoryContext {
  return remote
    ? { directory: "/srv/lojinha", projectName: "lojinha", branch: "main", state: "dirty" }
    : { directory: TUTORIAL_PROJECT, projectName: "lojinha", branch: "feat/cupom", state: "dirty" }
}

function terminal(
  id: string,
  sectionId: string,
  title: string,
  fields: Partial<TerminalSession> = {},
): TerminalSession {
  return {
    id,
    sectionId,
    folderId: DEFAULT_FOLDER,
    row: 0,
    column: 0,
    title,
    status: "running",
    pid: null,
    exitCode: null,
    startedAt: 0,
    agent: null,
    kind: "shell",
    label: "Terminal",
    shortLabel: "TTY",
    displayCommand: title,
    command: [],
    accent: "",
    workingDirectory: TUTORIAL_PROJECT,
    backend: "tmux",
    ...fields,
  }
}

function agent(
  id: string,
  provider: AgentProviderId,
  state: AgentStatus["state"],
  taskTitle: string,
  remote = false,
): TerminalSession {
  const target = remote
    ? { remote: { profile: TUTORIAL_PROFILE, workingDirectory: "/srv/lojinha" } }
    : {}
  const launch: IntegratedAgentLaunch =
    provider === "claude"
      ? { providerId: provider, transport: "hooks", ...target }
      : { providerId: provider, transport: "app-server", ...target }
  const session = terminal(id, id, provider, {
    agent: {
      key: provider,
      label: provider,
      profile: provider,
      state,
      activity: state === "working" ? "writing" : null,
      taskTitle: translateUi(taskTitle),
    },
    agentIntegration: { providerId: provider, transport: launch.transport },
    agentLaunch: launch,
  })
  return remote ? { ...session, workingDirectory: "/srv/lojinha", backend: "native" } : session
}

export function tutorialSessions(scene: TerminalTutorialScene): TerminalSession[] {
  const terminals = [
    terminal("tutorial-zsh", "s1", "zsh"),
    terminal(TUTORIAL_SESSION_IDS.dev, "s2", "bun", {
      kind: "custom",
      displayCommand: "bun run dev",
      busy: true,
    }),
    terminal(TUTORIAL_SESSION_IDS.lazygit, "s2", "lazygit", { column: 1, busy: true }),
    terminal("tutorial-test", "s3", "bun test", {
      kind: "custom",
      displayCommand: "bun test",
      status: "exited",
      exitCode: 0,
    }),
    terminal("tutorial-nvim", "s4", "nvim", {
      folderId: TUIMINAL_TMUX_FOLDER,
      workingDirectory: "/home/dev/dotfiles",
      tmux: { socket: "default", sessionId: "$1", name: "dotfiles", paneId: "%3" },
    }),
    terminal("tutorial-htop", "s5", "htop", {
      folderId: EXTERNAL_FOLDER,
      backend: "external",
      external: { terminalId: "kitty" },
      workingDirectory: "/home/dev",
    }),
  ]
  if (scene === "shell") return terminals
  return [
    ...terminals,
    agent(TUTORIAL_SESSION_IDS.codex, "codex", "working", "Corrigir cálculo do frete"),
    agent("tutorial-claude", "claude", "blocked", "Adicionar cupom de desconto"),
    agent("tutorial-opencode", "opencode", "done", "Revisar testes do carrinho"),
    agent(TUTORIAL_SESSION_IDS.remote, "codex", "working", "Ajustar deploy do worker", true),
  ]
}

export function tutorialSetupSession(): TerminalSession {
  return terminal(TUTORIAL_SESSION_IDS.setup, "s9", "ssh", {
    displayCommand: "ssh vps-staging",
    remoteSetup: { profile: TUTORIAL_PROFILE },
  })
}

export function tutorialResumeThreads(now: number): AgentResumeThread[] {
  const thread = (
    id: string,
    providerId: AgentProviderId,
    title: string,
    preview: string,
    lastResponse: string,
    minutes: number,
    state: AgentResumeThread["state"],
    remote = false,
  ): AgentResumeThread => ({
    id,
    providerId,
    title: translateUi(title),
    preview: translateUi(preview),
    lastResponse: translateUi(lastResponse),
    cwd: remote ? "/srv/lojinha" : TUTORIAL_PROJECT,
    projectName: "lojinha",
    gitBranch: remote ? "main" : "feat/cupom",
    updatedAt: now - minutes * 60_000,
    state,
    ...(remote
      ? {
          remoteProfileId: TUTORIAL_PROFILE.id,
          remoteProfileName: TUTORIAL_PROFILE.name,
          remoteProfileHost: TUTORIAL_PROFILE.host,
        }
      : {}),
  })
  return [
    thread(
      "tutorial-thread-frete",
      "codex",
      "Corrigir cálculo do frete",
      "o frete está cobrando centavos a mais em pedidos grandes",
      "Arredondei o valor para centavos e liberei frete grátis acima de R$ 199. Os 14 testes passaram.",
      2,
      "working",
    ),
    thread(
      "tutorial-thread-cupom",
      "claude",
      "Adicionar cupom de desconto",
      "cria o cupom PRIMEIRACOMPRA com 10% de desconto",
      "Preciso da sua aprovação para rodar a migração no banco de testes.",
      9,
      "blocked",
    ),
    thread(
      "tutorial-thread-worker",
      "codex",
      "Ajustar deploy do worker",
      "o worker de e-mails reinicia sem parar no servidor",
      "Faltava a variável SMTP_HOST no serviço. Ajustei o arquivo de exemplo; falta só reiniciar.",
      27,
      "idle",
      true,
    ),
    thread(
      "tutorial-thread-testes",
      "opencode",
      "Revisar testes do carrinho",
      "revisa os testes do carrinho e aponta o que falta cobrir",
      "Faltam testes para carrinho vazio e cupom expirado. Deixei os casos esboçados.",
      64,
      "idle",
    ),
  ]
}

export function tutorialSyncReview(): RemoteProjectSyncReview {
  const change = (
    path: string,
    action: RemoteProjectSyncChange["action"],
    localChanged = false,
  ): RemoteProjectSyncChange => ({
    path,
    action,
    localChanged,
    remoteChanged: true,
    transferBytes: action === "delete" ? 0 : 2_048,
  })
  const changes = [
    change("README.md", "update", true),
    change("src/cupom/aplicar.ts", "add"),
    change("src/cupom/cupom.test.ts", "add"),
    change("migrations/007_cupons.sql", "add"),
    change("src/frete/calcular.ts", "update"),
    change("tests/frete.test.ts", "update"),
    change("package.json", "update"),
    change("bun.lock", "update"),
    change(".env.example", "update"),
    change("docs/promo-antiga.md", "delete"),
  ]
  return {
    jobId: "tutorial-sync",
    localPath: TUTORIAL_SYNC_DESTINATION,
    changeCount: changes.length,
    counts: { add: 3, update: 5, delete: 1, conflict: 1 },
    hasLocalChanges: true,
    legacyLocalChanges: false,
    difference: "both",
    indicator: { changeCount: changes.length, difference: "both" },
    offset: 0,
    pageSize: 6,
    changes: changes.slice(0, 6),
  }
}
