import { COLORS, focusedPanelBorder, LAYOUT, panelBorder } from "../../../../core/settings/theme"
import { translateUi } from "../../../../shared/i18n"
import { InlineButton } from "../../../../shared/ui/InlineButton"
import { PlasmaLoadingOverlay } from "../../../../shared/ui/PlasmaLoadingOverlay"
import { ShortcutText } from "../../../../shared/ui/ShortcutText"
import type { IssuePreviewConfig } from "../../model/issue/config"
import type { IssueFocus, IssueLayoutMode } from "../../model/issue/navigation"
import type { IssuePreviewTab } from "../../model/issue/types"
import { IssueDashboardStatePanel } from "./IssueDashboardStatePanel"
import { IssueList } from "./IssueList"
import { IssuePreviewPane } from "./IssuePreviewPane"
import { IssueSectionStrip } from "./IssueSectionStrip"
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
  loadingMoreDetails: boolean
  onSelectRow: (index: number) => void
  onPreviewTab: (tab: IssuePreviewTab) => void
  onToggleDescription: () => void
  onOpenBrowser: () => void
  onCopyUrl: () => void
  onCopyNumber: () => void
  onOpenActions: () => void
  onLoadMoreDetails: () => void
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
            loadingMore={props.loadingMoreDetails}
            onTabChange={props.onPreviewTab}
            onToggleDescription={props.onToggleDescription}
            onOpenBrowser={props.onOpenBrowser}
            onCopyUrl={props.onCopyUrl}
            onCopyNumber={props.onCopyNumber}
            onOpenActions={props.onOpenActions}
            onLoadMore={props.onLoadMoreDetails}
          />
        </box>
      ) : null}
    </box>
  )
}

export function IssueDashboardView({
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
  loadingMoreDetails,
  previewPosition,
  previewVisible,
  notice,
  loadingMore,
  refreshing,
  onSelectRow,
  onPreviewTab,
  onToggleDescription,
  onOpenBrowser,
  onCopyUrl,
  onCopyNumber,
  onOpenActions,
  onLoadMoreDetails,
  onSelectSection,
  onEditQuery,
  onRetry,
  onLoadMore,
  onCyclePreviewPosition,
  onTogglePreview,
}: IssuePanelsProps & {
  dashboard: IssueDashboardState
  previewPosition: IssuePreviewConfig["position"]
  previewVisible: boolean
  notice: string
  refreshing: boolean
  onSelectSection: (index: number) => void
  onEditQuery: () => void
  onRetry: () => void
  onLoadMore: () => void
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
        <InlineButton
          id="git-issue-toggle-preview"
          label={`[P] ${translateUi("Prévia")}: ${translateUi(previewVisible ? "visível" : "oculta")}`}
          accent={COLORS.git}
          onPress={onTogglePreview}
        />
        <InlineButton
          id="git-issue-preview-position"
          label={`[Shift+P] ${translateUi("Posição")}: ${translateUi(previewPosition)}`}
          accent={COLORS.git}
          onPress={onCyclePreviewPosition}
        />
      </box>
      <IssueSectionStrip
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
          id="git-issue-query"
          label={`[/] ${presentation.section.query}`}
          accent={COLORS.git}
          onPress={onEditQuery}
        />
        <text content={translateUi(presentation.scope)} style={{ fg: COLORS.muted }} />
      </box>
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
        />
      ) : (
        <IssueDashboardStatePanel state={dashboard} onRetry={onRetry} />
      )}
      <PlasmaLoadingOverlay
        active={dashboard.status === "loading" || dashboard.status === "idle"}
        label="CARREGANDO GITHUB…"
        detail="Buscando issues da sua conta"
        accent={COLORS.git}
        background={COLORS.canvas}
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
            "[J/K] Navegar  [H/L] Foco  [</>] Seção  [[]/[]] Aba  [P] Prévia  [?] Ações",
          )}
          style={{ fg: COLORS.muted }}
        />
        {notice ? <text content={notice} style={{ fg: COLORS.danger }} /> : null}
      </box>
    </box>
  )
}
