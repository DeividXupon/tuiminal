import { translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { ModalSurface } from "@xupon/tuiminal-core/ui/ModalSurface"
import { isRunningAgent, type TerminalSession } from "../model/sessions"
import { AgentProjectEnvironmentDialog } from "../ui/AgentProjectEnvironmentDialog"
import { AgentProviderPicker } from "../ui/AgentProviderPicker"
import { LiveDiffProjectPicker } from "../ui/LiveDiffProjectPicker"
import { RemoteProjectSyncPreviewDialog } from "../ui/RemoteProjectSyncPreviewDialog"
import { RemoteProjectSyncProgressDialog } from "../ui/RemoteProjectSyncProgressDialog"
import { TerminalActions } from "../ui/TerminalActions"
import { TerminalDialog } from "../ui/TerminalDialog"
import { TerminalInlineButton, TerminalShortcutText } from "../ui/TerminalShortcut"
import { TerminalSplitDialog } from "../ui/TerminalSplitDialog"
import { tutorialLiveDiffProjects } from "./TerminalTutorialAgentFixtures"
import {
  TUTORIAL_PROFILES,
  TUTORIAL_SYNC_DESTINATION,
  tutorialResumeThreads,
  tutorialSyncReview,
} from "./TerminalTutorialFixtures"
import type { TerminalTutorialVisualState } from "./TerminalTutorialVisualState"

const noop = () => {}
const PROJECT_ROWS = [
  { group: "Projetos recentes", path: "~/projetos/lojinha" },
  { group: "Projetos recentes", path: "~/projetos/lojinha-admin" },
  { group: "Projetos Git encontrados", path: "~/projetos/blog-pessoal" },
  { group: "Projetos Git encontrados", path: "~/estudos/rust-cli" },
  { group: "Pasta inicial", path: "~/projetos" },
] as const
const FOLDER_SUGGESTIONS = ["lojinha", "lojinha-admin", "lojinha-sync"] as const

function projectName(path: string) {
  return path.split("/").at(-1) || path
}

/** Static copy of the agent project picker; the real one discovers Git projects. */
function TutorialProjectPicker({ width, height }: { width: number; height: number }) {
  const dialogWidth = Math.max(1, Math.min(90, width - 2))
  const contentWidth = Math.max(1, dialogWidth - 6)
  return (
    <ModalSurface
      id="tutorial-terminal-project-picker"
      dialogFocusable={false}
      width={dialogWidth}
      height={Math.max(1, Math.min(22, height - 2))}
      zIndex={810}
      borderColor={COLORS.terminal}
      onBackdropPress={noop}
      positionRelative
    >
      <text
        content={`${translateUi("Novo agente")} · Codex`}
        style={{ height: 1, flexShrink: 0, fg: COLORS.terminal }}
      />
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
        <TerminalInlineButton compact label="[E] Ambiente" onPress={noop} />
        <text content={translateUi("Local")} style={{ fg: COLORS.focus, flexGrow: 1 }} />
      </box>
      <box style={{ flexGrow: 1, minHeight: 0, overflow: "hidden" }}>
        {PROJECT_ROWS.map((row, index) => (
          <box key={row.path} style={{ flexShrink: 0 }}>
            {PROJECT_ROWS[index - 1]?.group !== row.group && (
              <text
                content={translateUi(row.group)}
                style={{ height: 1, flexShrink: 0, fg: COLORS.muted }}
              />
            )}
            <box
              style={{
                height: 2,
                flexShrink: 0,
                backgroundColor: index === 0 ? COLORS.panelRaised : COLORS.panel,
              }}
            >
              <text
                content={`${index === 0 ? "›" : " "} ${projectName(row.path)}`}
                wrapMode="none"
                style={{ fg: index === 0 ? COLORS.focus : COLORS.text }}
              />
              <text
                content={`  ${truncateDisplay(row.path, contentWidth)}`}
                wrapMode="none"
                style={{ fg: COLORS.muted }}
              />
            </box>
          </box>
        ))}
      </box>
      <text
        content={`${translateUi("Local")} · lojinha · ~/projetos/lojinha`}
        wrapMode="none"
        style={{ height: 1, flexShrink: 0, fg: COLORS.focus }}
      />
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
        <TerminalInlineButton compact label="[P] Procurar pasta" onPress={noop} />
        <TerminalInlineButton compact label="[Enter] Iniciar agente" onPress={noop} />
        <TerminalInlineButton compact label="[Esc] Voltar" onPress={noop} />
      </box>
    </ModalSurface>
  )
}

/** Static copy of the folder search; the real one lists directories as you type. */
function TutorialFolderSearch({ width, height }: { width: number; height: number }) {
  const dialogWidth = Math.max(1, Math.min(90, width - 2))
  return (
    <ModalSurface
      id="tutorial-terminal-folder-search"
      dialogFocusable={false}
      width={dialogWidth}
      height={Math.max(1, Math.min(14, height - 2))}
      zIndex={820}
      borderColor={COLORS.terminal}
      onBackdropPress={noop}
      positionRelative
    >
      <text
        content={`${translateUi("Procurar pasta")} · ${translateUi("Local")}`}
        wrapMode="none"
        style={{ height: 1, flexShrink: 0, fg: COLORS.terminal }}
      />
      <text
        content="~/projetos/lo█"
        wrapMode="none"
        style={{ height: 1, flexShrink: 0, fg: COLORS.text, bg: COLORS.panelRaised }}
      />
      <text
        content={translateUi("Sugestões de pastas")}
        style={{ height: 1, flexShrink: 0, fg: COLORS.muted }}
      />
      <box style={{ flexGrow: 1, minHeight: 0, overflow: "hidden" }}>
        {FOLDER_SUGGESTIONS.map((folder, index) => (
          <text
            key={folder}
            content={`${index === 0 ? "›" : " "} ${folder}/`}
            wrapMode="none"
            style={{
              height: 1,
              flexShrink: 0,
              fg: index === 0 ? COLORS.focus : COLORS.text,
              bg: index === 0 ? COLORS.panelRaised : COLORS.panel,
            }}
          />
        ))}
      </box>
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
        <TerminalShortcutText
          content={dialogWidth < 78 ? "[↑/↓] [Tab] completar" : "[↑/↓] sugestões · [Tab] completar"}
          wrapMode="none"
          style={{ height: 1, minWidth: 0, flexShrink: 1, fg: COLORS.muted }}
        />
        <TerminalInlineButton compact label="[Enter] Usar pasta" onPress={noop} />
        <TerminalInlineButton compact label="[Esc] Voltar" onPress={noop} />
      </box>
    </ModalSurface>
  )
}

/** Mounts the real dialog for the current step without focus or keyboard ownership. */
export function TerminalTutorialDialog({
  state,
  sessions,
  width,
  height,
  now,
}: {
  state: TerminalTutorialVisualState
  sessions: readonly TerminalSession[]
  width: number
  height: number
  now: number
}) {
  switch (state) {
    case "command-dialog":
      return (
        <TerminalDialog
          kind="command"
          initialValue="bun test --watch"
          inactive
          onSave={noop}
          onClose={noop}
        />
      )
    case "rename-dialog":
      return (
        <TerminalDialog
          kind="rename"
          initialValue="dev-server"
          inactive
          onSave={noop}
          onClose={noop}
        />
      )
    case "actions":
    case "actions-agents":
      return (
        <TerminalActions
          width={width}
          height={height}
          recentThreads={tutorialResumeThreads(now)}
          inactive
          initialPanel={state === "actions" ? "actions" : "agents"}
          onAction={noop}
          disabled={(key) => key === "r" || (state === "actions" && (key === "s" || key === "d"))}
        />
      )
    case "split-dialog":
      return (
        <TerminalSplitDialog
          down={false}
          agents={sessions.filter(isRunningAgent)}
          canCreateTerminal
          inactive
          onCreateTerminal={noop}
          onSelectAgent={noop}
          onClose={noop}
        />
      )
    case "provider-picker":
      return <AgentProviderPicker inactive onSelect={noop} onClose={noop} />
    case "project-picker":
      return <TutorialProjectPicker width={width} height={height} />
    case "folder-search":
      return <TutorialFolderSearch width={width} height={height} />
    case "environment":
      return (
        <AgentProjectEnvironmentDialog
          profiles={TUTORIAL_PROFILES}
          loading={false}
          error=""
          inactive
          onSelect={noop}
          onClose={noop}
        />
      )
    case "live-diff-picker":
      return (
        <LiveDiffProjectPicker
          projects={tutorialLiveDiffProjects()}
          loading={false}
          error=""
          inactive
          onSelect={noop}
          onClose={noop}
        />
      )
    case "sync-review":
      return (
        <RemoteProjectSyncPreviewDialog
          review={tutorialSyncReview()}
          automatic={false}
          inactive
          onToggleAutomatic={noop}
          onPage={noop}
          onConfirm={noop}
          onClose={noop}
        />
      )
    case "sync-progress":
      return (
        <RemoteProjectSyncProgressDialog
          localPath={TUTORIAL_SYNC_DESTINATION}
          status={{
            kind: "syncing",
            localPath: TUTORIAL_SYNC_DESTINATION,
            phase: "transferring",
            progress: 0.62,
          }}
          automatic
          inactive
          onToggleAutomatic={noop}
          onCancel={noop}
        />
      )
    default:
      return null
  }
}
