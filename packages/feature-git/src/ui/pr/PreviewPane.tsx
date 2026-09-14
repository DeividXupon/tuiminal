import type { ScrollBoxRenderable } from "@opentui/core"
import { useEffect, useRef } from "react"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { DirectionalButton } from "@xupon/tuiminal-core/ui/DirectionalButton"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { PlasmaLoadingOverlay } from "@xupon/tuiminal-core/ui/PlasmaLoadingOverlay"
import { nextPullRequestDetailConnection } from "../../model/pr/detail-pagination"
import { adjacentPreviewTab, PULL_REQUEST_PREVIEW_TABS } from "../../model/pr/navigation"
import type {
  PullRequestComment,
  PullRequestPreviewTab,
  PullRequestSummary,
} from "../../model/pr/types"
import type { PullRequestWorkflowRun } from "../../model/pr/workflows"
import { PreviewTabContent } from "./PreviewTabContent"
import type { PullRequestDetailsState } from "./usePullRequestDetails"

const TAB_LABELS: Record<PullRequestPreviewTab, string> = {
  overview: "VISÃO GERAL",
  checks: "CHECKS",
  activity: "ATIVIDADE",
  commits: "COMMITS",
  files: "ARQUIVOS",
}

const STATE_LABELS: Record<PullRequestSummary["state"], string> = {
  open: "ABERTO",
  draft: "RASCUNHO",
  merged: "MESCLADO",
  closed: "FECHADO",
}

function DetailsState({
  state,
  tab,
  width,
  descriptionExpanded,
  selectedItemIndex,
  onToggleDescription,
  onCopySha,
  onSelectItem,
  workflows,
  workflowError,
  onOpenWorkflow,
  onReactComment,
  onReplyComment,
}: {
  state: PullRequestDetailsState
  tab: PullRequestPreviewTab
  width: number
  descriptionExpanded: boolean
  selectedItemIndex: number
  onToggleDescription: () => void
  onCopySha: (sha: string) => void
  onSelectItem: (index: number) => void
  workflows: PullRequestWorkflowRun[]
  workflowError: string
  onOpenWorkflow: (runId: number) => void
  onReactComment: (comment: PullRequestComment) => void
  onReplyComment: (comment: PullRequestComment) => void
}) {
  if (state.status === "loading") {
    return <text content={translateUi("CARREGANDO DETALHES…")} style={{ fg: COLORS.muted }} />
  }
  if (state.status === "not-found") {
    return <text content={translateUi("O PR não foi encontrado.")} style={{ fg: COLORS.warning }} />
  }
  if (state.status === "error") {
    return (
      <text content={`${translateUi("ERRO")}: ${state.message}`} style={{ fg: COLORS.danger }} />
    )
  }
  if (state.status !== "ready") return null
  return (
    <PreviewTabContent
      tab={tab}
      details={state.details}
      width={width}
      descriptionExpanded={descriptionExpanded}
      selectedItemIndex={selectedItemIndex}
      onToggleDescription={onToggleDescription}
      onCopySha={onCopySha}
      onSelectItem={onSelectItem}
      workflows={workflows}
      workflowError={workflowError}
      onOpenWorkflow={onOpenWorkflow}
      onReactComment={onReactComment}
      onReplyComment={onReplyComment}
    />
  )
}

export function PreviewPane({
  item,
  details,
  activeTab,
  focused,
  width,
  scrollOffset,
  descriptionExpanded,
  selectedItemIndex,
  onTabChange,
  onToggleDescription,
  onCopySha,
  onSelectItem,
  onOpenBrowser,
  onCopyUrl,
  onCopyNumber,
  onOpenDiff,
  onOpenActions,
  watching,
  onToggleWatch,
  loadingMore,
  onLoadMore,
  workflows,
  workflowError,
  onOpenWorkflow,
  onReactComment,
  onReplyComment,
}: {
  item: PullRequestSummary | null
  details: PullRequestDetailsState
  activeTab: PullRequestPreviewTab
  focused: boolean
  width: number
  scrollOffset: number
  descriptionExpanded: boolean
  selectedItemIndex: number
  onTabChange: (tab: PullRequestPreviewTab) => void
  onToggleDescription: () => void
  onCopySha: (sha: string) => void
  onSelectItem: (index: number) => void
  onOpenBrowser: () => void
  onCopyUrl: () => void
  onCopyNumber: () => void
  onOpenDiff: () => void
  onOpenActions: () => void
  watching: boolean
  onToggleWatch: () => void
  loadingMore: boolean
  onLoadMore: () => void
  workflows: PullRequestWorkflowRun[]
  workflowError: string
  onOpenWorkflow: (runId: number) => void
  onReactComment: (comment: PullRequestComment) => void
  onReplyComment: (comment: PullRequestComment) => void
}) {
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)
  useEffect(() => {
    scrollRef.current?.scrollTo({ x: 0, y: scrollOffset })
  }, [scrollOffset])
  if (!item) {
    return <text content={translateUi("Nenhum PR nesta seção.")} style={{ fg: COLORS.muted }} />
  }
  const identity = `${item.identity.owner}/${item.identity.repository} #${item.identity.number}`
  const canLoadMore =
    details.status === "ready" &&
    Boolean(nextPullRequestDetailConnection(details.details, activeTab))
  return (
    <box
      style={{
        position: "relative",
        flexGrow: 1,
        width: "100%",
        flexDirection: "column",
        backgroundColor: COLORS.panel,
      }}
    >
      <text
        content={truncateDisplay(identity, Math.max(10, width - 2))}
        style={{ height: 1, flexShrink: 0, fg: focused ? COLORS.git : COLORS.text }}
      />
      <text
        content={truncateDisplay(item.title, Math.max(10, width - 2))}
        style={{ height: 1, flexShrink: 0, fg: COLORS.text }}
      />
      <text
        content={`${translateUi(STATE_LABELS[item.state])} · ${item.baseBranch} ← ${item.headBranch} · ${item.headSha.slice(0, 10)}`}
        style={{ height: 1, flexShrink: 0, fg: COLORS.muted }}
      />
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
        {focused ? (
          <DirectionalButton
            id="git-pr-preview-tab-previous"
            direction={-1}
            level="nested"
            accent={COLORS.git}
            onPress={() => onTabChange(adjacentPreviewTab(activeTab, -1))}
          />
        ) : null}
        {PULL_REQUEST_PREVIEW_TABS.map((tab) => (
          <InlineButton
            key={tab}
            id={`git-pr-preview-tab-${tab}`}
            label={TAB_LABELS[tab]}
            active={tab === activeTab}
            accent={COLORS.git}
            onPress={() => onTabChange(tab)}
          />
        ))}
        {focused ? (
          <DirectionalButton
            id="git-pr-preview-tab-next"
            direction={1}
            level="nested"
            accent={COLORS.git}
            onPress={() => onTabChange(adjacentPreviewTab(activeTab, 1))}
          />
        ) : null}
      </box>
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
        <InlineButton
          id="git-pr-open-browser"
          label={translateUi("[O] Abrir")}
          accent={COLORS.git}
          onPress={onOpenBrowser}
        />
        <InlineButton
          id="git-pr-copy-number"
          label={translateUi("[Y] Copiar nº")}
          accent={COLORS.git}
          onPress={onCopyNumber}
        />
        <InlineButton
          id="git-pr-copy-url"
          label={translateUi("[Shift+Y] URL")}
          accent={COLORS.git}
          onPress={onCopyUrl}
        />
        <InlineButton
          id="git-pr-open-diff"
          label={translateUi("[D] Diff")}
          accent={COLORS.git}
          onPress={onOpenDiff}
        />
        <InlineButton
          id="git-pr-open-actions"
          label={translateUi("[?] Ações")}
          accent={COLORS.git}
          onPress={onOpenActions}
        />
        <InlineButton
          id="git-pr-toggle-watch"
          label={translateUi(watching ? "[W] Parar CI" : "[W] Acompanhar CI")}
          accent={COLORS.git}
          active={watching}
          onPress={onToggleWatch}
        />
      </box>
      <scrollbox
        key={`${item.identity.nodeId}:${activeTab}`}
        ref={scrollRef}
        scrollY
        viewportCulling
        style={{ flexGrow: 1, width: "100%" }}
      >
        <DetailsState
          state={details}
          tab={activeTab}
          width={width}
          descriptionExpanded={descriptionExpanded}
          selectedItemIndex={selectedItemIndex}
          onToggleDescription={onToggleDescription}
          onCopySha={onCopySha}
          onSelectItem={onSelectItem}
          workflows={workflows}
          workflowError={workflowError}
          onOpenWorkflow={onOpenWorkflow}
          onReactComment={onReactComment}
          onReplyComment={onReplyComment}
        />
        {canLoadMore ? (
          <InlineButton
            label={translateUi(loadingMore ? "[N] Carregando…" : "[N] Carregar mais")}
            accent={COLORS.git}
            disabled={loadingMore}
            onPress={onLoadMore}
          />
        ) : null}
      </scrollbox>
      <PlasmaLoadingOverlay
        active={details.status === "loading"}
        label="CARREGANDO DETALHES…"
        accent={COLORS.git}
      />
    </box>
  )
}
