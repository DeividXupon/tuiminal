import { useRenderer, useTerminalDimensions } from "@opentui/react"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { useCallback, useEffect, useState } from "react"
import { defaultCreateRepository } from "./model/create-item"
import { pullRequestActivity } from "./model/pr/activity"
import type { PullRequestDiffTarget } from "./model/pr/diff"
import {
  type PullRequestFocus,
  type PullRequestWorkspaceAction,
  type pullRequestWorkspaceAction,
  resolvePullRequestLayout,
} from "./model/pr/navigation"
import { pullRequestIdentityKey } from "./model/pr/query"
import type { PullRequestPreviewTab } from "./model/pr/types"
import { remoteDashboardHasNextPage } from "./model/remote-pagination"
import type { GitWorkspaceTab } from "./model/workspace"
import { defaultGitBrowserOpener, type GitBrowserOpener } from "./ui/browser/useGitBrowser"
import { PrDiffView } from "./ui/pr/PrDiffView"
import { PullRequestDashboardView } from "./ui/pr/PullRequestDashboardView"
import { pullRequestDashboardPresentation } from "./ui/pr/presentation"
import { usePullRequestActions } from "./ui/pr/usePullRequestActions"
import { usePullRequestConfiguration } from "./ui/pr/usePullRequestConfiguration"
import { usePullRequestDashboard } from "./ui/pr/usePullRequestDashboard"
import { usePullRequestDetails } from "./ui/pr/usePullRequestDetails"
import { usePullRequestNotifications } from "./ui/pr/usePullRequestNotifications"
import { usePullRequestPalette } from "./ui/pr/usePullRequestPalette"
import { usePullRequestWatch } from "./ui/pr/usePullRequestWatch"
import { usePullRequestWorkflows } from "./ui/pr/usePullRequestWorkflows"
import { usePullRequestWorkspaceKeyboard } from "./ui/pr/usePullRequestWorkspaceKeyboard"
import {
  dashboardAuth,
  dashboardProfileTarget,
  diffTargetForPreview,
  emptyPullRequestPreviewPositions,
  executePullRequestNavigation,
  executePullRequestReadAction,
  openWorkflowWithNotice,
  pullRequestKeyboardGuards,
  runPullRequestCommand,
} from "./ui/pr/workspace-helpers"
import { useGitForegroundRefresh } from "./ui/shared/useGitForegroundRefresh"
import { useGitHubCreation } from "./ui/shared/useGitHubCreation"
import { useAutoPage } from "./ui/useAutoPagination"
export function PullRequestsWorkspace({
  active,
  configurationRevision = 0,
  onLocalCheckout = () => undefined,
  onOpenBrowser = defaultGitBrowserOpener,
  onSelectTab,
}: {
  active: boolean
  configurationRevision?: number
  onLocalCheckout?: () => void
  onOpenBrowser?: GitBrowserOpener
  onSelectTab?: ((tab: GitWorkspaceTab) => void) | undefined
}) {
  const renderer = useRenderer()
  const terminal = useTerminalDimensions()
  const [sectionIndex, setSectionIndex] = useState(0)
  const [requestedSectionId, setRequestedSectionId] = useState("mine")
  const [queryOverride, setQueryOverride] = useState<string | null>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [selectedIdentity, setSelectedIdentity] = useState<string | null>(null)
  const [focus, setFocus] = useState<PullRequestFocus>("list")
  const [previewTab, setPreviewTab] = useState<PullRequestPreviewTab>("overview")
  const [previewOffsets, setPreviewOffsets] = useState(emptyPullRequestPreviewPositions)
  const [descriptionExpanded, setDescriptionExpanded] = useState(false)
  const [previewItemIndices, setPreviewItemIndices] = useState(emptyPullRequestPreviewPositions)
  const [diffTarget, setDiffTarget] = useState<PullRequestDiffTarget | null>(null)
  const [notice, setNotice] = useState("")
  const [sectionCounts, setSectionCounts] = useState<Record<string, number | null>>({})
  const watch = usePullRequestWatch(setNotice)
  const {
    state: dashboard,
    refresh,
    refreshActive,
    loadMore,
    loadingMore,
    refreshing,
  } = usePullRequestDashboard(active, requestedSectionId, queryOverride, configurationRevision)
  const basePresentation = pullRequestDashboardPresentation(dashboard, sectionIndex)
  const queryPresentation = queryOverride
    ? {
        ...basePresentation,
        section: { ...basePresentation.section, query: queryOverride },
      }
    : basePresentation
  const presentation = {
    ...queryPresentation,
    counts: { ...queryPresentation.counts, ...sectionCounts },
  }
  const identityIndex = selectedIdentity
    ? presentation.items.findIndex(
        (item) => pullRequestIdentityKey(item.identity) === selectedIdentity,
      )
    : -1
  const resolvedSelectedIndex = identityIndex >= 0 ? identityIndex : selectedIndex
  const selected = presentation.items[resolvedSelectedIndex] ?? null
  const {
    state: details,
    loadMore: loadMoreDetails,
    loadingMore: loadingMoreDetails,
    reload: reloadDetails,
    refreshQuietly: refreshDetailsQuietly,
  } = usePullRequestDetails(active && presentation.showDashboard, selected)
  useGitForegroundRefresh({
    active,
    sectionKey: `${requestedSectionId}:${queryOverride ?? ""}`,
    dashboard,
    refreshList: refreshActive,
    refreshDetails: refreshDetailsQuietly,
  })
  const profileTarget = dashboardProfileTarget(dashboard)
  const { runs: workflows, error: workflowError } = usePullRequestWorkflows(
    active && previewTab === "checks" && dashboard.status === "ready",
    selected,
  )
  const pullRequestActions = usePullRequestActions({
    item: selected,
    details: details.status === "ready" ? details.details : null,
    auth: dashboardAuth(dashboard),
    profileRoot: profileTarget?.root ?? null,
    workflows,
    onNotice: setNotice,
    onRefresh: () => {
      void refresh()
      void reloadDetails()
    },
    onLocalCheckout,
  })
  const creation = useGitHubCreation({
    kind: "pr",
    auth: dashboardAuth(dashboard),
    defaultRepository: defaultCreateRepository(
      selected?.identity ?? null,
      profileTarget?.profile.repositories ?? [],
    ),
    onNotice: setNotice,
    onRefresh: () => void refresh(),
  })
  const configuration = usePullRequestConfiguration({
    target: profileTarget,
    currentSection: presentation.section,
    refresh: () => void refresh(),
    applyQuery: setQueryOverride,
    clearQuery: () => setQueryOverride(null),
    setNotice,
  })
  const layout = resolvePullRequestLayout(terminal.width, terminal.height)
  const modalOpen = configuration.modalOpen || pullRequestActions.modalOpen || creation.open
  const previewItemIndex = previewItemIndices[previewTab]
  const activityEntries = details.status === "ready" ? pullRequestActivity(details.details) : []
  const selectedActivityComment = activityEntries[previewItemIndex]?.comment ?? null
  usePullRequestNotifications(notice, dashboard, details, workflowError)
  const selectSection = useCallback(
    (index: number) => {
      setSectionIndex(index)
      const requested = presentation.sections[index]
      if (requested) setRequestedSectionId(requested.id)
      setQueryOverride(null)
      setSelectedIndex(0)
      setSelectedIdentity(null)
      setFocus("list")
    },
    [presentation.sections],
  )
  const copy = (value: string, success: string) => {
    const copied = renderer.copyToClipboardOSC52(value)
    setNotice(copied ? success : translateUi("O terminal não aceitou a cópia OSC52."))
  }
  const handleReadAction = (action: ReturnType<typeof pullRequestWorkspaceAction>) => {
    return executePullRequestReadAction(
      action,
      selected,
      previewTab,
      setPreviewOffsets,
      setDescriptionExpanded,
      copy,
      setNotice,
      onOpenBrowser,
    )
  }
  const selectRow = (index: number) => {
    setSelectedIndex(index)
    const item = presentation.items[index]
    const nextIdentity = item ? pullRequestIdentityKey(item.identity) : null
    if (nextIdentity !== selectedIdentity) {
      setDescriptionExpanded(false)
      setPreviewItemIndices({ overview: 0, checks: 0, activity: 0, commits: 0, files: 0 })
      setPreviewOffsets({ overview: 0, checks: 0, activity: 0, commits: 0, files: 0 })
    }
    setSelectedIdentity(nextIdentity)
  }
  useEffect(() => {
    if (!presentation.items.length) {
      setSelectedIndex(0)
      setSelectedIdentity(null)
      return
    }
    if (selectedIdentity && identityIndex < 0) {
      setNotice(translateUi("O PR selecionado saiu desta seção após a atualização."))
      setDescriptionExpanded(false)
      setPreviewItemIndices({ overview: 0, checks: 0, activity: 0, commits: 0, files: 0 })
      setPreviewOffsets({ overview: 0, checks: 0, activity: 0, commits: 0, files: 0 })
    }
    const nextIndex = Math.min(resolvedSelectedIndex, presentation.items.length - 1)
    const next = presentation.items[nextIndex]
    setSelectedIndex(nextIndex)
    setSelectedIdentity(next ? pullRequestIdentityKey(next.identity) : null)
  }, [identityIndex, presentation.items, resolvedSelectedIndex, selectedIdentity])
  useEffect(() => {
    if (dashboard.status !== "ready" || queryOverride) return
    setSectionCounts((current) => ({
      ...current,
      [dashboard.section.id]: dashboard.totalCount ?? dashboard.loadedCount,
    }))
  }, [dashboard, queryOverride])
  const hasNextPage = remoteDashboardHasNextPage(dashboard)
  useAutoPage(resolvedSelectedIndex, presentation.items.length, hasNextPage, loadingMore, loadMore)
  const handleNavigation = (action: ReturnType<typeof pullRequestWorkspaceAction>) => {
    executePullRequestNavigation(action, {
      sectionIndex,
      sectionCount: presentation.sections.length,
      selectedIndex: resolvedSelectedIndex,
      itemCount: presentation.items.length,
      selectSection,
      selectRow,
      setFocus,
      setPreviewTab,
    })
  }
  const commandHandlers: Partial<Record<PullRequestWorkspaceAction["type"], () => unknown>> = {
    "edit-query": configuration.openQuery,
    "create-pr": creation.openModal,
    refresh: () => Promise.all([refresh(), refreshDetailsQuietly()]),
    "open-diff": () =>
      details.status === "ready" &&
      setDiffTarget(diffTargetForPreview(previewTab, details.details, previewItemIndex)),
    "open-action-menu": () => palette.openPalette(),
    "toggle-watch": () => selected && watch.toggle(selected),
  }
  const handleWorkspaceCommand = (action: ReturnType<typeof pullRequestWorkspaceAction>) =>
    runPullRequestCommand(action, commandHandlers, pullRequestActions.openAction)
  const dispatchWorkspaceAction = (action: PullRequestWorkspaceAction) => {
    if (handleWorkspaceCommand(action)) return
    if (handleReadAction(action)) return
    handleNavigation(action)
  }
  const guards = pullRequestKeyboardGuards(modalOpen, Boolean(diffTarget), dashboard, details)
  const palette = usePullRequestPalette({
    active,
    blocked: guards.blocked,
    focus,
    selected,
    previewTab,
    previewItemIndex,
    details,
    selectedComment: selectedActivityComment,
    creation,
    watching: watch.isWatching(selected),
    actions: pullRequestActions,
    copy,
    onSelectTab,
    dispatch: dispatchWorkspaceAction,
  })
  usePullRequestWorkspaceKeyboard({
    active,
    ...guards,
    blocked: guards.blocked || palette.open,
    focus,
    hasSelection: Boolean(selected),
    previewTab,
    previewItemIndex,
    onWorkspaceAction: dispatchWorkspaceAction,
    onPreviewMove: (delta, count) => {
      setPreviewItemIndices((current) => ({
        ...current,
        [previewTab]: Math.max(0, Math.min(Math.max(0, count - 1), current[previewTab] + delta)),
      }))
    },
    onCopySha: (sha) => copy(sha, translateUi("SHA copiado.")),
    onCommentReact: palette.reactToComment,
    onCommentReply: palette.replyToComment,
  })
  const listWidth =
    layout === "side-by-side" ? Math.max(48, Math.floor(terminal.width * 0.56)) : terminal.width
  const previewWidth =
    layout === "side-by-side" ? Math.max(36, terminal.width - listWidth - 3) : terminal.width
  if (diffTarget && selected && details.status === "ready") {
    return (
      <PrDiffView
        item={selected}
        details={details.details}
        target={diffTarget}
        onClose={() => setDiffTarget(null)}
        onCopy={copy}
      />
    )
  }
  return (
    <>
      <PullRequestDashboardView
        active={active}
        paginationActive={active && !modalOpen && !palette.open}
        dashboard={dashboard}
        presentation={presentation}
        layout={layout}
        focus={focus}
        selectedIndex={resolvedSelectedIndex}
        previewTab={previewTab}
        listWidth={listWidth}
        previewWidth={previewWidth}
        terminalWidth={terminal.width}
        details={details}
        previewScrollOffset={previewOffsets[previewTab]}
        descriptionExpanded={descriptionExpanded}
        previewItemIndex={previewItemIndex}
        loadingMoreDetails={loadingMoreDetails}
        loadingMore={loadingMore}
        refreshing={refreshing}
        onSelectSection={selectSection}
        onEditQuery={configuration.openQuery}
        workflows={workflows}
        workflowError={workflowError}
        onOpenWorkflow={(runId) =>
          selected && openWorkflowWithNotice(selected.identity, runId, setNotice, onOpenBrowser)
        }
        onReactComment={(comment) => pullRequestActions.openCommentAction("reaction", comment)}
        onReplyComment={(comment) => pullRequestActions.openCommentAction("reply", comment)}
        onSelectRow={(index) => {
          selectRow(index)
          setFocus("list")
        }}
        onPreviewTab={(tab) => {
          setPreviewTab(tab)
          setFocus("preview")
        }}
        onRetry={() => void refresh()}
        onLoadMoreDetails={() => void loadMoreDetails(previewTab)}
        onToggleDescription={() => setDescriptionExpanded((current) => !current)}
        onCopySha={(sha) => copy(sha, translateUi("SHA copiado."))}
        onSelectPreviewItem={(index) => {
          setPreviewItemIndices((current) => ({ ...current, [previewTab]: index }))
          setFocus("preview")
        }}
        onOpenBrowser={() => handleReadAction({ type: "open-browser" })}
        onCopyUrl={() => handleReadAction({ type: "copy-url" })}
        onCopyNumber={() => handleReadAction({ type: "copy-number" })}
        onOpenDiff={() => {
          if (details.status === "ready") {
            setDiffTarget(diffTargetForPreview(previewTab, details.details, previewItemIndex))
          }
        }}
        onOpenActions={palette.openPalette}
        boxOverlay={palette.boxOverlay}
        onCreate={creation.openModal}
        canCreate={creation.available}
        watching={watch.isWatching(selected)}
        onToggleWatch={() => selected && watch.toggle(selected)}
      />
      {configuration.modals}
      {pullRequestActions.modals}
      {palette.palette}
      {palette.boxFocusNode}
      {creation.modal}
    </>
  )
}
