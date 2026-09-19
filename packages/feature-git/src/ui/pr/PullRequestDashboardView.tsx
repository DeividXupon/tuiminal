import {
  COLORS,
  focusedPanelBorder,
  LAYOUT,
  panelBorder,
} from "@xupon/tuiminal-core/settings/theme"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { PlasmaLoadingOverlay } from "@xupon/tuiminal-core/ui/PlasmaLoadingOverlay"
import { ShortcutText } from "@xupon/tuiminal-core/ui/ShortcutText"
import type { PullRequestPreviewConfig } from "../../model/pr/config"
import type { PullRequestFocus, PullRequestLayoutMode } from "../../model/pr/navigation"
import type { PullRequestComment, PullRequestPreviewTab } from "../../model/pr/types"
import type { PullRequestWorkflowRun } from "../../model/pr/workflows"
import { DashboardStatePanel } from "./DashboardStatePanel"
import { PreviewPane } from "./PreviewPane"
import { PullRequestList } from "./PullRequestList"
import type { PullRequestDashboardPresentation } from "./presentation"
import { SectionStrip } from "./SectionStrip"
import type { PullRequestDashboardState } from "./usePullRequestDashboard"
import type { PullRequestDetailsState } from "./usePullRequestDetails"

type DashboardPanelsProps = {
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
  onOpenActions: () => void
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
}

function DashboardPanels({
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
  onOpenActions,
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
            focused={focus === "preview"}
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
            onOpenActions={onOpenActions}
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
        </box>
      ) : null}
    </box>
  )
}

export function PullRequestDashboardView({
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
  onSelectSection,
  onEditQuery,
  notice,
  loadingMore,
  refreshing,
  onSelectRow,
  onPreviewTab,
  onRetry,
  onLoadMore,
  previewPosition,
  previewVisible,
  onCyclePreviewPosition,
  onTogglePreview,
}: DashboardPanelsProps & {
  active: boolean
  dashboard: PullRequestDashboardState
  onSelectSection: (index: number) => void
  onEditQuery: () => void
  onCreate: () => void
  canCreate: boolean
  notice: string
  refreshing: boolean
  onRetry: () => void
  onLoadMore: () => void
  previewPosition: PullRequestPreviewConfig["position"]
  previewVisible: boolean
  onCyclePreviewPosition: () => void
  onTogglePreview: () => void
}) {
  return (
    <box
      style={{
        position: "relative",
        flexGrow: 1,
        backgroundColor: COLORS.canvas,
        padding: LAYOUT.outerPadding,
        gap: LAYOUT.gap,
      }}
    >
      <box
        style={{
          ...panelBorder(),
          backgroundColor: COLORS.panel,
          height: 1,
          flexShrink: 0,
          flexDirection: "row",
          justifyContent: "space-between",
          paddingLeft: 1,
          paddingRight: 1,
        }}
      >
        <text content={translateUi(presentation.title)} style={{ fg: COLORS.git }} />
        <text
          content={`${translateUi(presentation.meta)}${refreshing ? ` · ${translateUi("ATUALIZANDO TODAS AS SEÇÕES…")}` : ""}`}
          style={{ fg: dashboard.status === "demo" ? COLORS.warning : COLORS.muted }}
        />
      </box>
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row", justifyContent: "flex-end" }}>
        {canCreate ? (
          <InlineButton
            id="git-pr-create"
            label={translateUi("[Ctrl+N] Criar PR")}
            accent={COLORS.git}
            onPress={onCreate}
          />
        ) : null}
        <InlineButton
          id="git-pr-toggle-preview"
          label={`[P] ${translateUi("Prévia")}: ${translateUi(previewVisible ? "visível" : "oculta")}`}
          accent={COLORS.git}
          onPress={onTogglePreview}
        />
        <InlineButton
          id="git-pr-preview-position"
          label={`[Shift+P] ${translateUi("Posição")}: ${translateUi(previewPosition)}`}
          accent={COLORS.git}
          onPress={onCyclePreviewPosition}
        />
      </box>
      <SectionStrip
        sections={presentation.sections}
        activeIndex={presentation.sections.indexOf(presentation.section)}
        counts={presentation.counts}
        onSelect={onSelectSection}
      />
      <box
        style={{
          height: 1,
          flexShrink: 0,
          flexDirection: "row",
          justifyContent: "space-between",
          backgroundColor: COLORS.panel,
        }}
      >
        <InlineButton
          id="git-pr-query"
          label={`[/] ${presentation.section.query}`}
          accent={COLORS.git}
          onPress={onEditQuery}
        />
        <text content={translateUi(presentation.scope)} style={{ fg: COLORS.muted }} />
      </box>
      {presentation.showDashboard ? (
        <DashboardPanels
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
          onOpenActions={onOpenActions}
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
        />
      ) : (
        <DashboardStatePanel active={active} state={dashboard} onRetry={onRetry} />
      )}
      <PlasmaLoadingOverlay
        active={dashboard.status === "loading" || dashboard.status === "idle"}
        label="CARREGANDO GITHUB…"
        accent={COLORS.git}
        background={COLORS.canvas}
      />
      {dashboard.status === "ready" && dashboard.hasNextPage ? (
        <InlineButton
          id="git-pr-load-more"
          label={loadingMore ? "[N] Carregando…" : "[N] Carregar mais"}
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
            "[J/K] Navegar  [H/L] Foco  [A←] [F→] Seção  [Z←] [V→] Aba  [P] Prévia  [D] Diff  [?] Ações",
          )}
          style={{ fg: COLORS.muted }}
        />
        {notice ? <text content={notice} style={{ fg: COLORS.danger }} /> : null}
      </box>
    </box>
  )
}
