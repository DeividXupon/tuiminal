import type { ScrollBoxRenderable } from "@opentui/core"
import { formatUiDateTime, translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { DirectionalButton } from "@xupon/tuiminal-core/ui/DirectionalButton"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { PlasmaLoadingOverlay } from "@xupon/tuiminal-core/ui/PlasmaLoadingOverlay"
import { useRef } from "react"
import { issueCommentThread } from "../../model/issue/activity"
import { adjacentIssuePreviewTab, ISSUE_PREVIEW_TABS } from "../../model/issue/navigation"
import type {
  IssueComment,
  IssueDetails,
  IssuePreviewTab,
  IssueSummary,
} from "../../model/issue/types"
import { pullRequestMarkdownLines } from "../../model/pr/content"
import { githubReactionSummary } from "../../model/reactions"
import { PullRequestMarkdown } from "../../rendering/pr-markdown"
import { GitHubActivityComment } from "../shared/GitHubActivityItem"
import { useActivitySelection } from "../shared/useActivitySelection"
import { usePreviewPagination } from "../shared/usePreviewPagination"
import { usePreviewScroll } from "../shared/usePreviewScroll"
import type { IssueDetailsState } from "./useIssueDetails"

const TAB_LABELS: Record<IssuePreviewTab, string> = {
  overview: "VISÃO GERAL",
  activity: "ATIVIDADE",
}

function Overview({
  details,
  expanded,
  onToggle,
}: {
  details: IssueDetails
  expanded: boolean
  onToggle: () => void
}) {
  const lines = pullRequestMarkdownLines(details.body)
  const visible = expanded ? lines : lines.slice(0, 10)
  const assignees = details.assignees.length
    ? details.assignees.map((actor) => `@${actor.login}`).join(", ")
    : translateUi("sem responsáveis")
  const labels = details.labels.length
    ? details.labels.map((label) => label.name).join(", ")
    : translateUi("sem labels")
  return (
    <box style={{ width: "100%" }}>
      <text content={translateUi("DESCRIÇÃO")} style={{ fg: COLORS.git }} />
      {visible.length ? (
        <PullRequestMarkdown lines={visible} />
      ) : (
        <text
          content={translateUi("Esta issue não possui descrição.")}
          style={{ fg: COLORS.muted }}
        />
      )}
      {lines.length > 10 ? (
        <InlineButton
          label={translateUi(expanded ? "[E] Recolher descrição" : "[E] Expandir descrição")}
          accent={COLORS.git}
          onPress={onToggle}
        />
      ) : null}
      <text content={translateUi("DETALHES")} style={{ fg: COLORS.git, marginTop: 1 }} />
      <text
        content={`${translateUi("Autor")}: @${details.author.login}`}
        style={{ fg: COLORS.text }}
      />
      <text content={`${translateUi("Responsáveis")}: ${assignees}`} style={{ fg: COLORS.text }} />
      <text content={`${translateUi("Labels")}: ${labels}`} style={{ fg: COLORS.text }} />
      <text
        content={`${translateUi("Reações")}: ${githubReactionSummary(details.reactionGroups) || details.reactionCount} · ${translateUi("Comentários")}: ${details.commentPage.totalCount ?? details.comments.length}`}
        style={{ fg: COLORS.text }}
      />
      <text
        content={`${translateUi("Criada em")}: ${formatUiDateTime(details.createdAt, { dateStyle: "short", timeStyle: "short" })}`}
        style={{ fg: COLORS.muted }}
      />
      <text
        content={`${translateUi("Atualizada em")}: ${formatUiDateTime(details.updatedAt, { dateStyle: "short", timeStyle: "short" })}`}
        style={{ fg: COLORS.muted }}
      />
    </box>
  )
}

export function IssueActivityContent({
  details,
  selectedIndex,
  onSelect,
  onReact,
  onReply,
  idPrefix = "git-issue-activity",
}: {
  details: IssueDetails
  selectedIndex: number
  onSelect: (index: number) => void
  onReact: (comment: IssueComment) => void
  onReply: (comment: IssueComment) => void
  idPrefix?: string
}) {
  const comments = issueCommentThread(details.comments, details.identity)
  return (
    <box style={{ width: "100%" }}>
      {comments.length ? (
        comments.map((entry, index) => (
          <GitHubActivityComment
            key={entry.comment.id}
            id={`${idPrefix}-${index}`}
            entry={entry}
            selected={index === selectedIndex}
            onSelect={() => onSelect(index)}
            onReact={onReact}
            onReply={onReply}
          />
        ))
      ) : (
        <text
          content={translateUi("Esta issue ainda não possui comentários.")}
          style={{ fg: COLORS.muted }}
        />
      )}
      {details.commentPage.hasNextPage ? (
        <text
          content={`${details.comments.length}/${details.commentPage.totalCount ?? "?"} · ${translateUi("há mais itens para carregar")}`}
          style={{ fg: COLORS.warning }}
        />
      ) : null}
    </box>
  )
}

function DetailsState({
  state,
  tab,
  expanded,
  onToggle,
  selectedCommentIndex,
  onSelectComment,
  onReactComment,
  onReplyComment,
}: {
  state: IssueDetailsState
  tab: IssuePreviewTab
  expanded: boolean
  onToggle: () => void
  selectedCommentIndex: number
  onSelectComment: (index: number) => void
  onReactComment: (comment: IssueComment) => void
  onReplyComment: (comment: IssueComment) => void
}) {
  if (state.status === "loading")
    return <text content={translateUi("CARREGANDO DETALHES…")} style={{ fg: COLORS.muted }} />
  if (state.status === "not-found")
    return (
      <text content={translateUi("A issue não foi encontrada.")} style={{ fg: COLORS.warning }} />
    )
  if (state.status === "error")
    return (
      <text content={`${translateUi("ERRO")}: ${state.message}`} style={{ fg: COLORS.danger }} />
    )
  if (state.status !== "ready") return null
  return tab === "overview" ? (
    <Overview details={state.details} expanded={expanded} onToggle={onToggle} />
  ) : (
    <IssueActivityContent
      details={state.details}
      selectedIndex={selectedCommentIndex}
      onSelect={onSelectComment}
      onReact={onReactComment}
      onReply={onReplyComment}
    />
  )
}

export function IssuePreviewPane({
  item,
  details,
  activeTab,
  focused,
  width,
  scrollOffset,
  descriptionExpanded,
  loadingMore,
  selectedCommentIndex,
  onTabChange,
  onToggleDescription,
  onOpenBrowser,
  onCopyUrl,
  onCopyNumber,
  onLoadMore,
  onSelectComment,
  onReactComment,
  onReplyComment,
}: {
  item: IssueSummary | null
  details: IssueDetailsState
  activeTab: IssuePreviewTab
  focused: boolean
  width: number
  scrollOffset: number
  descriptionExpanded: boolean
  loadingMore: boolean
  selectedCommentIndex: number
  onTabChange: (tab: IssuePreviewTab) => void
  onToggleDescription: () => void
  onOpenBrowser: () => void
  onCopyUrl: () => void
  onCopyNumber: () => void
  onLoadMore: () => void
  onSelectComment: (index: number) => void
  onReactComment: (comment: IssueComment) => void
  onReplyComment: (comment: IssueComment) => void
}) {
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)
  useActivitySelection(
    scrollRef,
    activeTab === "activity" && details.status === "ready"
      ? `git-issue-activity-${selectedCommentIndex}`
      : null,
    item?.identity.nodeId,
  )
  usePreviewScroll(scrollRef, scrollOffset, `${item?.identity.nodeId}:${activeTab}`)
  const pageKey =
    details.status === "ready" &&
    activeTab === "activity" &&
    details.details.commentPage.hasNextPage
      ? JSON.stringify([item?.identity.nodeId, activeTab, details.details.commentPage.endCursor])
      : null
  usePreviewPagination({
    scroll: scrollRef,
    pageKey,
    enabled: focused,
    loading: loadingMore,
    selectedIndex: selectedCommentIndex,
    itemCount: details.status === "ready" ? details.details.comments.length : 0,
    onLoadMore,
  })
  if (!item)
    return <text content={translateUi("Nenhuma issue nesta seção.")} style={{ fg: COLORS.muted }} />
  const identity = `${item.identity.owner}/${item.identity.repository} #${item.identity.number}`
  return (
    <box
      style={{
        position: "relative",
        flexGrow: 1,
        width: "100%",
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
        content={`${translateUi(item.state === "open" ? "ABERTA" : "FECHADA")} · @${item.author.login} · ${formatUiDateTime(item.updatedAt, { dateStyle: "short", timeStyle: "short" })}`}
        style={{ height: 1, flexShrink: 0, fg: COLORS.muted }}
      />
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
        {focused ? (
          <DirectionalButton
            id="git-issue-preview-tab-previous"
            direction={-1}
            level="nested"
            accent={COLORS.git}
            onPress={() => onTabChange(adjacentIssuePreviewTab(activeTab, -1))}
          />
        ) : null}
        {ISSUE_PREVIEW_TABS.map((tab) => (
          <InlineButton
            key={tab}
            id={`git-issue-preview-tab-${tab}`}
            label={translateUi(TAB_LABELS[tab])}
            active={tab === activeTab}
            accent={COLORS.git}
            onPress={() => onTabChange(tab)}
          />
        ))}
        {focused ? (
          <DirectionalButton
            id="git-issue-preview-tab-next"
            direction={1}
            level="nested"
            accent={COLORS.git}
            onPress={() => onTabChange(adjacentIssuePreviewTab(activeTab, 1))}
          />
        ) : null}
      </box>
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
        <InlineButton
          id="git-issue-open-browser"
          label={translateUi("[O] Abrir")}
          accent={COLORS.git}
          onPress={onOpenBrowser}
        />
        <InlineButton
          id="git-issue-copy-number"
          label={translateUi("[Y] Copiar nº")}
          accent={COLORS.git}
          onPress={onCopyNumber}
        />
        <InlineButton
          id="git-issue-copy-url"
          label={translateUi("[Shift+Y] URL")}
          accent={COLORS.git}
          onPress={onCopyUrl}
        />
      </box>
      <scrollbox
        id="git-issue-preview-scroll"
        key={`${item.identity.nodeId}:${activeTab}`}
        ref={scrollRef}
        scrollY
        viewportCulling
        style={{ flexGrow: 1, width: "100%" }}
      >
        <DetailsState
          state={details}
          tab={activeTab}
          expanded={descriptionExpanded}
          onToggle={onToggleDescription}
          selectedCommentIndex={selectedCommentIndex}
          onSelectComment={onSelectComment}
          onReactComment={onReactComment}
          onReplyComment={onReplyComment}
        />
        {loadingMore ? (
          <text content={translateUi("CARREGANDO DETALHES…")} style={{ fg: COLORS.muted }} />
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
