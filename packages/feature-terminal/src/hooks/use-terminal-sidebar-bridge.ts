import { useEffect, useRef, type RefObject } from "react"
import { useNotifications } from "@xupon/tuiminal-core/notifications/index"
import type { AgentProviderId } from "../model/agent-provider"
import type { AgentResumeThread } from "../model/agent-resume-thread"
import type { TerminalFocusTargetKey } from "../model/focus-selection"
import {
  clearTerminalSidebar,
  publishTerminalSidebar,
  terminalSidebarSnapshot,
} from "../model/pinned-sidebar"
import type { TerminalSession, TerminalFolder } from "../model/sessions"
import type { TmuxPaneInfo } from "../model/tmux"
import { tmuxAgentNotice } from "../rendering/tmux-agent-notice"
import { discoverTmuxWorkspace } from "../services/tmux-agents"
import { createTmuxMirrorCommand } from "../services/tmux-mirror-command"
import type { useTerminalSessions } from "./use-terminal-sessions"

type Options = Pick<ReturnType<typeof useTerminalSessions>, "sessions" | "launchCommand"> & {
  sidebarView: Parameters<typeof publishTerminalSidebar>[1]
  requestedTargetRevision: number
  focusBox: (target: TerminalFocusTargetKey) => void
  runActionRef: RefObject<(key: string) => void>
  loadMoreThreads: (providerId: AgentProviderId) => Promise<void>
  recentThreads: AgentResumeThread[]
  resumeAgentThreadRef: RefObject<(thread: AgentResumeThread) => void>
  folders: TerminalFolder[]
  setSelectedFolder: (id: string) => void
  toggleFolder: (id: string) => void
  sidebarSessions: TerminalSession[]
  selectSession: (id: string) => void
  sequence: RefObject<number>
  folderForTmuxPane: (pane: TmuxPaneInfo) => string
}

type SidebarTarget = NonNullable<ReturnType<typeof terminalSidebarSnapshot>["requestedTarget"]>
type SidebarAction = Extract<
  SidebarTarget,
  | { focusTarget: TerminalFocusTargetKey }
  | { action: string }
  | { loadMoreResumeProvider: AgentProviderId }
  | { resumeThreadId: string }
>

function dispatchSidebarAction(
  target: SidebarTarget,
  options: Options,
  handled: () => void,
): target is SidebarAction {
  const { focusBox, runActionRef, loadMoreThreads, recentThreads, resumeAgentThreadRef } = options
  if ("focusTarget" in target) {
    handled()
    focusBox(target.focusTarget)
    return true
  }
  if ("action" in target) {
    handled()
    runActionRef.current(target.action)
    return true
  }
  if ("loadMoreResumeProvider" in target) {
    handled()
    void loadMoreThreads(target.loadMoreResumeProvider)
    return true
  }
  if ("resumeThreadId" in target) {
    handled()
    const thread = recentThreads.find(
      (candidate) =>
        candidate.id === target.resumeThreadId &&
        (candidate.providerId ?? "codex") === (target.providerId ?? "codex") &&
        candidate.remoteProfileId === target.remoteProfileId,
    )
    if (thread) resumeAgentThreadRef.current(thread)
    return true
  }
  return false
}

export function useTerminalSidebarBridge(options: Options) {
  const {
    sidebarView,
    requestedTargetRevision,
    folders,
    setSelectedFolder,
    toggleFolder,
    sidebarSessions,
    selectSession,
    sessions,
    sequence,
    launchCommand,
    folderForTmuxPane,
  } = options

  const actionOptions = useRef(options)
  actionOptions.current = options
  const { notify } = useNotifications()
  const sidebarOwner = useRef({})
  const handledTargetRevision = useRef(0)
  useEffect(() => {
    publishTerminalSidebar(sidebarOwner.current, sidebarView)
  }, [sidebarView])
  useEffect(() => () => clearTerminalSidebar(sidebarOwner.current), [])

  useEffect(() => {
    const target = terminalSidebarSnapshot().requestedTarget
    if (!target || handledTargetRevision.current === requestedTargetRevision) return
    if (
      dispatchSidebarAction(target, actionOptions.current, () => {
        handledTargetRevision.current = requestedTargetRevision
      })
    )
      return
    if ("folderId" in target) {
      if (folders.some((candidate) => candidate.id === target.folderId)) {
        handledTargetRevision.current = requestedTargetRevision
        setSelectedFolder(target.folderId)
        toggleFolder(target.folderId)
      }
      return
    }
    if ("sessionId" in target) {
      if (sidebarSessions.some((candidate) => candidate.id === target.sessionId)) {
        handledTargetRevision.current = requestedTargetRevision
        selectSession(target.sessionId)
      }
      return
    }
    const session = sessions.find(
      (candidate) =>
        candidate.tmux?.socket === target.socket && candidate.tmux.paneId === target.paneId,
    )
    if (session) {
      handledTargetRevision.current = requestedTargetRevision
      selectSession(session.id)
      return
    }
    const controller = new AbortController()
    const open = async () => {
      const result = await discoverTmuxWorkspace(controller.signal)
      const found = result.panes.find(
        ({ pane }) => pane.socket === target.socket && pane.paneId === target.paneId,
      )
      if (!found || controller.signal.aborted) return
      handledTargetRevision.current = requestedTargetRevision
      const notice = tmuxAgentNotice(found.agent)
      if (notice) notify(notice)
      sequence.current += 1
      launchCommand(createTmuxMirrorCommand(found.pane, found.agent?.label, false), {
        sectionId: `pinned-tmux-${sequence.current}`,
        folderId: folderForTmuxPane(found.pane),
        row: 0,
        column: 0,
      })
    }
    void open().catch(() => undefined)
    return () => controller.abort()
  }, [
    requestedTargetRevision,
    folders,
    sequence,
    setSelectedFolder,
    sessions,
    sidebarSessions,
    selectSession,
    launchCommand,
    folderForTmuxPane,
    notify,
    toggleFolder,
  ])
}
