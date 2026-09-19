import { useKeyboard, useRenderer } from "@opentui/react"
import { useState } from "react"
import { ownsKeyboardFocus } from "@xupon/tuiminal-core/keyboard/scope"
import { LAYOUT } from "@xupon/tuiminal-core/settings/theme"
import { GitNavigationHeader } from "./ui/GitNavigationHeader"
import { GitNavigationProvider, useGitHubNavigationIdentity } from "./ui/GitNavigationContext"
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
import { useGitBrowser } from "./ui/browser/useGitBrowser"

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
  tutorialTargetId = null,
  configurationRevision = 0,
  localConfigurationRevision = 0,
  onOpenLocalConfiguration,
}: {
  active: boolean
  tutorialMode?: boolean
  tutorialTargetId?: string | null
  configurationRevision?: number
  localConfigurationRevision?: number
  onOpenLocalConfiguration?: (() => void) | undefined
}) {
  if (tutorialMode) return <GitTutorialDemo activeTargetId={tutorialTargetId} />
  return (
    <GitNavigationProvider>
      <GitInteractiveWorkspace
        active={active}
        configurationRevision={configurationRevision}
        localConfigurationRevision={localConfigurationRevision}
        onOpenLocalConfiguration={onOpenLocalConfiguration}
      />
    </GitNavigationProvider>
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
  const browser = useGitBrowser()
  const workspaceActive = active && !browser.modalOpen
  const identity = useGitHubNavigationIdentity(activeTab, configurationRevision)

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
    if (!workspaceActive || key.ctrl || key.meta || key.super) return
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
    <box id="git-workspace" style={{ flexGrow: 1, backgroundColor: LAYOUT.workspaceBackground }}>
      <GitNavigationHeader
        localRoot={localTargetRoot}
        identity={identity}
        selected={activeTab}
        localMode={localMode}
        onSelect={selectTab}
        onToggleMode={() => {
          if (activeTab === "base") toggleLocalMode()
          else selectTab("base")
        }}
      />
      <box
        style={{
          height: activeTab === "base" && localMode === "diffs" ? "100%" : 0,
          flexGrow: activeTab === "base" && localMode === "diffs" ? 1 : 0,
          overflow: "hidden",
        }}
      >
        <GitBaseWorkspace
          active={workspaceActive && activeTab === "base" && localMode === "diffs"}
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
          active={workspaceActive && activeTab === "base" && localMode === "compare"}
          targetDirectory={localTargetRoot}
          onOpenLocalConfiguration={onOpenLocalConfiguration}
          onExit={() => setLocalMode("diffs")}
        />
      </MountedGitWorkspace>
      <MountedGitWorkspace mounted={pullRequestsMounted} selected={activeTab === "pr"}>
        <PullRequestsWorkspace
          active={workspaceActive && activeTab === "pr"}
          configurationRevision={configurationRevision}
          onOpenBrowser={browser.open}
          onLocalCheckout={() => setBaseRefreshRequest((current) => current + 1)}
        />
      </MountedGitWorkspace>
      <MountedGitWorkspace mounted={issuesMounted} selected={activeTab === "issues"}>
        <IssuesWorkspace
          active={workspaceActive && activeTab === "issues"}
          configurationRevision={configurationRevision}
          onOpenBrowser={browser.open}
          onLocalCheckout={() => setBaseRefreshRequest((current) => current + 1)}
        />
      </MountedGitWorkspace>
      <MountedGitWorkspace mounted={inboxMounted} selected={activeTab === "inbox"}>
        <InboxWorkspace
          active={workspaceActive && activeTab === "inbox"}
          configurationRevision={configurationRevision}
          onOpenBrowser={browser.open}
        />
      </MountedGitWorkspace>
      {browser.modal}
    </box>
  )
}
