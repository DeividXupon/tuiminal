import { useTerminalDimensions } from "@opentui/react"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { COLORS, LAYOUT, focusedPanelBorder } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { GitNavigationHeader } from "../ui/GitNavigationHeader"
import { GitTutorialRemoteDialog, isRemoteTutorialDialog } from "./GitTutorialRemoteDialog"
import { GitTutorialRemotePreview } from "./GitTutorialRemotePreview"
import type { GitRemoteTutorialStep } from "./remote-steps"

const noop = () => {}
const SECTIONS = {
  pr: ["My PRs", "Review requested", "All", "Open", "Closed"],
  issues: ["My Issues", "All", "Open", "Closed"],
  inbox: ["Inbox", "Review", "Assigned", "Mentioned", "Saved"],
} as const
const TITLES = { pr: "PULL REQUESTS", issues: "ISSUES", inbox: "GITHUB INBOX" } as const

function remoteTutorialPlacement(tab: GitRemoteTutorialStep["tab"], width: number, height: number) {
  if (tab === "inbox") return width >= 92 && height >= 20 ? "side" : "single"
  if (width >= 118 && height >= 22) return "side"
  return width >= 76 && height >= 20 ? "stacked" : "single"
}

function TutorialRemoteList({ step, focused }: { step: GitRemoteTutorialStep; focused: boolean }) {
  const inbox = step.tab === "inbox"
  const mark = step.view === "save" ? "★" : step.view === "list" && inbox ? "○" : "●"
  const items =
    step.tab === "issues"
      ? ["#318 Keyboard focus", "#204 Improve contrast", "#196 Search history"]
      : ["#142 Fix cache invalidation", "#87 Adjust navigation", "#65 Update tests"]
  return (
    <box
      id={step.view === "list" || step.view === "save" ? step.targetId : "git-tutorial-remote-list"}
      style={{
        flexGrow: 1,
        minHeight: 0,
        overflow: "hidden",
        ...focusedPanelBorder(focused, COLORS.git),
        paddingX: 1,
      }}
    >
      {(step.view === "save" ? items.slice(0, 1) : items).map((title, index) => (
        <box
          key={title}
          style={{
            height: 3,
            flexShrink: 0,
            backgroundColor: index === 0 ? COLORS.panelRaised : COLORS.panel,
          }}
        >
          <text
            content={`${index === 0 ? "▶" : " "} ${index === 0 ? mark : "○"} demo/tuiminal ${title}`}
            style={{
              height: 1,
              wrapMode: "none",
              truncate: true,
              fg: index === 0 ? COLORS.git : COLORS.text,
            }}
          />
          <text
            content={`  @${step.tab === "issues" ? "demo" : index === 0 ? "alex" : "sam"} · ${translateUi("ABERTO")} · ${step.tab === "pr" ? "✓ CI · +32/−11" : "→ @demo · bug"}`}
            style={{ height: 1, truncate: true, fg: COLORS.muted }}
          />
        </box>
      ))}
    </box>
  )
}

export function GitTutorialRemoteView({ step }: { step: GitRemoteTutorialStep }) {
  const terminal = useTerminalDimensions()
  const placement = remoteTutorialPlacement(step.tab, terminal.width, terminal.height)
  const wide = placement === "side"
  const stacked = placement === "stacked"
  const both = placement !== "single"
  const sectionIndex = step.tab === "pr" ? 1 : step.view === "save" ? 4 : 0
  const preview = ["overview", "checks", "activity", "commits", "files"].includes(step.view)
  const query = step.tab === "pr" ? "is:open review-requested:@me" : "is:open author:@me"
  return (
    <box
      id="git-tutorial-workspace"
      style={{ position: "relative", flexGrow: 1, backgroundColor: LAYOUT.workspaceBackground }}
    >
      <box
        id={step.view === "tab" ? step.targetId : "git-tutorial-remote-navigation"}
        style={{ flexShrink: 0 }}
      >
        <GitNavigationHeader
          localRoot="/demo/tuiminal"
          identity={{ host: "github.com", viewerLogin: "demo" }}
          selected={step.tab}
          localMode="diffs"
          onSelect={noop}
          onToggleMode={noop}
        />
      </box>
      <box
        style={{
          flexGrow: 1,
          minHeight: 0,
          paddingX: LAYOUT.outerPadding,
          backgroundColor: COLORS.panel,
        }}
      >
        <box style={{ height: 1, flexShrink: 0, border: ["bottom"], borderColor: COLORS.border }} />
        <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
          <text content={translateUi(TITLES[step.tab])} style={{ fg: COLORS.git }} />
          <InlineButton label="[?] Ações" accent={COLORS.git} onPress={noop} />
        </box>
        <box
          id={step.view === "sections" ? step.targetId : "git-tutorial-remote-sections"}
          style={{ flexDirection: "row", flexWrap: "wrap", flexShrink: 0 }}
        >
          <InlineButton label="[A←]" accent={COLORS.git} onPress={noop} />
          {SECTIONS[step.tab].map((name, index) => (
            <InlineButton
              key={name}
              label={`${name} ${index === sectionIndex && step.view !== "save" ? 3 : 1}`}
              active={index === sectionIndex}
              accent={COLORS.git}
              onPress={noop}
            />
          ))}
          <InlineButton label="[F→]" accent={COLORS.git} onPress={noop} />
        </box>
        {step.tab !== "inbox" && (
          <box style={{ flexShrink: 0, flexDirection: "row", flexWrap: "wrap" }}>
            <InlineButton label="[/]" accent={COLORS.git} onPress={noop} />
            <text content={`${query} · demo/tuiminal`} style={{ fg: COLORS.muted }} />
            <InlineButton
              label={step.tab === "pr" ? "[Ctrl+N] Criar PR" : "[Ctrl+N] Criar issue"}
              accent={COLORS.git}
              onPress={noop}
            />
          </box>
        )}
        <box
          style={{
            flexGrow: 1,
            minHeight: 0,
            flexDirection: stacked ? "column" : "row",
            gap: LAYOUT.gap,
          }}
        >
          {(both || !preview) && (
            <box
              style={{
                width: wide ? "45%" : "100%",
                ...(stacked ? { height: "40%" as const } : {}),
                minHeight: 0,
              }}
            >
              <TutorialRemoteList step={step} focused={!preview} />
            </box>
          )}
          {(both || preview) && <GitTutorialRemotePreview step={step} targeted={preview} />}
        </box>
      </box>
      {isRemoteTutorialDialog(step.view) && <GitTutorialRemoteDialog step={step} />}
    </box>
  )
}
