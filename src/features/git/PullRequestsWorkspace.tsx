import { useRenderer, useTerminalDimensions } from "@opentui/react"
import { useCallback, useEffect, useState } from "react"
import { translateUi } from "../../shared/i18n"
import { nextPullRequestDetailConnection } from "./model/pr/detail-pagination"
import type { PullRequestDiffTarget } from "./model/pr/diff"
import {
  adjacentPreviewTab,
  movePullRequestIndex,
  type PullRequestFocus,
  type pullRequestWorkspaceAction,
  resolvePullRequestLayout,
} from "./model/pr/navigation"
import { pullRequestIdentityKey } from "./model/pr/query"
import type { PullRequestPreviewTab } from "./model/pr/types"
import { remoteDashboardHasNextPage } from "./model/remote-pagination"
import { PrDiffView } from "./ui/pr/PrDiffView"
import { PullRequestDashboardView } from "./ui/pr/PullRequestDashboardView"
import { pullRequestDashboardPresentation } from "./ui/pr/presentation"
import { usePullRequestActions } from "./ui/pr/usePullRequestActions"
import { usePullRequestConfiguration } from "./ui/pr/usePullRequestConfiguration"
import { usePullRequestDashboard } from "./ui/pr/usePullRequestDashboard"
import { usePullRequestDetails } from "./ui/pr/usePullRequestDetails"
import { usePullRequestWatch } from "./ui/pr/usePullRequestWatch"
import { usePullRequestWorkflows } from "./ui/pr/usePullRequestWorkflows"
import { usePullRequestWorkspaceKeyboard } from "./ui/pr/usePullRequestWorkspaceKeyboard"
import { usePullRequestNotifications } from "./ui/pr/usePullRequestNotifications"
import { useAutoPage } from "./ui/useAutoPagination"
import {
  dashboardAuth,
  dashboardProfileTarget,
  diffTargetForPreview,
  openPullRequestWithNotice,
  openWorkflowWithNotice,
} from "./ui/pr/workspace-helpers"

export function PullRequestsWorkspace({
  active,
  configurationRevision = 0,
  onLocalCheckout = () => undefined,
}: {
  active: boolean
  configurationRevision?: number
  onLocalCheckout?: () => void
}) {
  const renderer = useRenderer()
  const terminal = useTerminalDimensions()
  const [sectionIndex, setSectionIndex] = useState(0)
  const [requestedSectionId, setRequestedSectionId] = useState("mine")
  const [queryOverride, setQueryOverride] = useState<string | null>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [selectedIdentity, setSelectedIdentity] = useState<string | null>(null)
  const [focus, setFocus] = useState<PullRequestFocus>("list")
  const [previewVisible, setPreviewVisible] = useState(true)
  const [previewTab, setPreviewTab] = useState<PullRequestPreviewTab>("overview")
  const [previewOffsets, setPreviewOffsets] = useState<Record<PullRequestPreviewTab, number>>({
    overview: 0,
    checks: 0,
    activity: 0,
    commits: 0,
    files: 0,
  })
  const [descriptionExpanded, setDescriptionExpanded] = useState(false)
  const [previewItemIndices, setPreviewItemIndices] = useState<
    Record<PullRequestPreviewTab, number>
  >({ overview: 0, checks: 0, activity: 0, commits: 0, files: 0 })
  const [diffTarget, setDiffTarget] = useState<PullRequestDiffTarget | null>(null)
  const [notice, setNotice] = useState("")
  const [sectionCounts, setSectionCounts] = useState<Record<string, number | null>>({})
  const watch = usePullRequestWatch(setNotice)
  const dashboardFlow = usePullRequestDashboard(
    active,
    requestedSectionId,
    queryOverride,
    configurationRevision,
  )
  const { state: dashboard, refresh, loadMore, loadingMore, refreshing } = dashboardFlow
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
  } = usePullRequestDetails(active && presentation.showDashboard, selected)
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
    onRefresh: () => void refresh(),
    onLocalCheckout,
  })
  const configuration = usePullRequestConfiguration({
    target: profileTarget,
    currentSection: presentation.section,
    refresh: () => void refresh(),
    applyQuery: setQueryOverride,
    clearQuery: () => setQueryOverride(null),
    setNotice,
  })
  const responsiveLayout = resolvePullRequestLayout(
    terminal.width,
    terminal.height,
    configuration.previewPosition,
  )
  const layout = previewVisible ? responsiveLayout : "single"
  const modalOpen = configuration.modalOpen || pullRequestActions.modalOpen
  const previewItemIndex = previewItemIndices[previewTab]
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

  const togglePreview = () => {
    setFocus("list")
    setPreviewVisible((current) => !current)
  }

  const handleReadAction = (action: ReturnType<typeof pullRequestWorkspaceAction>) => {
    if (!action || !selected) return false
    if (action.type === "scroll-preview") {
      setPreviewOffsets((current) => ({
        ...current,
        [previewTab]: Math.max(0, current[previewTab] + action.delta),
      }))
      return true
    }
    if (action.type === "toggle-description") {
      setDescriptionExpanded((current) => !current)
      return true
    }
    if (action.type === "copy-url") copy(selected.identity.url, translateUi("URL do PR copiada."))
    else if (action.type === "copy-number") {
      copy(String(selected.identity.number), translateUi("Número do PR copiado."))
    } else if (action.type === "copy-sha") copy(selected.headSha, translateUi("SHA copiado."))
    else if (action.type === "open-browser") {
      openPullRequestWithNotice(selected.identity, setNotice)
    } else return false
    return true
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
    if (!action) return
    if (action.type === "move-section") {
      selectSection(
        (sectionIndex + action.delta + presentation.sections.length) % presentation.sections.length,
      )
    } else if (action.type === "move-row") {
      selectRow(
        movePullRequestIndex(resolvedSelectedIndex, presentation.items.length, action.delta),
      )
    } else if (action.type === "select-edge") {
      selectRow(action.target === "first" ? 0 : Math.max(0, presentation.items.length - 1))
    } else if (action.type === "focus") {
      if (action.target === "preview") setPreviewVisible(true)
      setFocus(action.target)
    } else if (action.type === "move-preview-tab") {
      setPreviewTab((current) => adjacentPreviewTab(current, action.delta))
    }
  }

  const handleWorkspaceCommand = (action: ReturnType<typeof pullRequestWorkspaceAction>) => {
    if (!action) return false
    switch (action.type) {
      case "edit-query":
        configuration.openQuery()
        return true
      case "refresh":
        void refresh()
        return true
      case "load-more":
        void loadMore()
        return true
      case "load-preview-more":
        void loadMoreDetails(previewTab)
        return true
      case "open-diff":
        if (details.status !== "ready") return false
        setDiffTarget(diffTargetForPreview(previewTab, details.details, previewItemIndex))
        return true
      case "open-action-menu":
        pullRequestActions.openMenu()
        return true
      case "prepare-action":
        pullRequestActions.openAction(action.kind)
        return true
      case "toggle-watch":
        if (!selected) return false
        watch.toggle(selected)
        return true
      case "toggle-preview":
        togglePreview()
        return true
      case "cycle-preview-position":
        configuration.cyclePreviewPosition()
        return true
      default:
        return false
    }
  }

  usePullRequestWorkspaceKeyboard({
    active,
    blocked: modalOpen || Boolean(diffTarget),
    focus,
    hasSelection: Boolean(selected),
    canLoadMore: dashboard.status === "ready" && dashboard.hasNextPage,
    canLoadPreview:
      details.status === "ready" &&
      Boolean(nextPullRequestDetailConnection(details.details, previewTab)),
    previewTab,
    details: details.status === "ready" ? details.details : null,
    previewItemIndex,
    onWorkspaceAction: (action) => {
      if (handleWorkspaceCommand(action)) return
      if (handleReadAction(action)) return
      handleNavigation(action)
    },
    onPreviewMove: (delta, count) => {
      setPreviewItemIndices((current) => ({
        ...current,
        [previewTab]: Math.max(0, Math.min(Math.max(0, count - 1), current[previewTab] + delta)),
      }))
    },
    onCopySha: (sha) => copy(sha, translateUi("SHA copiado.")),
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
        dashboard={dashboard}
        presentation={presentation}
        layout={layout}
        previewPosition={configuration.previewPosition}
        previewVisible={previewVisible}
        focus={focus}
        selectedIndex={resolvedSelectedIndex}
        previewTab={previewTab}
        listWidth={listWidth}
        previewWidth={previewWidth}
        notice={notice}
        details={details}
        previewScrollOffset={previewOffsets[previewTab]}
        descriptionExpanded={descriptionExpanded}
        previewItemIndex={previewItemIndex}
        loadingMoreDetails={loadingMoreDetails}
        loadingMore={loadingMore}
        refreshing={refreshing}
        onSelectSection={selectSection}
        onEditQuery={configuration.openQuery}
        onCyclePreviewPosition={configuration.cyclePreviewPosition}
        onTogglePreview={togglePreview}
        workflows={workflows}
        workflowError={workflowError}
        onOpenWorkflow={(runId) => {
          if (selected) openWorkflowWithNotice(selected.identity, runId, setNotice)
        }}
        onSelectRow={(index) => {
          selectRow(index)
          setFocus("list")
        }}
        onPreviewTab={(tab) => {
          setPreviewTab(tab)
          setFocus("preview")
        }}
        onRetry={() => void refresh()}
        onLoadMore={() => void loadMore()}
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
        onOpenActions={pullRequestActions.openMenu}
        watching={watch.isWatching(selected)}
        onToggleWatch={() => {
          if (selected) watch.toggle(selected)
        }}
      />
      {configuration.modals}
      {pullRequestActions.modals}
    </>
  )
}
