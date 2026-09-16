import type { BoxRenderable, InputRenderable, TextareaRenderable } from "@opentui/core"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { Button } from "@tuiparts/react/button"
import { useEffect, useRef } from "react"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { ShortcutText } from "@xupon/tuiminal-core/ui/ShortcutText"
import type { GitHubCreateDraft } from "../../model/create-item"
import { validateGitHubCreateDraft } from "../../model/create-item"
import { useBlurModalFocusOnUnmount } from "../useBlurModalFocusOnUnmount"

type CreateField = "repository" | "base" | "head" | "title" | "body"

export function GitHubCreateModal({
  draft,
  host,
  viewer,
  busy,
  uncertain,
  error,
  onChange,
  onClose,
  onAcknowledge,
  onSubmit,
}: {
  draft: GitHubCreateDraft
  host: string
  viewer: string
  busy: boolean
  uncertain: boolean
  error: string
  onChange: (patch: Partial<GitHubCreateDraft>) => void
  onClose: () => void
  onAcknowledge: () => void
  onSubmit: () => void
}) {
  const terminal = useTerminalDimensions()
  const renderer = useRenderer()
  const dialogRef = useRef<BoxRenderable | null>(null)
  const repositoryRef = useRef<InputRenderable | null>(null)
  const baseRef = useRef<InputRenderable | null>(null)
  const headRef = useRef<InputRenderable | null>(null)
  const titleRef = useRef<InputRenderable | null>(null)
  const bodyRef = useRef<TextareaRenderable | null>(null)
  const fields: CreateField[] =
    draft.kind === "pr"
      ? ["repository", "base", "head", "title", "body"]
      : ["repository", "title", "body"]
  const refs = {
    repository: repositoryRef,
    base: baseRef,
    head: headRef,
    title: titleRef,
    body: bodyRef,
  }
  useBlurModalFocusOnUnmount(dialogRef)
  useEffect(() => {
    renderer.currentFocusedRenderable?.blur()
    const timeout = setTimeout(() => repositoryRef.current?.focus(), 0)
    return () => clearTimeout(timeout)
  }, [renderer])

  const dismissFocusedField = () => {
    const focused = renderer.currentFocusedRenderable
    if (focused?.id?.startsWith("git-create-field-")) {
      focused.blur()
      dialogRef.current?.focus()
    } else onClose()
  }
  const focusNextField = (backward: boolean) => {
    const current = fields.findIndex(
      (field) => refs[field].current?.id === renderer.currentFocusedRenderable?.id,
    )
    const next = (current + (backward ? fields.length - 1 : 1)) % fields.length
    refs[fields[next] ?? "repository"].current?.focus()
  }

  useKeyboard((key) => {
    const name = key.name.toLowerCase()
    if (name === "escape") {
      key.preventDefault()
      key.stopPropagation()
      if (!busy) dismissFocusedField()
      return
    }
    if (key.ctrl && name === "s") {
      key.preventDefault()
      key.stopPropagation()
      if (!busy && !uncertain) onSubmit()
      return
    }
    if (name === "tab") {
      key.preventDefault()
      key.stopPropagation()
      focusNextField(Boolean(key.shift))
      return
    }
    if (
      uncertain &&
      name === "v" &&
      !renderer.currentFocusedRenderable?.id?.startsWith("git-create-field-")
    ) {
      key.preventDefault()
      key.stopPropagation()
      onAcknowledge()
      return
    }
    if (
      draft.kind === "pr" &&
      !renderer.currentFocusedRenderable?.id?.startsWith("git-create-field-") &&
      name === "d"
    ) {
      key.preventDefault()
      key.stopPropagation()
      onChange({ draft: !draft.draft })
    }
  })

  const field = (name: Exclude<CreateField, "body">, label: string, value: string) => (
    <box style={{ flexShrink: 0, gap: 0 }}>
      <text content={translateUi(label)} style={{ fg: COLORS.muted }} />
      <input
        ref={refs[name]}
        id={`git-create-field-${name}`}
        value={value}
        onMouseDown={() => refs[name].current?.focus()}
        onInput={(next) => onChange({ [name]: next })}
        style={{
          backgroundColor: COLORS.panelRaised,
          focusedBackgroundColor: COLORS.panelRaised,
          textColor: COLORS.text,
          focusedTextColor: COLORS.text,
          cursorColor: COLORS.git,
        }}
      />
    </box>
  )
  const width = Math.min(88, Math.max(30, terminal.width - 4))
  const height = Math.min(draft.kind === "pr" ? 23 : 19, Math.max(10, terminal.height - 2))
  const invalid = validateGitHubCreateDraft(draft)
  return (
    <>
      <Button
        onPress={() => {
          if (!busy) onClose()
        }}
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
          id="git-create-modal"
          focusable
          style={{
            width,
            height,
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
              content={translateUi(draft.kind === "pr" ? "CRIAR PR" : "CRIAR ISSUE")}
              style={{ fg: COLORS.git }}
            />
            <InlineButton
              label={translateUi("[Esc] Cancelar")}
              accent={COLORS.git}
              disabled={busy}
              onPress={onClose}
            />
          </box>
          <text content={`${host} · @${viewer}`} style={{ fg: COLORS.muted }} />
          <scrollbox scrollY style={{ flexGrow: 1, backgroundColor: COLORS.canvas }}>
            <box style={{ gap: 1 }}>
              {field("repository", "Repositório (owner/repository)", draft.repository)}
              {draft.kind === "pr" ? (
                <>
                  {field("base", "Branch base (remota)", draft.base ?? "")}
                  {field("head", "Branch head (remota, mesmo repositório)", draft.head ?? "")}
                </>
              ) : null}
              {field("title", "Título", draft.title)}
              <box>
                <text content={translateUi("Descrição (Markdown)")} style={{ fg: COLORS.muted }} />
                <textarea
                  ref={bodyRef}
                  id="git-create-field-body"
                  initialValue={draft.body}
                  onMouseDown={() => bodyRef.current?.focus()}
                  onContentChange={() => onChange({ body: bodyRef.current?.plainText ?? "" })}
                  style={{
                    height: 4,
                    flexShrink: 0,
                    wrapMode: "word",
                    backgroundColor: COLORS.panelRaised,
                    focusedBackgroundColor: COLORS.panelRaised,
                    textColor: COLORS.text,
                    focusedTextColor: COLORS.text,
                    cursorColor: COLORS.git,
                  }}
                />
              </box>
              {draft.kind === "pr" ? (
                <InlineButton
                  label={translateUi(draft.draft ? "[D] Draft: sim" : "[D] Draft: não")}
                  accent={COLORS.git}
                  onPress={() => onChange({ draft: !draft.draft })}
                />
              ) : null}
            </box>
          </scrollbox>
          <text
            content={translateUi("Revise os dados antes de criar no GitHub.")}
            style={{ fg: COLORS.warning }}
          />
          <text
            content={error || (invalid ? translateUi(invalid) : "")}
            style={{ fg: COLORS.danger }}
          />
          {uncertain ? (
            <InlineButton
              label={translateUi("[V] Verifiquei no GitHub; permitir nova tentativa")}
              accent={COLORS.git}
              onPress={onAcknowledge}
            />
          ) : null}
          <box
            style={{
              height: 1,
              flexShrink: 0,
              flexDirection: "row",
              justifyContent: "space-between",
            }}
          >
            <ShortcutText
              content={translateUi("[Tab] Próximo campo  [Esc] Desfocar/cancelar")}
              style={{ fg: COLORS.muted }}
            />
            <InlineButton
              label={translateUi(busy ? "[Ctrl+S] Criando…" : "[Ctrl+S] Criar")}
              accent={COLORS.git}
              disabled={busy || uncertain || Boolean(invalid)}
              onPress={onSubmit}
            />
          </box>
        </box>
      </box>
    </>
  )
}
