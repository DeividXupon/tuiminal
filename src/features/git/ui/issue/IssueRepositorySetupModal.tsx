import type { BoxRenderable, InputRenderable } from "@opentui/core"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { Button } from "@tuiparts/react/button"
import { useEffect, useRef, useState } from "react"
import { COLORS } from "../../../../core/settings/theme"
import { translateUi } from "../../../../shared/i18n"
import { InlineButton } from "../../../../shared/ui/InlineButton"
import { addIssueProfileRepository } from "../../storage/issue/config"

export function IssueRepositorySetupModal({
  root,
  host,
  onClose,
  onSaved,
}: {
  root: string
  host: string
  onClose: () => void
  onSaved: () => void
}) {
  const renderer = useRenderer()
  const terminal = useTerminalDimensions()
  const dialogRef = useRef<BoxRenderable | null>(null)
  const inputRef = useRef<InputRenderable | null>(null)
  const valueRef = useRef("")
  const [value, setValue] = useState("")
  const [error, setError] = useState("")

  useEffect(() => {
    renderer.currentFocusedRenderable?.blur()
    const timeout = setTimeout(() => inputRef.current?.focus(), 0)
    return () => clearTimeout(timeout)
  }, [renderer])

  const save = () => {
    try {
      addIssueProfileRepository({ root, host, repository: valueRef.current.trim() })
      onSaved()
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : translateUi("Não foi possível salvar o repositório."),
      )
    }
  }

  useKeyboard((key) => {
    if (key.name === "escape") {
      key.preventDefault()
      key.stopPropagation()
      if (renderer.currentFocusedRenderable?.id === "git-issue-repository-input") {
        inputRef.current?.blur()
        dialogRef.current?.focus()
      } else onClose()
    } else if (key.ctrl && key.name === "s") {
      key.preventDefault()
      key.stopPropagation()
      save()
    }
  })

  const width = Math.max(44, Math.min(78, terminal.width - 4))
  return (
    <>
      <Button
        onPress={onClose}
        position="absolute"
        top={0}
        left={0}
        width="100%"
        height="100%"
        zIndex={960}
        backgroundColor="#030509"
        opacity={0.92}
      />
      <box
        position="absolute"
        top={0}
        left={0}
        width="100%"
        height="100%"
        zIndex={961}
        alignItems="center"
        justifyContent="center"
      >
        <box
          ref={dialogRef}
          id="git-issue-repository-modal"
          focusable
          style={{
            width,
            height: 13,
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
              content={translateUi("◆ ADICIONAR REPOSITÓRIO DE ISSUES")}
              style={{ fg: COLORS.git }}
            />
            <InlineButton
              label={translateUi("[Esc] Fechar")}
              accent={COLORS.git}
              onPress={onClose}
            />
          </box>
          <text
            content={translateUi("Use o formato owner/repo, sem URL.")}
            style={{ fg: COLORS.muted }}
          />
          <input
            ref={inputRef}
            id="git-issue-repository-input"
            value={value}
            placeholder="owner/repo"
            maxLength={200}
            onMouseDown={() => inputRef.current?.focus()}
            onSubmit={save}
            onInput={(next) => {
              valueRef.current = next
              setValue(next)
              setError("")
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
          <text content={error} style={{ marginTop: 1, fg: COLORS.danger }} />
          <box
            style={{
              height: 1,
              flexShrink: 0,
              flexDirection: "row",
              justifyContent: "flex-end",
              marginTop: 1,
            }}
          >
            <InlineButton
              label={translateUi("[Ctrl+S] Salvar")}
              accent={COLORS.git}
              disabled={!value.trim()}
              onPress={save}
            />
          </box>
        </box>
      </box>
    </>
  )
}
