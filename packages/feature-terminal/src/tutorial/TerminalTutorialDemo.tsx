import type { BoxRenderable } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/react"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { COLORS, LAYOUT } from "@xupon/tuiminal-core/settings/theme"
import { useMemo, useState } from "react"
import type { TerminalFocusTargetKey } from "../model/focus-selection"
import type { RemoteProjectSyncStatus } from "../model/remote-project-sync"
import { TerminalFocusSelection } from "../ui/TerminalFocusSelection"
import { TerminalShortcutAnimation } from "../ui/TerminalShortcut"
import { TerminalTutorialDialog } from "./TerminalTutorialDialogs"
import {
  TUTORIAL_SESSION_IDS,
  TUTORIAL_SYNC_DESTINATION,
  tutorialSessions,
  tutorialSetupSession,
} from "./TerminalTutorialFixtures"
import {
  TutorialHistory,
  TutorialLiveDiff,
  TutorialPane,
  TutorialSetupGuide,
  tutorialLiveDiffWidth,
  tutorialOutput,
} from "./TerminalTutorialPanes"
import { TerminalTutorialSidebar } from "./TerminalTutorialSidebar"
import {
  type TerminalTutorialVisualState,
  terminalTutorialScene,
  terminalTutorialVisualState,
} from "./TerminalTutorialVisualState"

const noop = () => {}
const HISTORY_STATES = new Set<TerminalTutorialVisualState>([
  "history",
  "history-detail",
  "companions",
])
const LIVE_DIFF_STATES = new Set<TerminalTutorialVisualState>([
  "live-diff",
  "live-diff-code",
  "live-diff-picker",
  "companions",
])

function FocusChoice({ target, selected }: { target: TerminalFocusTargetKey; selected: boolean }) {
  return <TerminalFocusSelection target={target} selected={selected} onFocus={noop} />
}

function ShellScene({ width, focusSelect }: { width: number; focusSelect: boolean }) {
  const leftWidth = Math.max(1, Math.floor((width - 1) / 2))
  return (
    <box id="tutorial-terminal-split" style={{ flexGrow: 1, flexDirection: "row", minWidth: 1 }}>
      <TutorialPane
        id="tutorial-terminal-pane"
        metadataId="tutorial-terminal-metadata"
        sessionId={TUTORIAL_SESSION_IDS.dev}
        width={leftWidth}
        lines={tutorialOutput("dev")}
      >
        {focusSelect && <FocusChoice target={`terminal:${TUTORIAL_SESSION_IDS.dev}`} selected />}
      </TutorialPane>
      <box style={{ width: 1, flexShrink: 0, border: ["left"], borderColor: COLORS.terminal }} />
      <TutorialPane
        sessionId={TUTORIAL_SESSION_IDS.lazygit}
        width={Math.max(1, width - leftWidth - 1)}
        lines={tutorialOutput("lazygit")}
      >
        {focusSelect && (
          <FocusChoice target={`terminal:${TUTORIAL_SESSION_IDS.lazygit}`} selected={false} />
        )}
      </TutorialPane>
    </box>
  )
}

function AgentScene({
  state,
  width,
  height,
  now,
}: {
  state: TerminalTutorialVisualState
  width: number
  height: number
  now: number
}) {
  const liveDiff = LIVE_DIFF_STATES.has(state)
  const history = HISTORY_STATES.has(state)
  const diffWidth = liveDiff ? tutorialLiveDiffWidth(width) : 0
  const sessionId = TUTORIAL_SESSION_IDS.codex
  return (
    <box
      id={state === "companions" ? "tutorial-terminal-companions" : "tutorial-terminal-agent-pane"}
      style={{ flexGrow: 1, flexDirection: "row", minWidth: 1 }}
    >
      <TutorialPane
        sessionId={sessionId}
        width={Math.max(1, width - diffWidth)}
        lines={tutorialOutput("codex")}
        origin="local"
      >
        {history && (
          <TutorialHistory
            id={
              state === "history-detail"
                ? "tutorial-terminal-history-detail"
                : "tutorial-terminal-history"
            }
            sessionId={sessionId}
            now={now}
            {...(state === "history-detail" ? { detail: "overview" as const } : {})}
          />
        )}
      </TutorialPane>
      {liveDiff && (
        <TutorialLiveDiff
          id="tutorial-terminal-live-diff"
          sessionId={sessionId}
          width={diffWidth}
          height={height}
          now={now}
          codeFocused={state === "live-diff-code"}
        />
      )}
    </box>
  )
}

function remoteSyncStatus(state: TerminalTutorialVisualState): RemoteProjectSyncStatus {
  if (state === "sync-progress")
    return {
      kind: "syncing",
      localPath: TUTORIAL_SYNC_DESTINATION,
      phase: "transferring",
      progress: 0.62,
    }
  if (state === "sync-review")
    return { kind: "out-of-sync", localPath: TUTORIAL_SYNC_DESTINATION, difference: "both" }
  return { kind: "unmapped" }
}

/** Another tool behind the pinned sidebar, reduced to a recognizable sketch. */
function PinnedToolSketch() {
  const files = [
    [" M", "src/frete/calcular.ts", COLORS.warning],
    ["??", "src/cupom/aplicar.ts", COLORS.danger],
    [" M", "tests/carrinho.test.ts", COLORS.warning],
  ] as const
  return (
    <box
      style={{
        flexGrow: 1,
        minWidth: 1,
        paddingLeft: 1,
        paddingRight: 1,
        border: ["left"],
        borderColor: COLORS.border,
        backgroundColor: LAYOUT.workspaceBackground,
      }}
    >
      <text content="◆ Git · lojinha / feat/cupom" wrapMode="none" style={{ fg: COLORS.git }} />
      <text
        content={translateUi("Você trocou para o Git, mas a lateral fixada continua aqui.")}
        style={{ fg: COLORS.muted }}
      />
      <text content=" " />
      {files.map(([status, path, color]) => (
        <text key={path} content={`${status} ${path}`} wrapMode="none" style={{ fg: color }} />
      ))}
    </box>
  )
}

/**
 * Simulated Free Terminal used by the guided tour. It paints over the live
 * workspace without replacing it, so real PTYs keep running and keep their size.
 */
export function TerminalTutorialDemo({
  activeTargetId = null,
}: {
  activeTargetId?: string | null
}) {
  const terminal = useTerminalDimensions()
  const [size, setSize] = useState({
    width: terminal.width,
    height: Math.max(1, terminal.height - 1),
  })
  const [now] = useState(() => Date.now())
  const state = terminalTutorialVisualState(activeTargetId)
  const scene = terminalTutorialScene(state)
  const sessions = useMemo(() => {
    const listed = tutorialSessions(scene === "shell" ? "shell" : "agent")
    return scene === "remote-setup" ? [...listed, tutorialSetupSession()] : listed
  }, [scene])
  const activeSessionId =
    scene === "shell"
      ? TUTORIAL_SESSION_IDS.dev
      : scene === "remote"
        ? TUTORIAL_SESSION_IDS.remote
        : scene === "remote-setup"
          ? TUTORIAL_SESSION_IDS.setup
          : TUTORIAL_SESSION_IDS.codex
  const sidebarWidth = Math.max(16, Math.min(32, Math.floor(size.width * 0.22)))
  const paneWidth = Math.max(1, size.width - sidebarWidth)
  const focusSelect = state === "focus-select"
  const sidebar = (
    <box style={{ flexShrink: 0, position: "relative" }}>
      <TerminalTutorialSidebar
        sessions={sessions}
        activeSessionId={activeSessionId}
        width={sidebarWidth}
        height={size.height}
        masterKeyActive={state === "actions" || state === "actions-agents"}
        borderRight={scene !== "pinned"}
        {...(scene === "pinned" ? { id: "tutorial-terminal-pinned-sidebar" } : {})}
      />
      {focusSelect && <FocusChoice target="sidebar:terminal" selected={false} />}
    </box>
  )
  return (
    <TerminalShortcutAnimation active>
      <box
        id="tutorial-terminal-workspace"
        onSizeChange={function (this: BoxRenderable) {
          const next = { width: this.width, height: this.height }
          setSize((current) =>
            current.width === next.width && current.height === next.height ? current : next,
          )
        }}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          zIndex: 900,
          backgroundColor: COLORS.canvas,
        }}
      >
        <box id="tutorial-terminal-finale" style={{ flexGrow: 1, flexDirection: "row" }}>
          {scene === "pinned" ? (
            <box id="tutorial-terminal-pinned" style={{ flexGrow: 1, flexDirection: "row" }}>
              {sidebar}
              <PinnedToolSketch />
            </box>
          ) : (
            <>
              {sidebar}
              {scene === "shell" && <ShellScene width={paneWidth} focusSelect={focusSelect} />}
              {scene === "agent" && (
                <AgentScene state={state} width={paneWidth} height={size.height} now={now} />
              )}
              {scene === "remote" && (
                <TutorialPane
                  id="tutorial-terminal-remote-agent"
                  metadataId="tutorial-terminal-sync-tag"
                  sessionId={TUTORIAL_SESSION_IDS.remote}
                  width={paneWidth}
                  lines={tutorialOutput("remote")}
                  origin="remote"
                  remote
                  sync={remoteSyncStatus(state)}
                />
              )}
              {scene === "remote-setup" && (
                <TutorialPane
                  sessionId={TUTORIAL_SESSION_IDS.setup}
                  width={paneWidth}
                  lines={tutorialOutput("setup")}
                  plain
                >
                  <TutorialSetupGuide width={paneWidth} />
                </TutorialPane>
              )}
            </>
          )}
        </box>
        <TerminalTutorialDialog
          state={state}
          sessions={sessions}
          width={size.width}
          height={size.height}
          now={now}
        />
      </box>
    </TerminalShortcutAnimation>
  )
}
