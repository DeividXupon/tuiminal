import { Button } from "@tuiparts/react/button"
import { COLORS } from "../../../../core/settings/theme"
import { formatUiDateTime, translateUi, truncateDisplay } from "../../../../shared/i18n"
import { InlineButton } from "../../../../shared/ui/InlineButton"
import { pullRequestMarkdownLines } from "../../model/pr/content"
import { githubReactionSummary } from "../../model/reactions"
import type {
  PullRequestComment,
  PullRequestDetails,
  PullRequestPreviewTab,
} from "../../model/pr/types"
import type { PullRequestWorkflowRun } from "../../model/pr/workflows"
import { PullRequestMarkdown } from "../../rendering/pr-markdown"
import { PullRequestActivityContent } from "./PullRequestActivityContent"

function partialFooter(loaded: number, totalCount: number | null, hasNextPage: boolean) {
  if (!hasNextPage) return null
  return `${loaded}/${totalCount ?? "?"} · ${translateUi("há mais itens para carregar")}`
}

function OverviewContent({
  details,
  expanded,
  onToggle,
}: {
  details: PullRequestDetails
  expanded: boolean
  onToggle: () => void
}) {
  const bodyLines = pullRequestMarkdownLines(details.body)
  const visibleBody = expanded ? bodyLines : bodyLines.slice(0, 8)
  return (
    <box style={{ width: "100%" }}>
      <text content={translateUi("DESCRIÇÃO")} style={{ fg: COLORS.git }} />
      <PullRequestMarkdown lines={visibleBody} />
      {bodyLines.length > 8 ? (
        <InlineButton
          label={expanded ? "[E] Recolher descrição" : "[E] Expandir descrição"}
          accent={COLORS.git}
          onPress={onToggle}
        />
      ) : null}
      <text
        content={`${translateUi("Reações")}: ${githubReactionSummary(details.reactionGroups) || "0"}`}
        style={{ fg: COLORS.text, marginTop: 1 }}
      />
      <text
        content={translateUi("REVISÕES SOLICITADAS")}
        style={{ fg: COLORS.git, marginTop: 1 }}
      />
      {details.reviewRequests.length ? (
        details.reviewRequests.map((request) => (
          <text
            key={`${request.kind}:${request.login}`}
            content={`${request.kind === "team" ? "◆" : "◇"} ${request.login}${request.asCodeOwner ? ` · ${translateUi("CODE OWNER")}` : ""}`}
            style={{ fg: request.asCodeOwner ? COLORS.warning : COLORS.text }}
          />
        ))
      ) : (
        <text content={translateUi("Nenhuma revisão pendente.")} style={{ fg: COLORS.muted }} />
      )}
      <text content={translateUi("REVISÕES")} style={{ fg: COLORS.git, marginTop: 1 }} />
      {details.reviews.map((review) => (
        <text
          key={review.id}
          content={`@${review.author.login} · ${translateUi(review.state)} · ${review.commitSha.slice(0, 8)}`}
          style={{ fg: COLORS.text }}
        />
      ))}
      {partialFooter(
        details.reviewRequests.length,
        details.pages.reviewRequests.totalCount,
        details.pages.reviewRequests.hasNextPage,
      ) ? (
        <text
          content={
            partialFooter(
              details.reviewRequests.length,
              details.pages.reviewRequests.totalCount,
              details.pages.reviewRequests.hasNextPage,
            ) ?? ""
          }
          style={{ fg: COLORS.warning }}
        />
      ) : null}
    </box>
  )
}

function ChecksContent({
  details,
  workflows,
  workflowError,
  onOpenWorkflow,
}: {
  details: PullRequestDetails
  workflows: PullRequestWorkflowRun[]
  workflowError: string
  onOpenWorkflow: (runId: number) => void
}) {
  const actionableRuns = workflows.filter(
    (run) => run.eligibleForApproval || run.deploymentProtection,
  )
  return (
    <box style={{ width: "100%" }}>
      {details.checks.length ? (
        details.checks.map((check) => (
          <text
            key={check.id}
            content={`${check.state === "success" ? "✓" : check.state === "failure" ? "×" : "◷"} ${check.name} · ${check.provider} · ${translateUi(check.state)}`}
            style={{
              fg:
                check.state === "success"
                  ? COLORS.success
                  : check.state === "failure"
                    ? COLORS.danger
                    : COLORS.warning,
            }}
          />
        ))
      ) : (
        <text content={translateUi("Este PR não possui checks.")} style={{ fg: COLORS.muted }} />
      )}
      {actionableRuns.length ? (
        <box style={{ marginTop: 1, width: "100%" }}>
          <text content={translateUi("EXECUÇÕES QUE EXIGEM AÇÃO")} style={{ fg: COLORS.git }} />
          {actionableRuns.map((run) => (
            <box key={`${run.id}:${run.attempt}`} style={{ width: "100%", marginBottom: 1 }}>
              <text
                content={`${run.eligibleForApproval ? "⚠" : "◷"} ${run.name} · #${run.id} · ${translateUi("tentativa")} ${run.attempt}`}
                style={{ fg: COLORS.warning }}
              />
              <text
                content={translateUi(
                  run.eligibleForApproval
                    ? "Workflow de fork aguarda autorização explícita."
                    : "Deployment aguarda aprovação no GitHub; o Tuiminal não pode liberá-lo por esta ação.",
                )}
                style={{ fg: COLORS.muted }}
              />
              <InlineButton
                label={translateUi("[O] Abrir execução")}
                accent={COLORS.git}
                onPress={() => onOpenWorkflow(run.id)}
              />
            </box>
          ))}
        </box>
      ) : null}
      {workflowError ? (
        <text
          content={`${translateUi("ERRO WORKFLOWS")}: ${workflowError}`}
          style={{ fg: COLORS.danger }}
        />
      ) : null}
    </box>
  )
}

function CommitsContent({
  details,
  width,
  selectedIndex,
  onSelect,
  onCopySha,
}: {
  details: PullRequestDetails
  width: number
  selectedIndex: number
  onSelect: (index: number) => void
  onCopySha: (sha: string) => void
}) {
  return (
    <box style={{ width: "100%" }}>
      {details.commits.map((commit, index) => (
        <Button
          key={commit.sha}
          height={2}
          onPress={() => {
            onSelect(index)
            onCopySha(commit.sha)
          }}
        >
          <box style={{ height: 2, width: "100%" }}>
            <text
              content={`${index === selectedIndex ? "▶" : " "} ${commit.sha.slice(0, 10)}  ${truncateDisplay(commit.headline, width - 16)}`}
              style={{ fg: index === selectedIndex ? COLORS.text : COLORS.muted }}
            />
            <text
              content={`  @${commit.author.login} · ${formatUiDateTime(commit.authoredAt, { dateStyle: "short", timeStyle: "short" })} · ${translateUi("[Y] copiar SHA · [D] abrir diff")}`}
              style={{ fg: COLORS.muted }}
            />
          </box>
        </Button>
      ))}
      {details.pages.commits.hasNextPage ? (
        <text
          content={
            partialFooter(
              details.commits.length,
              details.pages.commits.totalCount,
              details.pages.commits.hasNextPage,
            ) ?? ""
          }
          style={{ fg: COLORS.warning }}
        />
      ) : null}
    </box>
  )
}

function FilesContent({
  details,
  width,
  selectedIndex,
  onSelect,
}: {
  details: PullRequestDetails
  width: number
  selectedIndex: number
  onSelect: (index: number) => void
}) {
  return (
    <box style={{ width: "100%" }}>
      {details.files.map((file, index) => (
        <Button key={file.path} height={1} onPress={() => onSelect(index)}>
          <text
            content={`${index === selectedIndex ? "▶" : " "} ${truncateDisplay(file.path, width - 22)}  +${file.additions}/-${file.deletions}  ${file.changeType}`}
            style={{ fg: index === selectedIndex ? COLORS.text : COLORS.muted }}
          />
        </Button>
      ))}
      {details.pages.files.hasNextPage ? (
        <text
          content={
            partialFooter(
              details.files.length,
              details.pages.files.totalCount,
              details.pages.files.hasNextPage,
            ) ?? ""
          }
          style={{ fg: COLORS.warning }}
        />
      ) : null}
    </box>
  )
}

export function PreviewTabContent({
  tab,
  details,
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
  tab: PullRequestPreviewTab
  details: PullRequestDetails
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
  if (tab === "overview") {
    return (
      <OverviewContent
        details={details}
        expanded={descriptionExpanded}
        onToggle={onToggleDescription}
      />
    )
  }
  if (tab === "checks") {
    return (
      <ChecksContent
        details={details}
        workflows={workflows}
        workflowError={workflowError}
        onOpenWorkflow={onOpenWorkflow}
      />
    )
  }
  if (tab === "activity") {
    return (
      <PullRequestActivityContent
        details={details}
        selectedIndex={selectedItemIndex}
        onSelect={onSelectItem}
        onReact={onReactComment}
        onReply={onReplyComment}
      />
    )
  }
  if (tab === "commits") {
    return (
      <CommitsContent
        details={details}
        width={width}
        selectedIndex={selectedItemIndex}
        onSelect={onSelectItem}
        onCopySha={onCopySha}
      />
    )
  }
  return (
    <FilesContent
      details={details}
      width={width}
      selectedIndex={selectedItemIndex}
      onSelect={onSelectItem}
    />
  )
}
