import { useRenderer, useTerminalDimensions } from "@opentui/react"
import { useCallback, useEffect, useState } from "react"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { sortedIssueComments } from "./model/issue/activity"
import { defaultCreateRepository } from "./model/create-item"
import {
  adjacentIssuePreviewTab,
  moveIssueIndex,
  resolveIssueLayout,
  type IssueFocus,
  type IssueWorkspaceAction,
} from "./model/issue/navigation"
import { issueIdentityKey } from "./model/issue/query"
import type { IssuePreviewTab } from "./model/issue/types"
import { remoteDashboardHasNextPage } from "./model/remote-pagination"
import { IssueDashboardView } from "./ui/issue/IssueDashboardView"
import { issueDashboardPresentation } from "./ui/issue/presentation"
import { useIssueActions } from "./ui/issue/useIssueActions"
import { useIssueConfiguration } from "./ui/issue/useIssueConfiguration"
import { useIssueDashboard } from "./ui/issue/useIssueDashboard"
import { useIssueDetails } from "./ui/issue/useIssueDetails"
import { useIssueNotifications } from "./ui/issue/useIssueNotifications"
import { useIssueWorkspaceKeyboard } from "./ui/issue/useIssueWorkspaceKeyboard"
import { useAutoPage } from "./ui/useAutoPagination"
import { defaultGitBrowserOpener, type GitBrowserOpener } from "./ui/browser/useGitBrowser"
import { useGitHubCreation } from "./ui/shared/useGitHubCreation"
import { useGitForegroundRefresh } from "./ui/shared/useGitForegroundRefresh"
import {
  issueDashboardAuth,
  issueDashboardProfileTarget,
  openIssueWithNotice,
} from "./ui/issue/workspace-helpers"

export function IssuesWorkspace({
  active,
  configurationRevision = 0,
  onLocalCheckout = () => undefined,
  onOpenBrowser = defaultGitBrowserOpener,
}: {
  active: boolean
  configurationRevision?: number
  onLocalCheckout?: () => void
  onOpenBrowser?: GitBrowserOpener
}) {
  const renderer = useRenderer()
  const terminal = useTerminalDimensions()
  const [sectionIndex, setSectionIndex] = useState(0)
  const [requestedSectionId, setRequestedSectionId] = useState("created")
  const [queryOverride, setQueryOverride] = useState<string | null>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [selectedIdentity, setSelectedIdentity] = useState<string | null>(null)
  const [focus, setFocus] = useState<IssueFocus>("list")
  const [previewVisible, setPreviewVisible] = useState(true)
  const [previewTab, setPreviewTab] = useState<IssuePreviewTab>("overview")
  const [previewOffsets, setPreviewOffsets] = useState<Record<IssuePreviewTab, number>>({
    overview: 0,
    activity: 0,
  })
  const [descriptionExpanded, setDescriptionExpanded] = useState(false)
  const [selectedCommentIndex, setSelectedCommentIndex] = useState(0)
  const [notice, setNotice] = useState("")
  const [sectionCounts, setSectionCounts] = useState<Record<string, number | null>>({})
  const dashboardFlow = useIssueDashboard(
    active,
    requestedSectionId,
    queryOverride,
    configurationRevision,
  )
  const {
    state: dashboard,
    refresh,
    refreshActive,
    loadMore,
    loadingMore,
    refreshing,
  } = dashboardFlow
  const basePresentation = issueDashboardPresentation(dashboard, sectionIndex)
  const queryPresentation = queryOverride
    ? { ...basePresentation, section: { ...basePresentation.section, query: queryOverride } }
    : basePresentation
  const presentation = {
    ...queryPresentation,
    counts: { ...queryPresentation.counts, ...sectionCounts },
  }
  const identityIndex = selectedIdentity
    ? presentation.items.findIndex((item) => issueIdentityKey(item.identity) === selectedIdentity)
    : -1
  const resolvedSelectedIndex = identityIndex >= 0 ? identityIndex : selectedIndex
  const selected = presentation.items[resolvedSelectedIndex] ?? null
  const {
    state: details,
    loadMore: loadMoreDetails,
    loadingMore: loadingMoreDetails,
    reload: reloadDetails,
    refreshQuietly: refreshDetailsQuietly,
  } = useIssueDetails(active && presentation.showDashboard, selected)
  useGitForegroundRefresh({
    active,
    sectionKey: `${requestedSectionId}:${queryOverride ?? ""}`,
    dashboard,
    refreshList: refreshActive,
    refreshDetails: refreshDetailsQuietly,
  })
  const profileTarget = issueDashboardProfileTarget(dashboard)
  const configuration = useIssueConfiguration({
    target: profileTarget,
    currentSection: presentation.section,
    refresh: () => void refresh(),
    applyQuery: setQueryOverride,
    clearQuery: () => setQueryOverride(null),
    setNotice,
  })
  const issueActions = useIssueActions({
    item: selected,
    details: details.status === "ready" ? details.details : null,
    auth: issueDashboardAuth(dashboard),
    profileRoot: profileTarget?.root ?? null,
    onNotice: setNotice,
    onRefresh: () => {
      void refresh()
      void reloadDetails()
    },
    onLocalCheckout,
  })
  const creation = useGitHubCreation({
    kind: "issue",
    auth: issueDashboardAuth(dashboard),
    defaultRepository: defaultCreateRepository(
      selected?.identity ?? null,
      profileTarget?.profile.repositories ?? [],
    ),
    onNotice: setNotice,
    onRefresh: () => void refresh(),
  })
  const comments =
    details.status === "ready"
      ? sortedIssueComments(details.details.comments, details.details.identity)
      : []
  const selectedComment = comments[selectedCommentIndex] ?? null
  const responsiveLayout = resolveIssueLayout(
    terminal.width,
    terminal.height,
    configuration.previewPosition,
  )
  const layout = previewVisible ? responsiveLayout : "single"
  const modalOpen = configuration.modalOpen || issueActions.modalOpen || creation.open
  useIssueNotifications(notice, dashboard, details)

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

  const selectRow = (index: number) => {
    setSelectedIndex(index)
    const item = presentation.items[index]
    const nextIdentity = item ? issueIdentityKey(item.identity) : null
    if (nextIdentity !== selectedIdentity) {
      setDescriptionExpanded(false)
      setSelectedCommentIndex(0)
      setPreviewOffsets({ overview: 0, activity: 0 })
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
      setNotice(translateUi("A issue selecionada saiu desta seção após a atualização."))
      setDescriptionExpanded(false)
      setSelectedCommentIndex(0)
      setPreviewOffsets({ overview: 0, activity: 0 })
    }
    const nextIndex = Math.min(resolvedSelectedIndex, presentation.items.length - 1)
    const next = presentation.items[nextIndex]
    setSelectedIndex(nextIndex)
    setSelectedIdentity(next ? issueIdentityKey(next.identity) : null)
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

  const copy = (value: string, success: string) => {
    const copied = renderer.copyToClipboardOSC52(value)
    setNotice(copied ? success : translateUi("O terminal não aceitou a cópia OSC52."))
  }
  const readAction = (action: IssueWorkspaceAction) => {
    if (!selected) return false
    if (action.type === "copy-url")
      copy(selected.identity.url, translateUi("URL da issue copiada."))
    else if (action.type === "copy-number")
      copy(String(selected.identity.number), translateUi("Número da issue copiado."))
    else if (action.type === "open-browser")
      openIssueWithNotice(selected.identity, setNotice, onOpenBrowser)
    else return false
    return true
  }

  const handleAction = (action: IssueWorkspaceAction) => {
    if (readAction(action)) return
    switch (action.type) {
      case "create-issue":
        creation.openModal()
        break
      case "move-section":
        selectSection(
          (sectionIndex + action.delta + presentation.sections.length) %
            presentation.sections.length,
        )
        break
      case "move-row":
        selectRow(moveIssueIndex(resolvedSelectedIndex, presentation.items.length, action.delta))
        break
      case "select-edge":
        selectRow(action.target === "first" ? 0 : Math.max(0, presentation.items.length - 1))
        break
      case "focus":
        if (action.target === "preview") setPreviewVisible(true)
        setFocus(action.target)
        break
      case "move-preview-tab":
        setPreviewTab((current) => adjacentIssuePreviewTab(current, action.delta))
        break
      case "scroll-preview":
        setPreviewOffsets((current) => ({
          ...current,
          [previewTab]: Math.max(0, current[previewTab] + action.delta),
        }))
        break
      case "toggle-description":
        setDescriptionExpanded((current) => !current)
        break
      case "edit-query":
        configuration.openQuery()
        break
      case "refresh":
        void refresh()
        void refreshDetailsQuietly()
        break
      case "load-more":
        void loadMore()
        break
      case "load-preview-more":
        void loadMoreDetails()
        break
      case "open-action-menu":
        issueActions.openMenu()
        break
      case "prepare-action":
        issueActions.openAction(action.kind)
        break
      case "toggle-preview":
        setFocus("list")
        setPreviewVisible((current) => !current)
        break
      case "cycle-preview-position":
        configuration.cyclePreviewPosition()
        break
    }
  }

  useIssueWorkspaceKeyboard({
    active,
    blocked:
      modalOpen || dashboard.status === "requirements" || dashboard.status === "authentication",
    focus,
    hasSelection: Boolean(selected),
    canLoadMore: dashboard.status === "ready" && dashboard.hasNextPage,
    canLoadPreview: details.status === "ready" && details.details.commentPage.hasNextPage,
    previewTab,
    commentCount: comments.length,
    onCommentMove: (delta) =>
      setSelectedCommentIndex((current) => moveIssueIndex(current, comments.length, delta)),
    onCommentReact: () => {
      if (selectedComment) issueActions.openCommentAction("reaction", selectedComment)
    },
    onCommentReply: () => {
      if (selectedComment) issueActions.openCommentAction("reply", selectedComment)
    },
    onWorkspaceAction: handleAction,
  })

  const listWidth =
    layout === "side-by-side" ? Math.max(48, Math.floor(terminal.width * 0.56)) : terminal.width
  const previewWidth =
    layout === "side-by-side" ? Math.max(36, terminal.width - listWidth - 3) : terminal.width

  return (
    <>
      <IssueDashboardView
        active={active}
        dashboard={dashboard}
        presentation={presentation}
        layout={layout}
        focus={focus}
        selectedIndex={resolvedSelectedIndex}
        previewTab={previewTab}
        listWidth={listWidth}
        previewWidth={previewWidth}
        details={details}
        previewScrollOffset={previewOffsets[previewTab]}
        descriptionExpanded={descriptionExpanded}
        selectedCommentIndex={selectedCommentIndex}
        loadingMoreDetails={loadingMoreDetails}
        previewPosition={configuration.previewPosition}
        previewVisible={previewVisible}
        notice={notice}
        loadingMore={loadingMore}
        refreshing={refreshing}
        onSelectRow={(index) => {
          selectRow(index)
          setFocus("list")
        }}
        onPreviewTab={(tab) => {
          setPreviewTab(tab)
          setFocus("preview")
        }}
        onToggleDescription={() => setDescriptionExpanded((current) => !current)}
        onOpenBrowser={() => handleAction({ type: "open-browser" })}
        onCopyUrl={() => handleAction({ type: "copy-url" })}
        onCopyNumber={() => handleAction({ type: "copy-number" })}
        onOpenActions={issueActions.openMenu}
        onCreate={creation.openModal}
        canCreate={creation.available}
        onSelectComment={(index) => {
          setSelectedCommentIndex(index)
          setFocus("preview")
        }}
        onReactComment={(comment) => issueActions.openCommentAction("reaction", comment)}
        onReplyComment={(comment) => issueActions.openCommentAction("reply", comment)}
        onLoadMoreDetails={() => void loadMoreDetails()}
        onSelectSection={selectSection}
        onEditQuery={configuration.openQuery}
        onRetry={() => void refresh()}
        onLoadMore={() => void loadMore()}
        onCyclePreviewPosition={configuration.cyclePreviewPosition}
        onTogglePreview={() => {
          setFocus("list")
          setPreviewVisible((current) => !current)
        }}
      />
      {configuration.modals}
      {issueActions.modals}
      {creation.modal}
    </>
  )
}
