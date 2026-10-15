import { COLORS, focusedPanelBorder, LAYOUT } from "@xupon/tuiminal-core/settings/theme"
import { PlasmaLoadingOverlay } from "@xupon/tuiminal-core/ui/PlasmaLoadingOverlay"
import type { ReactNode } from "react"
import type { IssueFocus, IssueLayoutMode } from "../../model/issue/navigation"
import type { IssueComment, IssuePreviewTab } from "../../model/issue/types"
import { IssueDashboardHeader } from "./IssueDashboardHeader"
import { IssueDashboardStatePanel } from "./IssueDashboardStatePanel"
import { IssueList } from "./IssueList"
import { IssuePreviewPane } from "./IssuePreviewPane"
import type { IssueDashboardPresentation } from "./presentation"
import type { IssueDashboardState } from "./useIssueDashboard"
import type { IssueDetailsState } from "./useIssueDetails"

type IssuePanelsProps = {
  paginationActive: boolean
  presentation: IssueDashboardPresentation
  layout: IssueLayoutMode
  focus: IssueFocus
  selectedIndex: number
  previewTab: IssuePreviewTab
  listWidth: number
  previewWidth: number
  details: IssueDetailsState
  previewScrollOffset: number
  descriptionExpanded: boolean
  selectedCommentIndex: number
  loadingMoreDetails: boolean
  onSelectRow: (index: number) => void
  onPreviewTab: (tab: IssuePreviewTab) => void
  onToggleDescription: () => void
  onOpenBrowser: () => void
  onCopyUrl: () => void
  onCopyNumber: () => void
  onLoadMoreDetails: () => void
  onSelectComment: (index: number) => void
  onReactComment: (comment: IssueComment) => void
  onReplyComment: (comment: IssueComment) => void
  loadingMore: boolean
  /** `[M]` box-selection paint for the list or preview panel. */
  boxOverlay?: ((box: "list" | "preview") => ReactNode) | undefined
}

function IssuePanels(props: IssuePanelsProps) {
  const showList = props.layout !== "single" || props.focus === "list"
  const showPreview = props.layout !== "single" || props.focus === "preview"
  const selected = props.presentation.items[props.selectedIndex] ?? null
  return (
    <box
      style={{
        position: "relative",
        flexGrow: 1,
        flexDirection: props.layout === "stacked" ? "column" : "row",
        gap: LAYOUT.gap,
      }}
    >
      {showList ? (
        <box
          id="git-issue-list-panel"
          style={{
            ...focusedPanelBorder(props.focus === "list", COLORS.git),
            backgroundColor: COLORS.panel,
            flexGrow: props.layout === "stacked" ? 2 : 0,
            width: props.layout === "side-by-side" ? props.listWidth : "100%",
            paddingLeft: 1,
            paddingRight: 1,
          }}
        >
          <IssueList
            items={props.presentation.items}
            selectedIndex={props.selectedIndex}
            focused={props.focus === "list"}
            width={props.listWidth}
            onSelect={props.onSelectRow}
            loadingMore={props.loadingMore}
            {...(props.presentation.section.columns
              ? { columns: props.presentation.section.columns }
              : {})}
          />
          {props.boxOverlay?.("list")}
        </box>
      ) : null}
      {showPreview ? (
        <box
          id="git-issue-preview-panel"
          style={{
            ...focusedPanelBorder(props.focus === "preview", COLORS.git),
            backgroundColor: COLORS.panel,
            flexGrow: 1,
            width: props.layout === "side-by-side" ? props.previewWidth : "100%",
            paddingLeft: 1,
            paddingRight: 1,
          }}
        >
          <IssuePreviewPane
            item={selected}
            details={props.details}
            activeTab={props.previewTab}
            focused={props.paginationActive && props.focus === "preview"}
            width={props.previewWidth}
            scrollOffset={props.previewScrollOffset}
            descriptionExpanded={props.descriptionExpanded}
            selectedCommentIndex={props.selectedCommentIndex}
            loadingMore={props.loadingMoreDetails}
            onTabChange={props.onPreviewTab}
            onToggleDescription={props.onToggleDescription}
            onOpenBrowser={props.onOpenBrowser}
            onCopyUrl={props.onCopyUrl}
            onCopyNumber={props.onCopyNumber}
            onLoadMore={props.onLoadMoreDetails}
            onSelectComment={props.onSelectComment}
            onReactComment={props.onReactComment}
            onReplyComment={props.onReplyComment}
          />
          {props.boxOverlay?.("preview")}
        </box>
      ) : null}
    </box>
  )
}

export function IssueDashboardView({
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
  details,
  previewScrollOffset,
  descriptionExpanded,
  selectedCommentIndex,
  loadingMoreDetails,
  loadingMore,
  refreshing,
  terminalWidth,
  onSelectRow,
  onPreviewTab,
  onToggleDescription,
  onOpenBrowser,
  onCopyUrl,
  onCopyNumber,
  onOpenActions,
  onCreate,
  canCreate,
  onLoadMoreDetails,
  onSelectComment,
  onReactComment,
  onReplyComment,
  onSelectSection,
  onEditQuery,
  onRetry,
  boxOverlay,
}: IssuePanelsProps & {
  active: boolean
  dashboard: IssueDashboardState
  refreshing: boolean
  terminalWidth: number
  onSelectSection: (index: number) => void
  onEditQuery: () => void
  onCreate: () => void
  onOpenActions: () => void
  canCreate: boolean
  onRetry: () => void
}) {
  const background = LAYOUT.workspaceBackground
  return (
    <box
      id="git-issue-dashboard"
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
      <IssueDashboardHeader
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
        <IssuePanels
          paginationActive={paginationActive}
          presentation={presentation}
          layout={layout}
          focus={focus}
          selectedIndex={selectedIndex}
          previewTab={previewTab}
          listWidth={listWidth}
          previewWidth={previewWidth}
          details={details}
          previewScrollOffset={previewScrollOffset}
          descriptionExpanded={descriptionExpanded}
          selectedCommentIndex={selectedCommentIndex}
          loadingMoreDetails={loadingMoreDetails}
          loadingMore={loadingMore}
          onSelectRow={onSelectRow}
          onPreviewTab={onPreviewTab}
          onToggleDescription={onToggleDescription}
          onOpenBrowser={onOpenBrowser}
          onCopyUrl={onCopyUrl}
          onCopyNumber={onCopyNumber}
          onLoadMoreDetails={onLoadMoreDetails}
          onSelectComment={onSelectComment}
          onReactComment={onReactComment}
          onReplyComment={onReplyComment}
          boxOverlay={boxOverlay}
        />
      ) : (
        <IssueDashboardStatePanel active={active} state={dashboard} onRetry={onRetry} />
      )}
      <PlasmaLoadingOverlay
        active={dashboard.status === "loading" || dashboard.status === "idle"}
        label="CARREGANDO GITHUB…"
        detail="Buscando issues da sua conta"
        accent={COLORS.git}
        background={background}
      />
    </box>
  )
}
