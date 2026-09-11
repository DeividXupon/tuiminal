import { useTerminalDimensions } from "@opentui/react"
import { useEffect, useMemo, useState } from "react"
import { useNotificationFromValue } from "../../shared/notifications"
import { DEMO_INBOX_NOTIFICATIONS } from "./model/inbox/fixtures"
import { inboxItemsForSection } from "./model/inbox/notifications"
import { INBOX_SECTIONS } from "./model/inbox/types"
import { LOADING_FRAMES } from "./rendering/constants"
import { loadInboxSavedIds } from "./storage/inbox/state"
import { InboxActionModal } from "./ui/inbox/InboxActionModal"
import { InboxDashboardView, inboxDashboardError } from "./ui/inbox/InboxDashboardView"
import { useInboxActions } from "./ui/inbox/useInboxActions"
import { useInboxDashboard } from "./ui/inbox/useInboxDashboard"
import { useInboxWorkspaceKeyboard } from "./ui/inbox/useInboxWorkspaceKeyboard"
import { useAutoPagination } from "./ui/useAutoPagination"

export function InboxWorkspace({
  active,
  configurationRevision = 0,
}: {
  active: boolean
  configurationRevision?: number
}) {
  const terminal = useTerminalDimensions()
  const { state, refresh, loadMore, loadingMore, refreshing, backgroundError, updateItems } =
    useInboxDashboard(active, configurationRevision)
  const [sectionIndex, setSectionIndex] = useState(0)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [focus, setFocus] = useState<"list" | "preview">("list")
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
  const actions = useInboxActions({ state, selected, savedIds, setSavedIds, updateItems })
  const wide = terminal.width >= 92 && terminal.height >= 20

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
  useInboxWorkspaceKeyboard({
    active,
    blocked:
      Boolean(actions.pendingAction) ||
      state.status === "requirements" ||
      state.status === "authentication",
    itemCount: items.length,
    onMove: (delta) =>
      setSelectedIndex((current) =>
        Math.max(0, Math.min(Math.max(0, items.length - 1), current + delta)),
      ),
    onFocus: setFocus,
    onSection: (delta) => {
      setSectionIndex(
        (current) => (current + delta + INBOX_SECTIONS.length) % INBOX_SECTIONS.length,
      )
      setSelectedIndex(0)
    },
    onRefresh: () => void refresh(),
    onOpen: () => void actions.open(),
    onRead: () => void actions.markRead(),
    onSave: actions.toggleSaved,
    onDone: () => selected && actions.requestAction("done"),
    onUnsubscribe: () => selected && actions.requestAction("unsubscribe"),
  })

  const listWidth = wide ? Math.max(42, Math.floor(terminal.width * 0.52)) : terminal.width
  return (
    <>
      <InboxDashboardView
        active={active}
        state={state}
        refreshing={refreshing}
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
          onOpen: () => void actions.open(),
          onRead: () => void actions.markRead(),
          onDone: () => actions.requestAction("done"),
          onSave: actions.toggleSaved,
          onUnsubscribe: () => actions.requestAction("unsubscribe"),
        }}
        onRetry={() => void refresh()}
      />
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
