import type { BoxRenderable, InputRenderable } from "@opentui/core"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { Button } from "@tuiparts/react/button"
import { useEffect, useRef, useState } from "react"
import { COLORS } from "../../../../core/settings/theme"
import { translateUi } from "../../../../shared/i18n"
import { InlineButton } from "../../../../shared/ui/InlineButton"
import { ShortcutText } from "../../../../shared/ui/ShortcutText"
import type { IssueActionKind } from "../../model/issue/actions"
import type { IssueSummary } from "../../model/issue/types"

const LABELS: Record<IssueActionKind, string> = {
  assign: "Adicionar responsáveis",
  unassign: "Remover responsáveis",
  comment: "Comentar na issue",
  labels: "Editar labels da issue",
  checkout: "Criar e abrir branch da issue",
  close: "Fechar issue",
  reopen: "Reabrir issue",
}

function needsInput(kind: IssueActionKind) {
  return ["assign", "unassign", "comment", "labels", "checkout"].includes(kind)
}

function placeholder(kind: IssueActionKind) {
  if (kind === "assign" || kind === "unassign") return "usuario, outro-usuario"
  if (kind === "labels") return "bug, frontend, prioridade-alta"
  if (kind === "checkout") return "/caminho/do/clone"
  return "Escreva o comentário que será enviado…"
}

function parseLogins(value: string) {
  return [
    ...new Set(
      value
        .split(/[\s,]+/)
        .map((entry) => entry.trim().replace(/^@/, ""))
        .filter(Boolean),
    ),
  ]
}

function parseLabels(value: string) {
  return [
    ...new Set(
      value
        .split(/[,\n]+/)
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  ]
}

function labelPayload(value: string, currentLabels: readonly string[]) {
  const labels = parseLabels(value)
  const currentByName = new Map(currentLabels.map((label) => [label.toLowerCase(), label]))
  const nextNames = new Set(labels.map((label) => label.toLowerCase()))
  return {
    labels,
    addLabels: labels.filter((label) => !currentByName.has(label.toLowerCase())),
    removeLabels: currentLabels.filter((label) => !nextNames.has(label.toLowerCase())),
  }
}

function actionPayload(kind: IssueActionKind, value: string, currentLabels: readonly string[]) {
  if (kind === "comment") return { body: value }
  if (kind === "assign" || kind === "unassign") return { logins: parseLogins(value) }
  if (kind === "labels") return labelPayload(value, currentLabels)
  if (kind === "checkout") return { clonePath: value }
  return {}
}

export function IssueActionModal({
  kind,
  item,
  currentAssignees,
  currentLabels,
  initialValue,
  checkoutPaths,
  busy,
  error,
  onValueChange,
  onClose,
  onSubmit,
}: {
  kind: IssueActionKind
  item: IssueSummary
  currentAssignees: readonly string[]
  currentLabels: readonly string[]
  initialValue: string
  checkoutPaths: string[]
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
  const input = needsInput(kind)

  useEffect(() => {
    valueRef.current = initialValue
    setValue(initialValue)
    renderer.currentFocusedRenderable?.blur()
    const timeout = setTimeout(() => (input ? inputRef.current : dialogRef.current)?.focus(), 0)
    return () => clearTimeout(timeout)
  }, [initialValue, input, renderer])

  const submit = () => {
    const trimmed = valueRef.current.trim()
    if (input && kind !== "labels" && !trimmed) return
    onSubmit(actionPayload(kind, trimmed, currentLabels))
  }

  useKeyboard((key) => {
    if (key.name === "escape") {
      key.preventDefault()
      key.stopPropagation()
      if (renderer.currentFocusedRenderable?.id === "git-issue-action-input") {
        inputRef.current?.blur()
        dialogRef.current?.focus()
      } else onClose()
      return
    }
    if (key.ctrl && key.name === "s" && !busy) {
      key.preventDefault()
      key.stopPropagation()
      submit()
      return
    }
    if (kind === "checkout" && /^\d$/.test(key.name)) {
      const path = checkoutPaths[Number(key.name) - 1]
      if (path) {
        valueRef.current = path
        setValue(path)
        onValueChange(path)
      }
    }
  })

  const width = Math.max(50, Math.min(88, terminal.width - 4))
  const noLabelChange =
    kind === "labels" &&
    !labelPayload(value, currentLabels).addLabels.length &&
    !labelPayload(value, currentLabels).removeLabels.length
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
          id="git-issue-action-modal"
          focusable
          style={{
            width,
            height: kind === "checkout" ? 18 : 16,
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
            content={`${item.title} · ${translateUi(item.state === "open" ? "ABERTA" : "FECHADA")}`}
            style={{ fg: COLORS.muted }}
          />
          {input ? (
            <input
              ref={inputRef}
              id="git-issue-action-input"
              value={value}
              placeholder={translateUi(placeholder(kind))}
              maxLength={kind === "comment" ? 65_000 : 2_048}
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
          {kind === "unassign" && currentAssignees.length ? (
            <box style={{ marginTop: 1, flexDirection: "row" }}>
              {currentAssignees.map((login) => (
                <InlineButton
                  key={login}
                  label={`[@${login}]`}
                  accent={COLORS.git}
                  onPress={() => {
                    valueRef.current = login
                    setValue(login)
                    onValueChange(login)
                  }}
                />
              ))}
            </box>
          ) : null}
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
              disabled={busy || (input && kind !== "labels" && !value.trim()) || noLabelChange}
              onPress={submit}
            />
          </box>
        </box>
      </box>
    </>
  )
}
