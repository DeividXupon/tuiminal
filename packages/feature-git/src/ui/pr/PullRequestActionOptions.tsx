import { Button } from "@tuiparts/react/button"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import type { PullRequestActionKind } from "../../model/pr/actions"
import type { GitHubReactionContent, GitHubReactionGroup } from "../../model/reactions"
import type { PullRequestMergeMethod, PullRequestSummary } from "../../model/pr/types"
import type { PullRequestWorkflowRun } from "../../model/pr/workflows"
import { ReactionPicker } from "../ReactionPicker"
import { AssigneePicker } from "./AssigneePicker"

function mergeIntentText({
  queueConfigured,
  queuePosition,
  autoMergeEnabled,
}: {
  queueConfigured: boolean
  queuePosition: number | null
  autoMergeEnabled: boolean
}) {
  if (queuePosition !== null) return "PR já está na fila de merge."
  if (autoMergeEnabled)
    return "Auto-merge já está ativo; confirme somente para atualizar a intenção."
  if (queueConfigured) {
    return "A confirmação colocará o PR na fila ou ativará auto-merge até os checks terminarem."
  }
  return "A confirmação tentará concluir o merge agora, respeitando as proteções do GitHub."
}

export function PullRequestActionOptions({
  kind,
  item,
  value,
  reaction,
  reactionGroups,
  checkoutPaths,
  method,
  mergeMethods,
  mergeQueueConfigured,
  mergeQueuePosition,
  autoMergeEnabled,
  workflows,
  workflowIndex,
  onValue,
  onReaction,
  onMethod,
  onWorkflow,
}: {
  kind: PullRequestActionKind
  item: PullRequestSummary
  value: string
  reaction: GitHubReactionContent
  reactionGroups: readonly GitHubReactionGroup[]
  checkoutPaths: string[]
  method: PullRequestMergeMethod | ""
  mergeMethods: PullRequestMergeMethod[]
  mergeQueueConfigured: boolean
  mergeQueuePosition: number | null
  autoMergeEnabled: boolean
  workflows: PullRequestWorkflowRun[]
  workflowIndex: number
  onValue: (value: string) => void
  onReaction: (reaction: GitHubReactionContent) => void
  onMethod: (method: PullRequestMergeMethod) => void
  onWorkflow: (index: number) => void
}) {
  return (
    <>
      {kind === "reaction" ? (
        <ReactionPicker selected={reaction} groups={reactionGroups} onSelect={onReaction} />
      ) : null}
      <AssigneePicker kind={kind} assignees={item.assignees} value={value} onSelect={onValue} />
      {kind === "checkout" && checkoutPaths.length ? (
        <box style={{ marginTop: 1 }}>
          <text content={translateUi("CLONES SALVOS")} style={{ fg: COLORS.git }} />
          {checkoutPaths.slice(0, 3).map((path, index) => (
            <InlineButton
              key={path}
              label={`[${index + 1}] ${path}`}
              accent={COLORS.git}
              active={value === path}
              onPress={() => onValue(path)}
            />
          ))}
        </box>
      ) : null}
      {kind === "merge" ? (
        <box style={{ marginTop: 1 }}>
          <box style={{ flexDirection: "row" }}>
            {mergeMethods.map((candidate, index) => (
              <InlineButton
                key={candidate}
                label={`[${index + 1}] ${candidate}`}
                accent={COLORS.git}
                active={candidate === method}
                onPress={() => onMethod(candidate)}
              />
            ))}
          </box>
          <text
            content={translateUi(
              mergeIntentText({
                queueConfigured: mergeQueueConfigured,
                queuePosition: mergeQueuePosition,
                autoMergeEnabled,
              }),
            )}
            style={{ fg: COLORS.warning }}
          />
        </box>
      ) : null}
      {kind === "approve-workflow" ? (
        <box style={{ marginTop: 1 }}>
          {workflows.map((run, index) => (
            <Button key={run.id} height={2} onPress={() => onWorkflow(index)}>
              <box>
                <text
                  content={`${index === workflowIndex ? "▶" : " "} ${run.name} · #${run.id} · tentativa ${run.attempt}`}
                  style={{ fg: index === workflowIndex ? COLORS.text : COLORS.muted }}
                />
                <text
                  content={`  ${run.headRepository} · @${run.actor.login}`}
                  style={{ fg: COLORS.warning }}
                />
              </box>
            </Button>
          ))}
        </box>
      ) : null}
    </>
  )
}
