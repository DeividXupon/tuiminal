import type { BoxRenderable, InputRenderable } from "@opentui/core"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { Button } from "@tuiparts/react/button"
import { useEffect, useRef, useState } from "react"
import { COLORS } from "../../../../core/settings/theme"
import { translateUi } from "../../../../shared/i18n"
import { InlineButton } from "../../../../shared/ui/InlineButton"
import { ShortcutText } from "../../../../shared/ui/ShortcutText"
import type { PullRequestActionKind } from "../../model/pr/actions"
import type { PullRequestMergeMethod, PullRequestSummary } from "../../model/pr/types"
import type { PullRequestWorkflowRun } from "../../model/pr/workflows"
import { AssigneePicker } from "./AssigneePicker"

const LABELS: Record<PullRequestActionKind, string> = {
  assign: "Adicionar responsável",
  unassign: "Remover responsável",
  comment: "Comentar",
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
  return ["assign", "unassign", "comment", "approve", "checkout"].includes(kind)
}

function requiresInputValue(kind: PullRequestActionKind) {
  return ["assign", "unassign", "comment", "checkout"].includes(kind)
}

function placeholder(kind: PullRequestActionKind) {
  if (kind === "assign" || kind === "unassign") return "usuario"
  if (kind === "checkout") return "/caminho/do/clone"
  return "Escreva o comentário que será enviado…"
}

function actionPayload(
  kind: PullRequestActionKind,
  value: string,
  method: string,
  workflow: PullRequestWorkflowRun | undefined,
  mergeQueueConfigured: boolean,
) {
  if (kind === "comment" || kind === "approve") return { body: value }
  if (kind === "assign" || kind === "unassign") return { login: value.replace(/^@/, "") }
  if (kind === "checkout") return { clonePath: value }
  if (kind === "merge") return { method, mergeQueue: mergeQueueConfigured }
  if (kind === "approve-workflow") return { runId: workflow?.id ?? 0 }
  return {}
}

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

type ActionModalKeyboardAction =
  | { type: "escape" }
  | { type: "submit" }
  | { type: "method"; method: string }
  | { type: "workflow"; delta: -1 | 1 }
  | { type: "clone"; index: number }

function actionModalKeyboardAction(
  key: { name: string; ctrl?: boolean },
  kind: PullRequestActionKind,
  mergeMethods: readonly PullRequestMergeMethod[],
  checkoutPaths: readonly string[],
): ActionModalKeyboardAction | null {
  if (key.name === "escape") return { type: "escape" }
  if (key.ctrl && key.name === "s") return { type: "submit" }
  if (kind === "merge" && ["1", "2", "3"].includes(key.name)) {
    return {
      type: "method",
      method: mergeMethods[Number(key.name) - 1] ?? "",
    }
  }
  if (kind === "checkout" && /^\d$/.test(key.name)) {
    const index = Number(key.name) - 1
    if (checkoutPaths[index]) return { type: "clone", index }
  }
  if (kind !== "approve-workflow") return null
  if (key.name === "j" || key.name === "down") return { type: "workflow", delta: 1 }
  if (key.name === "k" || key.name === "up") return { type: "workflow", delta: -1 }
  return null
}

function actionModalHeight(kind: PullRequestActionKind, checkoutPathCount: number) {
  if (kind === "approve-workflow") return 18
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
  const input = needsInput(kind)

  useEffect(() => {
    if (!open) return
    valueRef.current = initialValue
    setValue(initialValue)
    if (kind === "merge") setMethod(mergeMethods[0] ?? "")
    renderer.currentFocusedRenderable?.blur()
    setTimeout(() => (input ? inputRef.current : dialogRef.current)?.focus(), 0)
  }, [initialValue, input, kind, mergeMethods, open, renderer])

  const submit = () => {
    const trimmed = valueRef.current.trim()
    if (requiresInputValue(kind) && !trimmed) return
    onSubmit(actionPayload(kind, trimmed, method, workflows[workflowIndex], mergeQueueConfigured))
  }

  useKeyboard((key) => {
    if (!open) return
    const action = actionModalKeyboardAction(key, kind, mergeMethods, checkoutPaths)
    if (!action) return
    if (action.type === "escape") {
      key.preventDefault()
      key.stopPropagation()
      if (renderer.currentFocusedRenderable?.id === "git-pr-action-input") {
        inputRef.current?.blur()
        dialogRef.current?.focus()
      } else onClose()
    } else if (action.type === "submit" && !busy) {
      key.preventDefault()
      key.stopPropagation()
      submit()
    } else if (action.type === "method" && action.method) {
      setMethod(action.method as PullRequestMergeMethod)
    } else if (action.type === "workflow") {
      setWorkflowIndex((current) =>
        Math.max(0, Math.min(workflows.length - 1, current + action.delta)),
      )
    } else if (action.type === "clone") {
      const path = checkoutPaths[action.index]
      if (path) {
        valueRef.current = path
        setValue(path)
        onValueChange(path)
      }
    }
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
              content={`◆ ${translateUi(LABELS[kind]).toUpperCase()}`}
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
          {input ? (
            <input
              ref={inputRef}
              id="git-pr-action-input"
              value={value}
              placeholder={translateUi(placeholder(kind))}
              maxLength={kind === "comment" || kind === "approve" ? 65_000 : 1_024}
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
          <AssigneePicker
            kind={kind}
            assignees={item.assignees}
            value={value}
            onSelect={(login) => {
              valueRef.current = login
              setValue(login)
              onValueChange(login)
            }}
          />
          {kind === "checkout" && checkoutPaths.length ? (
            <box style={{ marginTop: 1 }}>
              <text content={translateUi("CLONES SALVOS")} style={{ fg: COLORS.git }} />
              {checkoutPaths.slice(0, 3).map((path, index) => (
                <InlineButton
                  key={path}
                  label={`[${index + 1}] ${path}`}
                  accent={COLORS.git}
                  active={value === path}
                  onPress={() => {
                    valueRef.current = path
                    setValue(path)
                    onValueChange(path)
                  }}
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
                    onPress={() => setMethod(candidate)}
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
                <Button key={run.id} height={2} onPress={() => setWorkflowIndex(index)}>
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
