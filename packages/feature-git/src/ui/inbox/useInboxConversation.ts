import type { ScrollBoxRenderable } from "@opentui/core"
import { useNotificationFromValue } from "@xupon/tuiminal-core/notifications/index"
import { type RefObject, useEffect, useMemo, useRef, useState } from "react"
import {
  type InboxConversation,
  type InboxConversationTarget,
  matchingInboxConversation,
  inboxConversationEntries,
  inboxConversationPageKey,
} from "../../model/inbox/conversation"
import { inboxConversationKeyAction } from "../../model/inbox/conversation-navigation"
import { demoInboxConversation } from "../../model/inbox/conversation-fixtures"
import { inboxSubject } from "../../model/inbox/subject"
import type { InboxNotification } from "../../model/inbox/types"
import { issueCommentThread } from "../../model/issue/activity"
import type { IssuePreviewTab } from "../../model/issue/types"
import { pullRequestActivity } from "../../model/pr/activity"
import { InboxConversationSession } from "../../services/inbox-conversation-session"
import { useIssueActions } from "../issue/useIssueActions"
import { usePullRequestActions } from "../pr/usePullRequestActions"
import { useActivitySelection } from "../shared/useActivitySelection"
import { useGitRemoteDetails } from "../shared/useGitRemoteDetails"

const noop = () => undefined

export function useInboxConversation({
  active,
  notification,
  host,
  demo,
  revision,
  scroll,
}: {
  active: boolean
  notification: InboxNotification | null
  host: string
  demo: boolean
  revision: number
  scroll: RefObject<ScrollBoxRenderable | null>
}) {
  const target = useMemo(() => {
    const subject = notification && inboxSubject(notification, host)
    return subject && notification
      ? { notification, subject: { ...subject, key: `${subject.key}:${revision}` } }
      : null
  }, [notification, host, revision])
  const remote = useGitRemoteDetails<InboxConversationTarget, InboxConversation, []>({
    active,
    item: target,
    demo,
    demoDetails: demoInboxConversation,
    itemKey: (value) => value.subject.key,
    createSession: () => {
      const executable = process.env.TUIMINAL_GH_EXECUTABLE?.trim()
      return new InboxConversationSession(executable ? { executable } : {})
    },
  })
  const [tab, setTab] = useState<IssuePreviewTab>("overview")
  const [selectedIndex, select] = useState(0)
  const [expanded, setExpanded] = useState(false)
  const [notice, setNotice] = useState("")
  const identity = target
    ? `${host}/${target.subject.owner}/${target.subject.repository}/${target.subject.number}:${revision}`
    : undefined
  useEffect(() => {
    if (identity === undefined) return
    select(0)
    setExpanded(false)
    scroll.current?.scrollTo(0)
  }, [identity, scroll])
  const candidate = remote.state.status === "ready" ? remote.state.details : null
  const data = matchingInboxConversation(candidate, target)
  const sharedActions = {
    demo,
    profileRoot: null,
    onNotice: setNotice,
    onRefresh: () => void remote.reload(),
    onLocalCheckout: noop,
  }
  const issueActions = useIssueActions({
    ...sharedActions,
    item: data?.kind === "issue" ? data.item : null,
    details: data?.kind === "issue" ? data.details : null,
    auth: data?.kind === "issue" ? data.auth : null,
  })
  const prActions = usePullRequestActions({
    ...sharedActions,
    workflows: [],
    item: data?.kind === "pr" ? data.item : null,
    details: data?.kind === "pr" ? data.details : null,
    auth: data?.kind === "pr" ? data.auth : null,
  })
  useNotificationFromValue(notice, { source: "Git · Inbox" })
  const modalOpen = issueActions.modalOpen || prActions.modalOpen
  const entries = inboxConversationEntries(data)
  const index = Math.min(selectedIndex, Math.max(0, entries.length - 1))
  const selectedComment = entries[index]?.comment ?? null
  const commentAction = (kind: "reaction" | "reply") => {
    if (!data || tab !== "activity") return
    if (data.kind === "issue") {
      const comment = issueCommentThread(data.details.comments, data.details.identity)[index]
        ?.comment
      if (comment) issueActions.openCommentAction(kind, comment)
    } else {
      const comment = pullRequestActivity(data.details)[index]?.comment
      if (comment) prActions.openCommentAction(kind, comment)
    }
  }
  useActivitySelection(
    scroll,
    data && tab === "activity" ? `git-inbox-activity-${index}` : null,
    identity,
  )
  const refresh = useRef(remote.refreshQuietly)
  refresh.current = remote.refreshQuietly
  useEffect(() => {
    if (!active || demo) return
    const timer = setInterval(() => void refresh.current(), 30_000)
    return () => clearInterval(timer)
  }, [active, demo])
  const changeTab = (next: IssuePreviewTab) => {
    setTab(next)
    scroll.current?.scrollTo(0)
  }
  const handleKey = (key: Parameters<typeof inboxConversationKeyAction>[0]) => {
    if (!target) return false
    const action = inboxConversationKeyAction(key, tab)
    if (!action) return false
    if (action.type === "tab") changeTab(tab === "overview" ? "activity" : "overview")
    else if (action.type === "move")
      select(Math.max(0, Math.min(entries.length - 1, index + action.delta)))
    else if (action.type === "expand") setExpanded((current) => !current)
    else commentAction(action.type)
    return true
  }
  return {
    available: Boolean(target),
    data,
    state: remote.state,
    tab,
    changeTab,
    expanded,
    toggleExpanded: () => setExpanded((current) => !current),
    selectedIndex: index,
    select,
    selectedComment,
    handleKey,
    commentAction,
    modalOpen,
    issueActions,
    prActions,
    reload: remote.reload,
    loadingMore: remote.loadingMore,
    pageKey: inboxConversationPageKey(data, identity),
    itemCount: entries.length,
    loadMore: remote.loadMore,
  }
}

export type InboxConversationController = ReturnType<typeof useInboxConversation>
