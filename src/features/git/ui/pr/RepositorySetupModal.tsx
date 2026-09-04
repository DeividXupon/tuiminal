import type { BoxRenderable, InputRenderable } from "@opentui/core"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { Button } from "@tuiparts/react/button"
import { useCallback, useEffect, useRef, useState } from "react"
import { COLORS } from "../../../../core/settings/theme"
import { translateUi } from "../../../../shared/i18n"
import { InlineButton } from "../../../../shared/ui/InlineButton"
import { ShortcutText } from "../../../../shared/ui/ShortcutText"
import { validateRepositoryName } from "../../model/pr/query"
import { addPullRequestProfileRepository } from "../../storage/pr/config"

export function RepositorySetupModal({
  open,
  root,
  host,
  onClose,
  onSaved,
}: {
  open: boolean
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

  const submit = useCallback(() => {
    const repository = valueRef.current.trim()
    if (!repository) return
    if (!validateRepositoryName(repository)) {
      setError(translateUi("Use o formato owner/repo, sem URL."))
      return
    }
    try {
      addPullRequestProfileRepository({ root, host, repository })
      onSaved()
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : translateUi("Não foi possível salvar o repositório."),
      )
    }
  }, [host, onSaved, root])

  useEffect(() => {
    if (!open) return
    renderer.currentFocusedRenderable?.blur()
    valueRef.current = ""
    setValue("")
    setError("")
    const timeout = setTimeout(() => inputRef.current?.focus(), 0)
    return () => clearTimeout(timeout)
  }, [open, renderer])

  useKeyboard((key) => {
    if (!open) return
    if (key.name === "escape") {
      key.preventDefault()
      key.stopPropagation()
      if (renderer.currentFocusedRenderable?.id === "git-pr-repository-input") {
        inputRef.current?.blur()
        dialogRef.current?.focus()
      } else onClose()
    } else if (key.ctrl && key.name === "s") {
      key.preventDefault()
      key.stopPropagation()
      submit()
    }
  })

  if (!open) return null
  const width = Math.max(36, Math.min(76, terminal.width - 4))
  return (
    <>
      <Button
        onPress={onClose}
        position="absolute"
        top={0}
        left={0}
        width="100%"
        height="100%"
        zIndex={970}
        backgroundColor="#030509"
        opacity={0.92}
      />
      <box
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          zIndex: 971,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <box
          ref={dialogRef}
          id="git-pr-repository-modal"
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
            <text content={translateUi("◆ ADICIONAR REPOSITÓRIO")} style={{ fg: COLORS.git }} />
            <InlineButton label="[Esc] Cancelar" accent={COLORS.git} onPress={onClose} />
          </box>
          <text
            content={translateUi(
              "Ao adicionar, as buscas deste projeto ficarão limitadas aos repositórios da lista.",
            )}
            style={{ fg: COLORS.muted, marginTop: 1 }}
          />
          <text content={`Host: ${host}`} style={{ fg: COLORS.text }} />
          <box style={{ height: 1, flexShrink: 0, flexDirection: "row", marginTop: 1 }}>
            <text content="REPO  " style={{ width: 7, flexShrink: 0, fg: COLORS.muted }} />
            <input
              ref={inputRef}
              id="git-pr-repository-input"
              value={value}
              placeholder="equipe/api"
              width={Math.max(12, width - 12)}
              maxLength={180}
              onMouseDown={() => inputRef.current?.focus()}
              onInput={(next) => {
                valueRef.current = next
                setValue(next)
                setError("")
              }}
              onSubmit={submit}
              style={{
                backgroundColor: COLORS.panelRaised,
                focusedBackgroundColor: COLORS.panelRaised,
                textColor: COLORS.text,
                focusedTextColor: COLORS.text,
                cursorColor: COLORS.git,
                placeholderColor: COLORS.muted,
              }}
            />
          </box>
          <text
            content={error || translateUi("Use o formato owner/repo, sem URL.")}
            style={{ fg: error ? COLORS.danger : COLORS.muted, marginTop: 1 }}
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
            <ShortcutText content="[Esc] desfocar/cancelar" style={{ fg: COLORS.muted }} />
            <InlineButton
              label="[Ctrl+S] Salvar"
              accent={COLORS.git}
              disabled={!value.trim()}
              onPress={submit}
            />
          </box>
        </box>
      </box>
    </>
  )
}
