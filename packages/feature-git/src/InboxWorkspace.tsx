import { useTerminalDimensions } from "@opentui/react"
import { useNotificationFromValue } from "@xupon/tuiminal-core/notifications/index"
import { useEffect, useMemo, useRef, useState } from "react"
import { DEMO_INBOX_NOTIFICATIONS } from "./model/inbox/fixtures"
import { inboxItemsForSection } from "./model/inbox/notifications"
import { type InboxPaletteId, inboxPaletteActions } from "./model/inbox/palette"
import { INBOX_SECTIONS } from "./model/inbox/types"
import { gitTabForPaletteId } from "./model/remote-palette"
import type { GitWorkspaceTab } from "./model/workspace"
import { LOADING_FRAMES } from "./rendering/constants"
import { loadInboxSavedIds } from "./storage/inbox/state"
import { defaultGitBrowserOpener, type GitBrowserOpener } from "./ui/browser/useGitBrowser"
import { InboxActionModal } from "./ui/inbox/InboxActionModal"
import { InboxDashboardView, inboxDashboardError } from "./ui/inbox/InboxDashboardView"
import { useInboxActions } from "./ui/inbox/useInboxActions"
import { useInboxDashboard } from "./ui/inbox/useInboxDashboard"
import { useInboxWorkspaceKeyboard } from "./ui/inbox/useInboxWorkspaceKeyboard"
import { useInboxConversation } from "./ui/inbox/useInboxConversation"
import { usePreviewPagination } from "./ui/shared/usePreviewPagination"
import { useGitRemoteActionPalette } from "./ui/shared/useGitRemoteActionPalette"
import { useAutoPagination } from "./ui/useAutoPagination"

export function InboxWorkspace({
  active,
  configurationRevision = 0,
  onOpenBrowser = defaultGitBrowserOpener,
  onSelectTab,
}: {
  active: boolean
  configurationRevision?: number
  onOpenBrowser?: GitBrowserOpener
  onSelectTab?: ((tab: GitWorkspaceTab) => void) | undefined
}) {
  const terminal = useTerminalDimensions()
  const { state, refresh, loadMore, loadingMore, refreshing, backgroundError, updateItems } =
    useInboxDashboard(active, configurationRevision)
  const [sectionIndex, setSectionIndex] = useState(0)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [focus, setFocus] = useState<"list" | "preview">("list")
  const previewScrollRef = useRef<ScrollBoxRenderable | null>(null)
  const [savedIds, setSavedIds] = useState(() => loadInboxSavedIds())
  const [loadingFrameIndex, setLoadingFrameIndex] = useState(0)
  const section = INBOX_SECTIONS[sectionIndex] ?? INBOX_SECTIONS[0]
  const sourceItems =
    state.status === "demo" ? DEMO_INBOX_NOTIFICATIONS : state.status === "ready" ? state.items : []
  const items = useMemo(
    () => inboxItemsForSection(sourceItems, section?.id ?? "inbox", savedIds),
    [savedIds, section?.id, sourceItems],
  )
  const selected = items[Math.min(selectedIndex, Math.max(0, items.length - 1))] ?? null
  const actions = useInboxActions({
    state,
    selected,
    savedIds,
    setSavedIds,
    updateItems,
    onOpenBrowser,
  })
  const wide = terminal.width >= 92 && terminal.height >= 20
  const conversation = useInboxConversation({
    active:
      active &&
      (wide || focus === "preview") &&
      (state.status === "ready" || state.status === "demo"),
    notification: selected,
    host: state.status === "ready" ? state.host : "github.com",
    demo: state.status === "demo",
    revision: configurationRevision,
    scroll: previewScrollRef,
  })

  useNotificationFromValue(actions.notice, { source: "Git · Inbox" })
  useNotificationFromValue(inboxDashboardError(state), { source: "Git · Inbox", kind: "error" })
  useNotificationFromValue(backgroundError, { source: "Git · Inbox", kind: "error" })

  useEffect(() => {
    if (!loadingMore) return
    const timer = setInterval(
      () => setLoadingFrameIndex((current) => (current + 1) % LOADING_FRAMES.length),
      100,
    )
    return () => clearInterval(timer)
  }, [loadingMore])

  useEffect(() => {
    setSelectedIndex((current) => Math.min(current, Math.max(0, items.length - 1)))
  }, [items.length])

  useAutoPagination({
    selectedIndex,
    itemCount: items.length,
    hasNextPage: state.status === "ready" && state.hasNextPage,
    loading: loadingMore,
    onLoadMore: () => void loadMore(),
  })
  const move = (delta: -1 | 1) =>
    setSelectedIndex((current) =>
      Math.max(0, Math.min(Math.max(0, items.length - 1), current + delta)),
    )
  const moveSection = (delta: -1 | 1) => {
    setSectionIndex((current) => (current + delta + INBOX_SECTIONS.length) % INBOX_SECTIONS.length)
    setSelectedIndex(0)
  }
  const handlers: Record<Exclude<InboxPaletteId, `tab-${string}` | "choose-box">, () => void> = {
    list: () => setFocus("list"),
    preview: () => setFocus("preview"),
    refresh: () => {
      void refresh()
      void conversation.reload()
    },
    open: () => void actions.open(),
    read: () => void actions.markRead(),
    save: actions.toggleSaved,
    done: () => selected && actions.requestAction("done"),
    unsubscribe: () => selected && actions.requestAction("unsubscribe"),
    "comment-react": () => conversation.commentAction("reaction"),
    "comment-reply": () => conversation.commentAction("reply"),
    "conversation-overview": () => {
      conversation.changeTab("overview")
      setFocus("preview")
    },
    "conversation-activity": () => {
      conversation.changeTab("activity")
      setFocus("preview")
    },
  }
  const palette = useGitRemoteActionPalette<InboxPaletteId>({
    active: active && !actions.pendingAction && !conversation.modalOpen,
    title: "AÇÕES DO GIT · INBOX",
    buildActions: () =>
      inboxPaletteActions({
        focus,
        selected: selected ? { unread: selected.unread, saved: savedIds.has(selected.id) } : null,
        navigation: Boolean(onSelectTab),
        conversation: conversation.available,
        activityComment: conversation.tab === "activity" && Boolean(conversation.selectedComment),
      }),
    onRun: (id) => {
      const tab = gitTabForPaletteId(id)
      if (tab) onSelectTab?.(tab)
      else handlers[id as keyof typeof handlers]()
    },
    boxes: {
      ids: { list: "git-inbox-list-panel", preview: "git-inbox-preview-panel" },
      current: focus,
      onFocus: setFocus,
    },
  })
  usePreviewPagination({
    scroll: previewScrollRef,
    pageKey: conversation.pageKey,
    enabled:
      active &&
      focus === "preview" &&
      conversation.tab === "activity" &&
      !palette.open &&
      !actions.pendingAction &&
      !conversation.modalOpen,
    loading: conversation.loadingMore,
    selectedIndex: conversation.selectedIndex,
    itemCount: conversation.itemCount,
    onLoadMore: () => void conversation.loadMore(),
  })
  useInboxWorkspaceKeyboard({
    active,
    focus,
    blocked:
      palette.open ||
      conversation.modalOpen ||
      Boolean(actions.pendingAction) ||
      state.status === "requirements" ||
      state.status === "authentication",
    itemCount: items.length,
    onMove: move,
    onScroll: (delta) => previewScrollRef.current?.scrollBy(delta),
    onPreviewKey: conversation.handleKey,
    onFocus: setFocus,
    onSection: moveSection,
    onRefresh: handlers.refresh,
    onOpen: handlers.open,
    onRead: handlers.read,
    onSave: handlers.save,
    onDone: handlers.done,
    onUnsubscribe: handlers.unsubscribe,
    onOpenPalette: palette.openPalette,
  })

  const listWidth = wide ? Math.max(42, Math.floor(terminal.width * 0.52)) : terminal.width
  return (
    <>
      <InboxDashboardView
        active={active}
        state={state}
        refreshing={refreshing}
        onOpenActions={palette.openPalette}
        sections={INBOX_SECTIONS}
        sectionCounts={INBOX_SECTIONS.map(
          (candidate) => inboxItemsForSection(sourceItems, candidate.id, savedIds).length,
        )}
        sectionIndex={sectionIndex}
        onSelectSection={(index) => {
          setSectionIndex(index)
          setSelectedIndex(0)
        }}
        readyProps={{
          items,
          selected,
          selectedIndex,
          focus,
          wide,
          listWidth,
          savedIds,
          loadingMore,
          loadingFrame: LOADING_FRAMES[loadingFrameIndex] ?? "◷",
          onSelect: setSelectedIndex,
          onFocusList: () => setFocus("list"),
          onFocusPreview: () => setFocus("preview"),
          previewScrollRef,
          conversation,
          onOpen: () => void actions.open(),
          onRead: () => void actions.markRead(),
          onDone: () => actions.requestAction("done"),
          onSave: actions.toggleSaved,
          onUnsubscribe: () => actions.requestAction("unsubscribe"),
          boxOverlay: palette.boxOverlay,
        }}
        onRetry={() => void refresh()}
      />
      {palette.palette}
      {palette.boxFocusNode}
      {conversation.issueActions.modals}
      {conversation.prActions.modals}
      {actions.pendingAction && selected ? (
        <InboxActionModal
          action={actions.pendingAction}
          item={selected}
          busy={actions.busy}
          onClose={actions.closeAction}
          onConfirm={() => void actions.confirm()}
        />
      ) : null}
    </>
  )
}
import type { ScrollBoxRenderable } from "@opentui/core"
