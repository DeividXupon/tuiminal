import { useKeyboard, useRenderer } from "@opentui/react"
import { useState } from "react"
import { ownsKeyboardFocus } from "../../core/keyboard/scope"
import { COLORS, LAYOUT } from "../../core/settings/theme"
import { translateUi } from "../../shared/i18n"
import { InlineButton } from "../../shared/ui/InlineButton"
import { GitCompareWorkspace } from "./GitCompareWorkspace"
import { GitBaseWorkspace } from "./GitWorkspace"
import { useLocalGitTargetRoot } from "./hooks/use-local-git-target-root"
import { InboxWorkspace } from "./InboxWorkspace"
import { IssuesWorkspace } from "./IssuesWorkspace"
import { gitKeyboardScope } from "./keyboard"
import {
  DEFAULT_GIT_WORKSPACE_TAB,
  type GitWorkspaceTab,
  gitWorkspaceTabForKey,
} from "./model/workspace"
import { PullRequestsWorkspace } from "./PullRequestsWorkspace"
import { GitTutorialDemo } from "./tutorial/GitTutorialDemo"

type GitLocalMode = "diffs" | "compare"

function MountedGitWorkspace({
  mounted,
  selected,
  children,
}: {
  mounted: boolean
  selected: boolean
  children: React.ReactNode
}) {
  if (!mounted) return null
  return (
    <box
      style={{
        height: selected ? "100%" : 0,
        flexGrow: selected ? 1 : 0,
        overflow: "hidden",
      }}
    >
      {children}
    </box>
  )
}

export function GitViewer({
  active,
  tutorialMode = false,
  configurationRevision = 0,
  localConfigurationRevision = 0,
  onOpenLocalConfiguration,
}: {
  active: boolean
  tutorialMode?: boolean
  configurationRevision?: number
  localConfigurationRevision?: number
  onOpenLocalConfiguration?: (() => void) | undefined
}) {
  if (tutorialMode) return <GitTutorialDemo />
  return (
    <GitInteractiveWorkspace
      active={active}
      configurationRevision={configurationRevision}
      localConfigurationRevision={localConfigurationRevision}
      onOpenLocalConfiguration={onOpenLocalConfiguration}
    />
  )
}

function GitInteractiveWorkspace({
  active,
  configurationRevision,
  localConfigurationRevision,
  onOpenLocalConfiguration,
}: {
  active: boolean
  configurationRevision: number
  localConfigurationRevision: number
  onOpenLocalConfiguration?: (() => void) | undefined
}) {
  const renderer = useRenderer()
  const [activeTab, setActiveTab] = useState<GitWorkspaceTab>(DEFAULT_GIT_WORKSPACE_TAB)
  const [pullRequestsMounted, setPullRequestsMounted] = useState(false)
  const [issuesMounted, setIssuesMounted] = useState(false)
  const [inboxMounted, setInboxMounted] = useState(false)
  const [compareMounted, setCompareMounted] = useState(false)
  const [localMode, setLocalMode] = useState<GitLocalMode>("diffs")
  const [baseRefreshRequest, setBaseRefreshRequest] = useState(0)
  const localTargetRoot = useLocalGitTargetRoot(localConfigurationRevision)

  const selectTab = (tab: GitWorkspaceTab) => {
    if (tab === "pr") setPullRequestsMounted(true)
    if (tab === "issues") setIssuesMounted(true)
    if (tab === "inbox") setInboxMounted(true)
    setActiveTab(tab)
  }

  const toggleLocalMode = () => {
    setCompareMounted(true)
    setLocalMode((current) => (current === "diffs" ? "compare" : "diffs"))
  }

  useKeyboard((key) => {
    if (!active || key.ctrl || key.meta || key.super) return
    const focusedId = renderer.currentFocusedRenderable?.id ?? ""
    if (ownsKeyboardFocus(gitKeyboardScope, focusedId)) return
    if (activeTab === "base" && localMode === "diffs" && key.name === "c") {
      key.preventDefault()
      key.stopPropagation()
      toggleLocalMode()
      return
    }
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
          label="[1]"
          accent={COLORS.git}
          active={activeTab === "base"}
          onPress={() => selectTab("base")}
        />
        <InlineButton
          id="git-mode-compare"
          label={translateUi(localMode === "diffs" ? "[C] GIT · DIFFS" : "[C] GIT · COMPARAR")}
          accent={COLORS.git}
          active={activeTab === "base"}
          onPress={() => {
            if (activeTab === "base") toggleLocalMode()
            else selectTab("base")
          }}
        />
        <InlineButton
          id="git-tab-pr"
          label={translateUi("[2] PR")}
          accent={COLORS.git}
          active={activeTab === "pr"}
          onPress={() => selectTab("pr")}
        />
        <InlineButton
          id="git-tab-issues"
          label={translateUi("[3] ISSUES")}
          accent={COLORS.git}
          active={activeTab === "issues"}
          onPress={() => selectTab("issues")}
        />
        <InlineButton
          id="git-tab-inbox"
          label={translateUi("[4] INBOX")}
          accent={COLORS.git}
          active={activeTab === "inbox"}
          onPress={() => selectTab("inbox")}
        />
      </box>
      <box
        style={{
          height: activeTab === "base" && localMode === "diffs" ? "100%" : 0,
          flexGrow: activeTab === "base" && localMode === "diffs" ? 1 : 0,
          overflow: "hidden",
        }}
      >
        <GitBaseWorkspace
          active={active && activeTab === "base" && localMode === "diffs"}
          refreshRequest={baseRefreshRequest}
          targetDirectory={localTargetRoot}
          onOpenLocalConfiguration={onOpenLocalConfiguration}
        />
      </box>
      <MountedGitWorkspace
        mounted={compareMounted}
        selected={activeTab === "base" && localMode === "compare"}
      >
        <GitCompareWorkspace
          active={active && activeTab === "base" && localMode === "compare"}
          targetDirectory={localTargetRoot}
          onOpenLocalConfiguration={onOpenLocalConfiguration}
          onExit={() => setLocalMode("diffs")}
        />
      </MountedGitWorkspace>
      <MountedGitWorkspace mounted={pullRequestsMounted} selected={activeTab === "pr"}>
        <PullRequestsWorkspace
          active={active && activeTab === "pr"}
          configurationRevision={configurationRevision}
          onLocalCheckout={() => setBaseRefreshRequest((current) => current + 1)}
        />
      </MountedGitWorkspace>
      <MountedGitWorkspace mounted={issuesMounted} selected={activeTab === "issues"}>
        <IssuesWorkspace
          active={active && activeTab === "issues"}
          configurationRevision={configurationRevision}
          onLocalCheckout={() => setBaseRefreshRequest((current) => current + 1)}
        />
      </MountedGitWorkspace>
      <MountedGitWorkspace mounted={inboxMounted} selected={activeTab === "inbox"}>
        <InboxWorkspace
          active={active && activeTab === "inbox"}
          configurationRevision={configurationRevision}
        />
      </MountedGitWorkspace>
    </box>
  )
}
