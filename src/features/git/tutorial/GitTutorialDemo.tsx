import { useTerminalDimensions } from "@opentui/react"
import { COLORS, focusedPanelBorder, LAYOUT, panelBorder } from "../../../core/settings/theme"
import { translateUi, truncateDisplay } from "../../../shared/i18n"
import { InlineButton } from "../../../shared/ui/InlineButton"
import { ShortcutText } from "../../../shared/ui/ShortcutText"
import { FILES_PANEL_WIDTH } from "../rendering/constants"
import { gitCommandConsoleHeight } from "../ui/base/GitCommandConsole"
import { GitTutorialCompareView } from "./GitTutorialCompareView"
import { TutorialDiffPanel } from "./GitTutorialDiffView"
import { GitTutorialProjectModal } from "./GitTutorialProjectModal"
import { TutorialGitLogView, TutorialLogActions } from "./GitTutorialLogView"
import {
  TutorialGitGraphView,
  TutorialGraphActions,
  TutorialPartialStageView,
} from "./GitTutorialStateViews"
import { gitTutorialVisualState, isCompareTutorialState } from "./GitTutorialVisualState"

const FILES = [
  { status: " M", path: "README.md", color: COLORS.warning },
  { status: "M ", path: "src/git/tutorial/steps.ts", color: COLORS.success },
  { status: "??", path: "src/git/tutorial/overview.ts", color: COLORS.warning },
] as const

const COMMITS = [
  ["●", "ac0d327", "DX", "keyboard workflows"],
  ["│●", "91c2f06", "BA", "guided terminal"],
  ["●│", "36d8ab1", "DX", "local Git workspace"],
] as const

function TutorialGitTabs({ compare, onPress }: { compare: boolean; onPress: () => void }) {
  return (
    <box
      id="tutorial-git-mode-tabs"
      style={{
        height: 1,
        flexShrink: 0,
        flexDirection: "row",
        backgroundColor: COLORS.panel,
        paddingLeft: LAYOUT.outerPadding,
      }}
    >
      <box
        id={compare ? "tutorial-git-compare-tab" : "tutorial-git-diffs-tab"}
        style={{ height: 1, flexShrink: 0, flexDirection: "row" }}
      >
        <InlineButton label="[1]" accent={COLORS.git} active onPress={onPress} />
        <InlineButton
          {...(compare ? { id: "tutorial-git-compare-return" } : {})}
          label={translateUi(compare ? "[C] GIT · COMPARAR" : "[C] GIT · DIFFS")}
          accent={COLORS.git}
          active
          onPress={onPress}
        />
      </box>
      <InlineButton label={translateUi("[2] PR")} accent={COLORS.git} onPress={onPress} />
      <InlineButton label={translateUi("[3] ISSUES")} accent={COLORS.git} onPress={onPress} />
      <InlineButton label={translateUi("[4] INBOX")} accent={COLORS.git} onPress={onPress} />
    </box>
  )
}

function TutorialRepositoryHeader({
  configurationOpen,
  onPress,
}: {
  configurationOpen: boolean
  onPress: () => void
}) {
  return (
    <box
      id="tutorial-git-repository"
      style={{
        ...panelBorder(),
        height: LAYOUT.compact ? 1 : 3,
        flexShrink: 0,
        flexDirection: "row",
        justifyContent: "space-between",
        backgroundColor: COLORS.panel,
        paddingLeft: 1,
        paddingRight: 1,
      }}
    >
      <box style={{ flexGrow: 1, flexDirection: "row", overflow: "hidden" }}>
        <text content="◆ tuiminal  /  development  " style={{ fg: COLORS.git }} />
        <InlineButton
          {...(configurationOpen ? {} : { id: "tutorial-git-local-configuration" })}
          label={translateUi("[Ctrl+P] Alterar projeto/branch")}
          accent={COLORS.git}
          active={configurationOpen}
          onPress={onPress}
        />
      </box>
      <text content="3 ALT  ●1 ○2  ↑0 ↓0" style={{ fg: COLORS.muted }} />
    </box>
  )
}

function TutorialFilesPanel({
  width,
  contentWidth,
  graphOpen,
  onPress,
}: {
  width: number
  contentWidth: number
  graphOpen: boolean
  onPress: () => void
}) {
  return (
    <box
      id="tutorial-git-files"
      style={{
        ...focusedPanelBorder(true, COLORS.git),
        width,
        flexGrow: 0,
        backgroundColor: COLORS.panel,
        paddingLeft: 1,
        paddingRight: 1,
      }}
    >
      <text content={`${translateUi("ARQUIVOS")} 3  ●1 ○2`} style={{ fg: COLORS.git }} />
      <box style={{ flexGrow: 1, overflow: "hidden" }}>
        <text content="▾ src/" style={{ fg: COLORS.graphAccent }} />
        <text content="  ▾ features/" style={{ fg: COLORS.graphAccent }} />
        {FILES.map((file, index) => (
          <text
            key={file.path}
            content={truncateDisplay(
              `${index === 0 ? "▶ " : "  "}${file.status} ${file.path}`,
              contentWidth,
            )}
            style={{
              fg: index === 0 ? COLORS.git : file.color,
              bg: index === 0 ? COLORS.panelRaised : COLORS.panel,
            }}
          />
        ))}
      </box>
      <box
        id="tutorial-git-mini-graph"
        style={{
          ...panelBorder(),
          height: LAYOUT.compact ? 5 : 7,
          flexShrink: 0,
          backgroundColor: COLORS.canvas,
          paddingLeft: 1,
          paddingRight: 1,
        }}
      >
        <box
          style={{
            height: 1,
            flexShrink: 0,
            flexDirection: "row",
            justifyContent: "space-between",
          }}
        >
          <text content={translateUi("ÁRVORE GIT")} style={{ fg: COLORS.database }} />
          <InlineButton
            {...(graphOpen ? {} : { id: "tutorial-git-open-graph" })}
            label={translateUi("[G] Abrir")}
            accent={COLORS.database}
            active={graphOpen}
            onPress={onPress}
          />
        </box>
        {COMMITS.map(([graph, hash, author, subject], index) => (
          <text
            key={hash}
            content={truncateDisplay(
              `${graph.padEnd(3)} ${author} ${hash} ${subject}`,
              contentWidth,
            )}
            style={{ fg: index === 0 ? COLORS.text : COLORS.muted }}
          />
        ))}
      </box>
    </box>
  )
}

function TutorialActions({ onPress }: { onPress: () => void }) {
  return (
    <box
      id="tutorial-git-actions"
      style={{
        height: 1,
        flexShrink: 0,
        flexDirection: "row",
        backgroundColor: COLORS.panelRaised,
      }}
    >
      <InlineButton
        id="tutorial-git-stage-toggle"
        label={translateUi("[␠] Stage")}
        accent={COLORS.git}
        onPress={onPress}
      />
      <InlineButton
        id="tutorial-git-partial-stage"
        label={translateUi("[S] Stage parcial")}
        accent={COLORS.git}
        onPress={onPress}
      />
      <InlineButton label={translateUi("[A] Todos")} accent={COLORS.git} onPress={onPress} />
      <InlineButton
        id="tutorial-git-discard"
        label={translateUi("[D] Descartar")}
        accent={COLORS.danger}
        onPress={onPress}
      />
      <InlineButton label={translateUi("[G] Árvore")} accent={COLORS.database} onPress={onPress} />
      <InlineButton
        id="tutorial-git-open-log"
        label={translateUi("[O] Log")}
        accent={COLORS.git}
        onPress={onPress}
      />
    </box>
  )
}

function TutorialTerminal({ onPress }: { onPress: () => void }) {
  return (
    <box
      id="tutorial-git-terminal"
      style={{
        ...panelBorder(),
        height: gitCommandConsoleHeight(LAYOUT.compact),
        flexShrink: 0,
        backgroundColor: COLORS.panel,
        paddingLeft: 1,
        paddingRight: 1,
      }}
    >
      <box
        style={{
          height: 1,
          flexShrink: 0,
          flexDirection: "row",
          justifyContent: "space-between",
        }}
      >
        <text content={translateUi("TERMINAL GIT")} style={{ fg: COLORS.git }} />
        <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
          <InlineButton
            label={translateUi("[F10] Maximizar")}
            accent={COLORS.git}
            onPress={onPress}
          />
          <InlineButton label={translateUi("[T] Focar")} accent={COLORS.git} onPress={onPress} />
        </box>
      </box>
      <box style={{ flexGrow: 1, overflow: "hidden" }}>
        <text content="❯ git status --short" style={{ fg: COLORS.git }} />
        <text content=" M README.md" style={{ fg: COLORS.warning }} />
        <text content="M  src/features/git/tutorial/steps.ts" style={{ fg: COLORS.success }} />
      </box>
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
        <text content="git " style={{ fg: COLORS.git }} />
        <text content="status --short" style={{ fg: COLORS.text }} />
      </box>
    </box>
  )
}

export function GitTutorialDemo({ activeTargetId = null }: { activeTargetId?: string | null }) {
  const terminal = useTerminalDimensions()
  const noop = () => {}
  const visualState = gitTutorialVisualState(activeTargetId)
  const compare = isCompareTutorialState(visualState)
  const filesPanelWidth = Math.min(FILES_PANEL_WIDTH, Math.max(24, terminal.width - 24))
  const filesContentWidth = Math.max(12, filesPanelWidth - (LAYOUT.compact ? 2 : 4))
  return (
    <box style={{ position: "relative", flexGrow: 1, backgroundColor: COLORS.canvas }}>
      <TutorialGitTabs compare={compare} onPress={noop} />
      {compare ? (
        <GitTutorialCompareView state={visualState} onPress={noop} />
      ) : (
        <box
          style={{
            position: "relative",
            flexGrow: 1,
            backgroundColor: COLORS.canvas,
            padding: LAYOUT.outerPadding,
            gap: LAYOUT.gap,
          }}
        >
          <TutorialRepositoryHeader
            configurationOpen={visualState === "configuration"}
            onPress={noop}
          />
          <box
            style={{
              flexGrow: 1,
              flexShrink: 1,
              flexDirection: "row",
              gap: LAYOUT.gap,
              overflow: "hidden",
            }}
          >
            <TutorialFilesPanel
              width={filesPanelWidth}
              contentWidth={filesContentWidth}
              graphOpen={visualState === "graph"}
              onPress={noop}
            />
            <box
              id="tutorial-git-preview-panel"
              style={{
                flexGrow: 1,
                flexShrink: 1,
                overflow: "hidden",
                ...focusedPanelBorder(false, COLORS.git),
                backgroundColor: LAYOUT.alternatePanel,
                paddingLeft: 1,
                paddingRight: 1,
              }}
            >
              {visualState === "partial-stage" ? (
                <TutorialPartialStageView onPress={noop} />
              ) : (
                <>
                  {visualState === "graph" ? (
                    <>
                      <TutorialGitGraphView
                        width={Math.max(24, terminal.width - filesPanelWidth - 6)}
                      />
                      <TutorialGraphActions onPress={noop} />
                    </>
                  ) : visualState === "log" ? (
                    <>
                      <TutorialGitLogView
                        width={Math.max(24, terminal.width - filesPanelWidth - 6)}
                        onPress={noop}
                      />
                      <TutorialLogActions onPress={noop} />
                    </>
                  ) : (
                    <>
                      <TutorialDiffPanel layoutDemo={visualState === "split"} onPress={noop} />
                      <TutorialActions onPress={noop} />
                    </>
                  )}
                  <TutorialTerminal onPress={noop} />
                </>
              )}
            </box>
          </box>
          <box
            id="tutorial-git-shortcuts"
            style={{
              width: "100%",
              height: 1,
              flexShrink: 0,
              overflow: "hidden",
              backgroundColor: COLORS.panelRaised,
              zIndex: 30,
            }}
          >
            <ShortcutText
              id="tutorial-git-navigation"
              content={translateUi(
                "[Tab/H/L/←/→] Árvore/diff/terminal  [T] Terminal  [V] Visualização  [O] Log  [R] Atualizar",
              )}
              style={{ width: "100%", height: 1, flexShrink: 0, fg: COLORS.muted }}
            />
          </box>
        </box>
      )}
      {!compare && visualState === "configuration" ? (
        <GitTutorialProjectModal onPress={noop} />
      ) : null}
    </box>
  )
}
