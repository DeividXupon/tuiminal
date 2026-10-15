import { COLORS, focusedPanelBorder, LAYOUT } from "@xupon/tuiminal-core/settings/theme"
import { PlasmaLoadingOverlay } from "@xupon/tuiminal-core/ui/PlasmaLoadingOverlay"
import type { ReactNode } from "react"
import type { PullRequestFocus, PullRequestLayoutMode } from "../../model/pr/navigation"
import type { PullRequestComment, PullRequestPreviewTab } from "../../model/pr/types"
import type { PullRequestWorkflowRun } from "../../model/pr/workflows"
import { DashboardStatePanel } from "./DashboardStatePanel"
import { PreviewPane } from "./PreviewPane"
import { PullRequestDashboardHeader } from "./PullRequestDashboardHeader"
import { PullRequestList } from "./PullRequestList"
import type { PullRequestDashboardPresentation } from "./presentation"
import type { PullRequestDashboardState } from "./usePullRequestDashboard"
import type { PullRequestDetailsState } from "./usePullRequestDetails"

type DashboardPanelsProps = {
  paginationActive: boolean
  presentation: PullRequestDashboardPresentation
  layout: PullRequestLayoutMode
  focus: PullRequestFocus
  selectedIndex: number
  previewTab: PullRequestPreviewTab
  listWidth: number
  previewWidth: number
  onSelectRow: (index: number) => void
  onPreviewTab: (tab: PullRequestPreviewTab) => void
  details: PullRequestDetailsState
  previewScrollOffset: number
  descriptionExpanded: boolean
  previewItemIndex: number
  onToggleDescription: () => void
  onCopySha: (sha: string) => void
  onSelectPreviewItem: (index: number) => void
  onOpenBrowser: () => void
  onCopyUrl: () => void
  onCopyNumber: () => void
  onOpenDiff: () => void
  watching: boolean
  onToggleWatch: () => void
  loadingMoreDetails: boolean
  onLoadMoreDetails: () => void
  workflows: PullRequestWorkflowRun[]
  workflowError: string
  loadingMore: boolean
  onOpenWorkflow: (runId: number) => void
  onReactComment: (comment: PullRequestComment) => void
  onReplyComment: (comment: PullRequestComment) => void
  /** `[M]` box-selection paint for the list or preview panel. */
  boxOverlay?: ((box: "list" | "preview") => ReactNode) | undefined
}

function DashboardPanels({
  paginationActive,
  presentation,
  layout,
  focus,
  selectedIndex,
  previewTab,
  listWidth,
  previewWidth,
  details,
  previewScrollOffset,
  descriptionExpanded,
  previewItemIndex,
  onToggleDescription,
  onCopySha,
  onSelectPreviewItem,
  onOpenBrowser,
  onCopyUrl,
  onCopyNumber,
  onOpenDiff,
  watching,
  onToggleWatch,
  loadingMoreDetails,
  onLoadMoreDetails,
  onSelectRow,
  onPreviewTab,
  workflows,
  workflowError,
  loadingMore,
  onOpenWorkflow,
  onReactComment,
  onReplyComment,
  boxOverlay,
}: DashboardPanelsProps) {
  const showList = layout !== "single" || focus === "list"
  const showPreview = layout !== "single" || focus === "preview"
  const selected = presentation.items[selectedIndex] ?? null
  return (
    <box
      style={{
        position: "relative",
        flexGrow: 1,
        flexDirection: layout === "stacked" ? "column" : "row",
        gap: LAYOUT.gap,
      }}
    >
      {showList ? (
        <box
          id="git-pr-list-panel"
          style={{
            ...focusedPanelBorder(focus === "list", COLORS.git),
            backgroundColor: COLORS.panel,
            flexGrow: layout === "stacked" ? 2 : 0,
            width: layout === "side-by-side" ? listWidth : "100%",
            paddingLeft: 1,
            paddingRight: 1,
          }}
        >
          <PullRequestList
            items={presentation.items}
            selectedIndex={selectedIndex}
            focused={focus === "list"}
            width={listWidth}
            onSelect={onSelectRow}
            loadingMore={loadingMore}
            {...(presentation.section.columns ? { columns: presentation.section.columns } : {})}
          />
          {boxOverlay?.("list")}
        </box>
      ) : null}
      {showPreview ? (
        <box
          id="git-pr-preview-panel"
          style={{
            ...focusedPanelBorder(focus === "preview", COLORS.git),
            backgroundColor: COLORS.panel,
            flexGrow: 1,
            width: layout === "side-by-side" ? previewWidth : "100%",
            paddingLeft: 1,
            paddingRight: 1,
          }}
        >
          <PreviewPane
            item={selected}
            details={details}
            activeTab={previewTab}
            focused={paginationActive && focus === "preview"}
            width={previewWidth}
            scrollOffset={previewScrollOffset}
            descriptionExpanded={descriptionExpanded}
            selectedItemIndex={previewItemIndex}
            onTabChange={onPreviewTab}
            onToggleDescription={onToggleDescription}
            onCopySha={onCopySha}
            onSelectItem={onSelectPreviewItem}
            onOpenBrowser={onOpenBrowser}
            onCopyUrl={onCopyUrl}
            onCopyNumber={onCopyNumber}
            onOpenDiff={onOpenDiff}
            watching={watching}
            onToggleWatch={onToggleWatch}
            loadingMore={loadingMoreDetails}
            onLoadMore={onLoadMoreDetails}
            workflows={workflows}
            workflowError={workflowError}
            onOpenWorkflow={onOpenWorkflow}
            onReactComment={onReactComment}
            onReplyComment={onReplyComment}
          />
          {boxOverlay?.("preview")}
        </box>
      ) : null}
    </box>
  )
}

export function PullRequestDashboardView({
  active,
  paginationActive,
  dashboard,
  presentation,
  layout,
  focus,
  selectedIndex,
  previewTab,
  listWidth,
  previewWidth,
  terminalWidth,
  details,
  previewScrollOffset,
  descriptionExpanded,
  previewItemIndex,
  onToggleDescription,
  onCopySha,
  onSelectPreviewItem,
  onOpenBrowser,
  onCopyUrl,
  onCopyNumber,
  onOpenDiff,
  onOpenActions,
  onCreate,
  canCreate,
  watching,
  onToggleWatch,
  loadingMoreDetails,
  onLoadMoreDetails,
  workflows,
  workflowError,
  onOpenWorkflow,
  onReactComment,
  onReplyComment,
  boxOverlay,
  onSelectSection,
  onEditQuery,
  loadingMore,
  refreshing,
  onSelectRow,
  onPreviewTab,
  onRetry,
}: DashboardPanelsProps & {
  active: boolean
  dashboard: PullRequestDashboardState
  onSelectSection: (index: number) => void
  onEditQuery: () => void
  onCreate: () => void
  onOpenActions: () => void
  canCreate: boolean
  refreshing: boolean
  onRetry: () => void
  terminalWidth: number
}) {
  const background = LAYOUT.workspaceBackground
  return (
    <box
      id="git-pr-dashboard"
      style={{
        position: "relative",
        flexGrow: 1,
        backgroundColor: background,
        border: ["top"],
        borderColor: COLORS.border,
        paddingX: LAYOUT.outerPadding,
        gap: 0,
      }}
    >
      <PullRequestDashboardHeader
        presentation={presentation}
        terminalWidth={terminalWidth}
        refreshing={refreshing}
        demo={dashboard.status === "demo"}
        canCreate={canCreate}
        onCreate={onCreate}
        onSelectSection={onSelectSection}
        onEditQuery={onEditQuery}
        onOpenActions={onOpenActions}
      />
      {presentation.showDashboard ? (
        <DashboardPanels
          paginationActive={paginationActive}
          presentation={presentation}
          layout={layout}
          focus={focus}
          selectedIndex={selectedIndex}
          previewTab={previewTab}
          listWidth={listWidth}
          previewWidth={previewWidth}
          onSelectRow={onSelectRow}
          onPreviewTab={onPreviewTab}
          details={details}
          previewScrollOffset={previewScrollOffset}
          descriptionExpanded={descriptionExpanded}
          previewItemIndex={previewItemIndex}
          onToggleDescription={onToggleDescription}
          onCopySha={onCopySha}
          onSelectPreviewItem={onSelectPreviewItem}
          onOpenBrowser={onOpenBrowser}
          onCopyUrl={onCopyUrl}
          onCopyNumber={onCopyNumber}
          onOpenDiff={onOpenDiff}
          watching={watching}
          onToggleWatch={onToggleWatch}
          loadingMoreDetails={loadingMoreDetails}
          onLoadMoreDetails={onLoadMoreDetails}
          workflows={workflows}
          workflowError={workflowError}
          loadingMore={loadingMore}
          onOpenWorkflow={onOpenWorkflow}
          onReactComment={onReactComment}
          onReplyComment={onReplyComment}
          boxOverlay={boxOverlay}
        />
      ) : (
        <DashboardStatePanel active={active} state={dashboard} onRetry={onRetry} />
      )}
      <PlasmaLoadingOverlay
        active={dashboard.status === "loading" || dashboard.status === "idle"}
        label="CARREGANDO GITHUB…"
        accent={COLORS.git}
        background={background}
      />
    </box>
  )
}
