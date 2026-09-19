import { COLORS, focusedPanelBorder, LAYOUT } from "@xupon/tuiminal-core/settings/theme"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { PlasmaLoadingOverlay } from "@xupon/tuiminal-core/ui/PlasmaLoadingOverlay"
import { ShortcutText } from "@xupon/tuiminal-core/ui/ShortcutText"
import type { IssuePreviewConfig } from "../../model/issue/config"
import type { IssueFocus, IssueLayoutMode } from "../../model/issue/navigation"
import type { IssueComment, IssuePreviewTab } from "../../model/issue/types"
import { IssueDashboardStatePanel } from "./IssueDashboardStatePanel"
import { IssueList } from "./IssueList"
import { IssuePreviewPane } from "./IssuePreviewPane"
import { IssueDashboardHeader } from "./IssueDashboardHeader"
import type { IssueDashboardPresentation } from "./presentation"
import type { IssueDashboardState } from "./useIssueDashboard"
import type { IssueDetailsState } from "./useIssueDetails"

type IssuePanelsProps = {
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
  onOpenActions: () => void
  onLoadMoreDetails: () => void
  onSelectComment: (index: number) => void
  onReactComment: (comment: IssueComment) => void
  onReplyComment: (comment: IssueComment) => void
  loadingMore: boolean
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
            focused={props.focus === "preview"}
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
            onOpenActions={props.onOpenActions}
            onLoadMore={props.onLoadMoreDetails}
            onSelectComment={props.onSelectComment}
            onReactComment={props.onReactComment}
            onReplyComment={props.onReplyComment}
          />
        </box>
      ) : null}
    </box>
  )
}

export function IssueDashboardView({
  active,
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
  previewPosition,
  previewVisible,
  notice,
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
  onLoadMore,
  onCyclePreviewPosition,
  onTogglePreview,
}: IssuePanelsProps & {
  active: boolean
  dashboard: IssueDashboardState
  previewPosition: IssuePreviewConfig["position"]
  previewVisible: boolean
  notice: string
  refreshing: boolean
  terminalWidth: number
  onSelectSection: (index: number) => void
  onEditQuery: () => void
  onCreate: () => void
  canCreate: boolean
  onRetry: () => void
  onLoadMore: () => void
  onCyclePreviewPosition: () => void
  onTogglePreview: () => void
}) {
  const background = LAYOUT.workspaceBackground
  return (
    <box
      id="git-issue-dashboard"
      style={{
        position: "relative",
        flexGrow: 1,
        backgroundColor: background,
        padding: LAYOUT.outerPadding,
        gap: 0,
      }}
    >
      <IssueDashboardHeader
        presentation={presentation}
        terminalWidth={terminalWidth}
        refreshing={refreshing}
        demo={dashboard.status === "demo"}
        canCreate={canCreate}
        previewVisible={previewVisible}
        previewPosition={previewPosition}
        onCreate={onCreate}
        onSelectSection={onSelectSection}
        onEditQuery={onEditQuery}
        onTogglePreview={onTogglePreview}
        onCyclePreviewPosition={onCyclePreviewPosition}
      />
      {presentation.showDashboard ? (
        <IssuePanels
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
          onOpenActions={onOpenActions}
          onLoadMoreDetails={onLoadMoreDetails}
          onSelectComment={onSelectComment}
          onReactComment={onReactComment}
          onReplyComment={onReplyComment}
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
      {dashboard.status === "ready" && dashboard.hasNextPage ? (
        <InlineButton
          id="git-issue-load-more"
          label={translateUi(loadingMore ? "[N] Carregando…" : "[N] Carregar mais")}
          accent={COLORS.git}
          disabled={loadingMore}
          onPress={onLoadMore}
        />
      ) : null}
      <box
        style={{ height: 1, flexShrink: 0, flexDirection: "row", justifyContent: "space-between" }}
      >
        <ShortcutText
          content={translateUi(
            "[J/K] Navegar  [H/L] Foco  [A←] [F→] Seção  [Z←] [V→] Aba  [P] Prévia  [?] Ações",
          )}
          style={{ fg: COLORS.muted }}
        />
        {notice ? <text content={notice} style={{ fg: COLORS.danger }} /> : null}
      </box>
    </box>
  )
}
