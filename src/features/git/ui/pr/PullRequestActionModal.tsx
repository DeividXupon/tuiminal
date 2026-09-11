import type { BoxRenderable, InputRenderable } from "@opentui/core"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { Button } from "@tuiparts/react/button"
import { useEffect, useRef, useState } from "react"
import { COLORS } from "../../../../core/settings/theme"
import { translateUi, truncateDisplay } from "../../../../shared/i18n"
import { InlineButton } from "../../../../shared/ui/InlineButton"
import { ShortcutText } from "../../../../shared/ui/ShortcutText"
import type { PullRequestActionKind } from "../../model/pr/actions"
import { GITHUB_REACTION_CHOICES, type GitHubReactionContent } from "../../model/reactions"
import type {
  PullRequestComment,
  PullRequestMergeMethod,
  PullRequestSummary,
} from "../../model/pr/types"
import type { PullRequestWorkflowRun } from "../../model/pr/workflows"
import { useBlurModalFocusOnUnmount } from "../useBlurModalFocusOnUnmount"
import { PullRequestActionOptions } from "./PullRequestActionOptions"

const LABELS: Record<PullRequestActionKind, string> = {
  assign: "Adicionar responsável",
  unassign: "Remover responsável",
  comment: "Comentar",
  reaction: "Reagir no Pull Request",
  reply: "Responder comentário",
  approve: "Aprovar Pull Request",
  ready: "Marcar como pronto para revisão",
  close: "Fechar Pull Request",
  reopen: "Reabrir Pull Request",
  checkout: "Fazer checkout local",
  "update-branch": "Atualizar com a branch-base",
  merge: "Fazer merge",
  "approve-workflow": "Autorizar execução de workflow",
}

function needsInput(kind: PullRequestActionKind) {
  return ["assign", "unassign", "comment", "reply", "approve", "checkout"].includes(kind)
}

function requiresInputValue(kind: PullRequestActionKind) {
  return ["assign", "unassign", "comment", "reply", "checkout"].includes(kind)
}

function placeholder(kind: PullRequestActionKind) {
  if (kind === "assign" || kind === "unassign") return "usuario"
  if (kind === "checkout") return "/caminho/do/clone"
  if (kind === "reply") return "Escreva a resposta que será enviada…"
  return "Escreva o comentário que será enviado…"
}

function actionPayload(
  kind: PullRequestActionKind,
  value: string,
  method: string,
  workflow: PullRequestWorkflowRun | undefined,
  mergeQueueConfigured: boolean,
  reaction: GitHubReactionContent,
) {
  if (kind === "comment" || kind === "reply" || kind === "approve") return { body: value }
  if (kind === "reaction") return { reaction }
  if (kind === "assign" || kind === "unassign") return { login: value.replace(/^@/, "") }
  if (kind === "checkout") return { clonePath: value }
  if (kind === "merge") return { method, mergeQueue: mergeQueueConfigured }
  if (kind === "approve-workflow") return { runId: workflow?.id ?? 0 }
  return {}
}

type ActionModalKeyboardAction =
  | { type: "escape" }
  | { type: "submit" }
  | { type: "method"; method: string }
  | { type: "workflow"; delta: -1 | 1 }
  | { type: "clone"; index: number }
  | { type: "reaction"; index: number }

function applyActionModalKeyboardAction(
  action: ActionModalKeyboardAction,
  context: {
    busy: boolean
    checkoutPaths: readonly string[]
    onEscape: () => void
    onSubmit: () => void
    onMethod: (method: PullRequestMergeMethod) => void
    onWorkflow: (delta: -1 | 1) => void
    onClone: (path: string) => void
    onReaction: (reaction: GitHubReactionContent) => void
  },
) {
  if (action.type === "escape") return context.onEscape()
  if (action.type === "submit") return context.busy ? undefined : context.onSubmit()
  if (action.type === "method" && action.method) {
    return context.onMethod(action.method as PullRequestMergeMethod)
  }
  if (action.type === "workflow") return context.onWorkflow(action.delta)
  if (action.type === "clone") {
    const path = context.checkoutPaths[action.index]
    return path ? context.onClone(path) : undefined
  }
  if (action.type === "reaction") {
    const reaction = GITHUB_REACTION_CHOICES[action.index]
    return reaction ? context.onReaction(reaction.content) : undefined
  }
}

function actionModalKeyboardAction(
  key: { name: string; ctrl?: boolean },
  kind: PullRequestActionKind,
  mergeMethods: readonly PullRequestMergeMethod[],
  checkoutPaths: readonly string[],
): ActionModalKeyboardAction | null {
  const keyName = key.name.toLowerCase()
  if (keyName === "escape") return { type: "escape" }
  if (key.ctrl && keyName === "s") return { type: "submit" }
  if (kind === "merge" && ["1", "2", "3"].includes(keyName)) {
    return {
      type: "method",
      method: mergeMethods[Number(keyName) - 1] ?? "",
    }
  }
  if (kind === "checkout" && /^\d$/.test(keyName)) {
    const index = Number(keyName) - 1
    if (checkoutPaths[index]) return { type: "clone", index }
  }
  if (kind === "reaction" && /^[1-5]$/.test(keyName)) {
    return { type: "reaction", index: Number(keyName) - 1 }
  }
  if (kind !== "approve-workflow") return null
  if (keyName === "j" || keyName === "down") return { type: "workflow", delta: 1 }
  if (keyName === "k" || keyName === "up") return { type: "workflow", delta: -1 }
  return null
}

function actionModalHeight(kind: PullRequestActionKind, checkoutPathCount: number) {
  if (kind === "approve-workflow") return 18
  if (kind === "reaction") return 18
  if (kind === "checkout") return 15 + Math.min(3, checkoutPathCount)
  if (kind === "assign" || kind === "unassign") return 19
  return 15
}

export function PullRequestActionModal({
  open,
  kind,
  item,
  initialValue,
  workflows,
  mergeMethods,
  checkoutPaths,
  mergeQueueConfigured,
  mergeQueuePosition,
  autoMergeEnabled,
  targetComment,
  reactionGroups,
  busy,
  error,
  onValueChange,
  onClose,
  onSubmit,
}: {
  open: boolean
  kind: PullRequestActionKind
  item: PullRequestSummary
  initialValue: string
  workflows: PullRequestWorkflowRun[]
  mergeMethods: PullRequestMergeMethod[]
  checkoutPaths: string[]
  mergeQueueConfigured: boolean
  mergeQueuePosition: number | null
  autoMergeEnabled: boolean
  targetComment: PullRequestComment | null
  reactionGroups: PullRequestComment["reactionGroups"]
  busy: boolean
  error: string
  onValueChange: (value: string) => void
  onClose: () => void
  onSubmit: (payload: Readonly<Record<string, unknown>>) => void
}) {
  const renderer = useRenderer()
  const terminal = useTerminalDimensions()
  const dialogRef = useRef<BoxRenderable | null>(null)
  const inputRef = useRef<InputRenderable | null>(null)
  const valueRef = useRef(initialValue)
  const [value, setValue] = useState(initialValue)
  const [method, setMethod] = useState<PullRequestMergeMethod | "">(mergeMethods[0] ?? "")
  const [workflowIndex, setWorkflowIndex] = useState(0)
  const [reaction, setReaction] = useState<GitHubReactionContent>(
    GITHUB_REACTION_CHOICES[0].content,
  )
  const input = needsInput(kind)
  useBlurModalFocusOnUnmount(dialogRef)
  useEffect(() => {
    if (!open) return
    valueRef.current = initialValue
    setValue(initialValue)
    setReaction(GITHUB_REACTION_CHOICES[0].content)
    if (kind === "merge") setMethod(mergeMethods[0] ?? "")
    renderer.currentFocusedRenderable?.blur()
    setTimeout(() => (input ? inputRef.current : dialogRef.current)?.focus(), 0)
  }, [initialValue, input, kind, mergeMethods, open, renderer])

  const submit = () => {
    const trimmed = valueRef.current.trim()
    if (requiresInputValue(kind) && !trimmed) return
    onSubmit(
      actionPayload(
        kind,
        trimmed,
        method,
        workflows[workflowIndex],
        mergeQueueConfigured,
        reaction,
      ),
    )
  }

  useKeyboard((key) => {
    if (!open) return
    const action = actionModalKeyboardAction(key, kind, mergeMethods, checkoutPaths)
    if (!action) return
    key.preventDefault()
    key.stopPropagation()
    applyActionModalKeyboardAction(action, {
      busy,
      checkoutPaths,
      onEscape: () => {
        if (input && renderer.currentFocusedRenderable?.id === "git-pr-action-input") {
          inputRef.current?.blur()
          dialogRef.current?.focus()
        } else onClose()
      },
      onSubmit: submit,
      onMethod: setMethod,
      onWorkflow: (delta) =>
        setWorkflowIndex((current) => Math.max(0, Math.min(workflows.length - 1, current + delta))),
      onClone: (path) => {
        valueRef.current = path
        setValue(path)
        onValueChange(path)
      },
      onReaction: setReaction,
    })
  })

  if (!open) return null
  const width = Math.max(50, Math.min(88, terminal.width - 4))
  return (
    <>
      <Button
        onPress={onClose}
        position="absolute"
        top={0}
        left={0}
        width="100%"
        height="100%"
        zIndex={982}
        backgroundColor="#030509"
        opacity={0.92}
      />
      <box
        position="absolute"
        top={0}
        left={0}
        width="100%"
        height="100%"
        zIndex={983}
        alignItems="center"
        justifyContent="center"
      >
        <box
          ref={dialogRef}
          id="git-pr-action-modal"
          focusable
          style={{
            width,
            height: actionModalHeight(kind, checkoutPaths.length),
            border: true,
            borderStyle: "rounded",
            borderColor: COLORS.git,
            backgroundColor: COLORS.canvas,
            paddingLeft: 1,
            paddingRight: 1,
          }}
        >
          <box
            style={{
              height: 2,
              flexShrink: 0,
              flexDirection: "row",
              justifyContent: "space-between",
              border: ["bottom"],
              borderColor: COLORS.border,
            }}
          >
            <text
              content={`◆ ${translateUi(targetComment && kind === "reaction" ? "Reagir no comentário" : LABELS[kind]).toUpperCase()}`}
              style={{ fg: COLORS.git }}
            />
            <InlineButton
              label={translateUi("[Esc] Cancelar")}
              accent={COLORS.git}
              onPress={onClose}
            />
          </box>
          <text
            content={`${item.identity.host} · ${item.identity.owner}/${item.identity.repository} #${item.identity.number}`}
            style={{ fg: COLORS.text }}
          />
          <text
            content={`${item.title} · commit ${item.headSha.slice(0, 10)}`}
            style={{ fg: COLORS.muted }}
          />
          {targetComment ? (
            <text
              content={`↳ @${targetComment.author.login}: ${truncateDisplay(targetComment.body.replace(/\s+/g, " "), width - 8)}`}
              style={{ fg: COLORS.git }}
            />
          ) : null}
          {input ? (
            <input
              ref={inputRef}
              id="git-pr-action-input"
              value={value}
              placeholder={translateUi(placeholder(kind))}
              maxLength={
                kind === "comment" || kind === "reply" || kind === "approve" ? 65_000 : 1_024
              }
              onMouseDown={() => inputRef.current?.focus()}
              onInput={(next) => {
                valueRef.current = next
                setValue(next)
                onValueChange(next)
              }}
              style={{
                marginTop: 1,
                backgroundColor: COLORS.panelRaised,
                focusedBackgroundColor: COLORS.panelRaised,
                textColor: COLORS.text,
                focusedTextColor: COLORS.text,
                cursorColor: COLORS.git,
                placeholderColor: COLORS.muted,
              }}
            />
          ) : null}
          <PullRequestActionOptions
            kind={kind}
            item={item}
            value={value}
            reaction={reaction}
            reactionGroups={reactionGroups ?? []}
            checkoutPaths={checkoutPaths}
            method={method}
            mergeMethods={mergeMethods}
            mergeQueueConfigured={mergeQueueConfigured}
            mergeQueuePosition={mergeQueuePosition}
            autoMergeEnabled={autoMergeEnabled}
            workflows={workflows}
            workflowIndex={workflowIndex}
            onValue={(next) => {
              valueRef.current = next
              setValue(next)
              onValueChange(next)
            }}
            onReaction={setReaction}
            onMethod={setMethod}
            onWorkflow={setWorkflowIndex}
          />
          <text
            content={error || translateUi("Nada será executado até a confirmação abaixo.")}
            style={{ marginTop: 1, fg: error ? COLORS.danger : COLORS.warning }}
          />
          <box
            style={{
              height: 1,
              flexShrink: 0,
              flexDirection: "row",
              justifyContent: "space-between",
              marginTop: 1,
            }}
          >
            <ShortcutText
              content={translateUi("[Esc] desfocar/cancelar")}
              style={{ fg: COLORS.muted }}
            />
            <InlineButton
              label={translateUi(busy ? "[Ctrl+S] Executando…" : "[Ctrl+S] Confirmar")}
              accent={COLORS.git}
              disabled={
                busy ||
                (requiresInputValue(kind) && !value.trim()) ||
                (kind === "approve-workflow" && !workflows.length) ||
                (kind === "merge" && !mergeQueueConfigured && !method)
              }
              onPress={submit}
            />
          </box>
        </box>
      </box>
    </>
  )
}
