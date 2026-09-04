import { useKeyboard, useRenderer } from "@opentui/react"
import { useState } from "react"
import { COLORS, LAYOUT } from "../../core/settings/theme"
import { InlineButton } from "../../shared/ui/InlineButton"
import { GitBaseWorkspace } from "./GitWorkspace"
import {
  DEFAULT_GIT_WORKSPACE_TAB,
  type GitWorkspaceTab,
  gitWorkspaceTabForKey,
} from "./model/workspace"
import { PullRequestsWorkspace } from "./PullRequestsWorkspace"
import { GitTutorialDemo } from "./tutorial/GitTutorialDemo"

export function GitViewer({
  active,
  tutorialMode = false,
}: {
  active: boolean
  tutorialMode?: boolean
}) {
  if (tutorialMode) return <GitTutorialDemo />
  return <GitInteractiveWorkspace active={active} />
}

function GitInteractiveWorkspace({ active }: { active: boolean }) {
  const renderer = useRenderer()
  const [activeTab, setActiveTab] = useState<GitWorkspaceTab>(DEFAULT_GIT_WORKSPACE_TAB)
  const [pullRequestsMounted, setPullRequestsMounted] = useState(false)
  const [baseRefreshRequest, setBaseRefreshRequest] = useState(0)

  const selectTab = (tab: GitWorkspaceTab) => {
    if (tab === "pr") setPullRequestsMounted(true)
    setActiveTab(tab)
  }

  useKeyboard((key) => {
    if (!active || key.ctrl || key.meta || key.super) return
    const focusedId = renderer.currentFocusedRenderable?.id ?? ""
    if (/git-pr-.*(?:input|modal|menu)/.test(focusedId)) return
    const tab = gitWorkspaceTabForKey(key.name)
    if (!tab) return
    key.preventDefault()
    key.stopPropagation()
    selectTab(tab)
  })

  return (
    <box style={{ flexGrow: 1, backgroundColor: COLORS.canvas }}>
      <box
        style={{
          height: 1,
          flexShrink: 0,
          flexDirection: "row",
          backgroundColor: COLORS.panel,
          paddingLeft: LAYOUT.outerPadding,
        }}
      >
        <InlineButton
          id="git-tab-base"
          label="[1] GIT · BASE LOCAL"
          accent={COLORS.git}
          active={activeTab === "base"}
          onPress={() => selectTab("base")}
        />
        <InlineButton
          id="git-tab-pr"
          label="[2] PR"
          accent={COLORS.git}
          active={activeTab === "pr"}
          onPress={() => selectTab("pr")}
        />
      </box>
      <box
        style={{
          height: activeTab === "base" ? "100%" : 0,
          flexGrow: activeTab === "base" ? 1 : 0,
          overflow: "hidden",
        }}
      >
        <GitBaseWorkspace
          active={active && activeTab === "base"}
          refreshRequest={baseRefreshRequest}
        />
      </box>
      {pullRequestsMounted ? (
        <box
          style={{
            height: activeTab === "pr" ? "100%" : 0,
            flexGrow: activeTab === "pr" ? 1 : 0,
            overflow: "hidden",
          }}
        >
          <PullRequestsWorkspace
            active={active && activeTab === "pr"}
            onLocalCheckout={() => setBaseRefreshRequest((current) => current + 1)}
          />
        </box>
      ) : null}
    </box>
  )
}
