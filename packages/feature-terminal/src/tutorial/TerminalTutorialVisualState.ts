import { TERMINAL_TUTORIAL_STEPS } from "./steps"

export type TerminalTutorialVisualState =
  | "workspace"
  | "command-dialog"
  | "actions"
  | "rename-dialog"
  | "focus-select"
  | "split-dialog"
  | "agents"
  | "provider-picker"
  | "project-picker"
  | "folder-search"
  | "environment"
  | "actions-agents"
  | "history"
  | "history-detail"
  | "live-diff"
  | "live-diff-code"
  | "live-diff-picker"
  | "companions"
  | "pinned"
  | "remote"
  | "sync-review"
  | "sync-progress"
  | "remote-setup"

export type TerminalTutorialScene = "shell" | "agent" | "pinned" | "remote" | "remote-setup"

const TARGET_STATES: Readonly<Record<string, TerminalTutorialVisualState>> = {
  "terminal-dialog": "command-dialog",
  "terminal-actions": "actions",
  "tutorial-terminal-sidebar": "actions",
  "terminal-command-input": "rename-dialog",
  "terminal-focus-selection-prompt": "focus-select",
  "terminal-split-dialog": "split-dialog",
  "tutorial-terminal-agents": "agents",
  "tutorial-terminal-agent-pane": "agents",
  "terminal-dialog-agent-provider": "provider-picker",
  "tutorial-terminal-project-picker": "project-picker",
  "tutorial-terminal-folder-search": "folder-search",
  "terminal-dialog-project-environments": "environment",
  "terminal-agent-panel": "actions-agents",
  "tutorial-terminal-history": "history",
  "tutorial-terminal-history-detail": "history-detail",
  "tutorial-terminal-live-diff": "live-diff",
  "tutorial-terminal-live-diff-files": "live-diff",
  "tutorial-terminal-live-diff-code": "live-diff-code",
  "tutorial-terminal-live-diff-info": "live-diff",
  "live-diff-project-picker": "live-diff-picker",
  "tutorial-terminal-companions": "companions",
  "tutorial-terminal-pinned": "pinned",
  "tutorial-terminal-remote-agent": "remote",
  "tutorial-terminal-sync-tag": "remote",
  "terminal-project-sync-preview": "sync-review",
  "terminal-project-sync-progress": "sync-progress",
  "terminal-project-sync-automatic-control": "sync-progress",
  "tutorial-terminal-remote-setup": "remote-setup",
  "tutorial-terminal-finale": "live-diff",
}

const STATE_SCENES: Readonly<Record<TerminalTutorialVisualState, TerminalTutorialScene>> = {
  workspace: "shell",
  "command-dialog": "shell",
  actions: "shell",
  "rename-dialog": "shell",
  "focus-select": "shell",
  "split-dialog": "shell",
  agents: "agent",
  "provider-picker": "agent",
  "project-picker": "agent",
  "folder-search": "agent",
  environment: "agent",
  "actions-agents": "agent",
  history: "agent",
  "history-detail": "agent",
  "live-diff": "agent",
  "live-diff-code": "agent",
  "live-diff-picker": "agent",
  companions: "agent",
  pinned: "pinned",
  remote: "remote",
  "sync-review": "remote",
  "sync-progress": "remote",
  "remote-setup": "remote-setup",
}

const TOUR_TARGETS = new Set<string>(TERMINAL_TUTORIAL_STEPS.map((step) => step.targetId))

/** Another tool's tour leaves the kept-mounted Terminal tab untouched. */
export function isTerminalTutorialTarget(targetId: string | null) {
  return targetId === null || TOUR_TARGETS.has(targetId)
}

/** Each tour target opens the simulated view it explains; unknown targets show the basics. */
export function terminalTutorialVisualState(
  activeTargetId: string | null | undefined,
): TerminalTutorialVisualState {
  return activeTargetId && Object.hasOwn(TARGET_STATES, activeTargetId)
    ? (TARGET_STATES[activeTargetId] ?? "workspace")
    : "workspace"
}

export function terminalTutorialScene(state: TerminalTutorialVisualState): TerminalTutorialScene {
  return STATE_SCENES[state]
}
