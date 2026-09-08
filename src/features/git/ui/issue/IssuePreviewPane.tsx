import type { ScrollBoxRenderable } from "@opentui/core"
import { useEffect, useRef } from "react"
import { COLORS } from "../../../../core/settings/theme"
import { formatUiDateTime, translateUi, truncateDisplay } from "../../../../shared/i18n"
import { InlineButton } from "../../../../shared/ui/InlineButton"
import { PlasmaLoadingOverlay } from "../../../../shared/ui/PlasmaLoadingOverlay"
import { pullRequestMarkdownLines } from "../../model/pr/content"
import { ISSUE_PREVIEW_TABS } from "../../model/issue/navigation"
import type { IssueDetails, IssuePreviewTab, IssueSummary } from "../../model/issue/types"
import { PullRequestMarkdown } from "../../rendering/pr-markdown"
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
        content={`${translateUi("Reações")}: ${details.reactionCount} · ${translateUi("Comentários")}: ${details.commentPage.totalCount ?? details.comments.length}`}
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

function Activity({ details }: { details: IssueDetails }) {
  const comments = [...details.comments].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  )
  return (
    <box style={{ width: "100%" }}>
      {comments.length ? (
        comments.map((comment) => (
          <box key={comment.id} style={{ width: "100%", marginBottom: 1 }}>
            <text
              content={`@${comment.author.login} · ${formatUiDateTime(comment.createdAt, { dateStyle: "short", timeStyle: "short" })} · ♥ ${comment.reactionCount}`}
              style={{ fg: COLORS.git }}
            />
            <PullRequestMarkdown lines={pullRequestMarkdownLines(comment.body)} />
          </box>
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
}: {
  state: IssueDetailsState
  tab: IssuePreviewTab
  expanded: boolean
  onToggle: () => void
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
    <Activity details={state.details} />
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
  onTabChange,
  onToggleDescription,
  onOpenBrowser,
  onCopyUrl,
  onCopyNumber,
  onOpenActions,
  onLoadMore,
}: {
  item: IssueSummary | null
  details: IssueDetailsState
  activeTab: IssuePreviewTab
  focused: boolean
  width: number
  scrollOffset: number
  descriptionExpanded: boolean
  loadingMore: boolean
  onTabChange: (tab: IssuePreviewTab) => void
  onToggleDescription: () => void
  onOpenBrowser: () => void
  onCopyUrl: () => void
  onCopyNumber: () => void
  onOpenActions: () => void
  onLoadMore: () => void
}) {
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)
  useEffect(() => {
    scrollRef.current?.scrollTo({ x: 0, y: scrollOffset })
  }, [scrollOffset])
  if (!item)
    return <text content={translateUi("Nenhuma issue nesta seção.")} style={{ fg: COLORS.muted }} />
  const identity = `${item.identity.owner}/${item.identity.repository} #${item.identity.number}`
  const canLoadMore = details.status === "ready" && details.details.commentPage.hasNextPage
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
        <InlineButton
          id="git-issue-open-actions"
          label={translateUi("[?] Ações")}
          accent={COLORS.git}
          onPress={onOpenActions}
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
          expanded={descriptionExpanded}
          onToggle={onToggleDescription}
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
