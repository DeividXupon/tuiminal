import type { BoxRenderable, InputRenderable, TextareaRenderable } from "@opentui/core"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { Button } from "@tuiparts/react/button"
import { useEffect, useRef, useState } from "react"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { ModalSurface } from "@xupon/tuiminal-core/ui/ModalSurface"
import { ShortcutText } from "@xupon/tuiminal-core/ui/ShortcutText"
import type { GitHubCreateDraft } from "../../model/create-item"
import { validateGitHubCreateDraft } from "../../model/create-item"
import { useBlurModalFocusOnUnmount } from "../useBlurModalFocusOnUnmount"
import { GitHubCreateBranchPicker } from "./GitHubCreateBranchPicker"
import { GitHubCreateRepositoryPicker } from "./GitHubCreateRepositoryPicker"

type CreateField = "repository" | "base" | "head" | "title" | "body"

function createModalKeyAction(
  name: string,
  focusedId: string | undefined,
  ctrl: boolean,
  kind: GitHubCreateDraft["kind"],
  uncertain: boolean,
) {
  if (
    kind === "pr" &&
    ["return", "enter", "linefeed"].includes(name) &&
    (focusedId === "git-create-field-repository" ||
      focusedId === "git-create-field-base" ||
      focusedId === "git-create-field-head")
  )
    return focusedId === "git-create-field-repository"
      ? "repository"
      : focusedId === "git-create-field-base"
        ? "base"
        : "head"
  if (
    kind === "issue" &&
    ["return", "enter", "linefeed"].includes(name) &&
    focusedId === "git-create-field-repository"
  )
    return "repository"
  if (name === "escape") return "escape"
  if (ctrl && name === "s") return "submit"
  if (name === "tab") return "tab"
  if (focusedId?.startsWith("git-create-field-")) return null
  if (uncertain && name === "v") return "acknowledge"
  if (kind === "pr" && name === "d") return "draft"
  return null
}

export function GitHubCreateModal({
  draft,
  host,
  viewer,
  busy,
  uncertain,
  error,
  titleSuggestionStatus,
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
  titleSuggestionStatus: "idle" | "loading" | "error"
  onChange: (patch: Partial<GitHubCreateDraft>) => void
  onClose: () => void
  onAcknowledge: () => void
  onSubmit: () => void
}) {
  const terminal = useTerminalDimensions()
  const renderer = useRenderer()
  const dialogRef = useRef<BoxRenderable | null>(null)
  const titleRef = useRef<InputRenderable | null>(null)
  const bodyRef = useRef<TextareaRenderable | null>(null)
  const [picker, setPicker] = useState<"repository" | "base" | "head" | null>(null)
  const fields: CreateField[] =
    draft.kind === "pr"
      ? ["repository", "base", "head", "title", "body"]
      : ["repository", "title", "body"]
  useBlurModalFocusOnUnmount(dialogRef)
  useEffect(() => {
    renderer.currentFocusedRenderable?.blur()
    const timeout = setTimeout(
      () => renderer.root.findDescendantById("git-create-field-repository")?.focus(),
      0,
    )
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
      (field) => `git-create-field-${field}` === renderer.currentFocusedRenderable?.id,
    )
    const next = (current + (backward ? fields.length - 1 : 1)) % fields.length
    renderer.root.findDescendantById(`git-create-field-${fields[next] ?? "repository"}`)?.focus()
  }

  useKeyboard((key) => {
    if (picker) return
    const action = createModalKeyAction(
      key.name.toLowerCase(),
      renderer.currentFocusedRenderable?.id,
      Boolean(key.ctrl),
      draft.kind,
      uncertain,
    )
    if (!action) return
    key.preventDefault()
    key.stopPropagation()
    const handlers = {
      repository: () => {
        if (!busy) setPicker("repository")
      },
      base: () => {
        if (!busy) setPicker("base")
      },
      head: () => {
        if (!busy) setPicker("head")
      },
      escape: () => {
        if (!busy) dismissFocusedField()
      },
      submit: () => {
        if (!busy && !uncertain) onSubmit()
      },
      tab: () => focusNextField(Boolean(key.shift)),
      acknowledge: onAcknowledge,
      draft: () => onChange({ draft: !draft.draft }),
    }
    handlers[action]()
  })

  const titleField = () => (
    <box style={{ flexShrink: 0, gap: 0 }}>
      <text content={translateUi("Título")} style={{ fg: COLORS.muted }} />
      <input
        ref={titleRef}
        id="git-create-field-title"
        value={draft.title}
        onMouseDown={() => titleRef.current?.focus()}
        onInput={(next) => onChange({ title: next })}
        style={{
          backgroundColor: COLORS.panelRaised,
          focusedBackgroundColor: COLORS.panelRaised,
          textColor: COLORS.text,
          focusedTextColor: COLORS.text,
          cursorColor: COLORS.git,
        }}
      />
      {draft.kind === "pr" && titleSuggestionStatus !== "idle" ? (
        <text
          content={translateUi(
            titleSuggestionStatus === "loading"
              ? "Buscando título do último commit…"
              : "Não foi possível sugerir o título; digite-o manualmente.",
          )}
          style={{ fg: titleSuggestionStatus === "error" ? COLORS.warning : COLORS.muted }}
        />
      ) : null}
    </box>
  )
  const choiceField = (
    name: "repository" | "base" | "head",
    label: string,
    placeholder: string,
  ) => (
    <box style={{ flexShrink: 0, gap: 0 }}>
      <text content={translateUi(label)} style={{ fg: COLORS.muted }} />
      <Button
        id={`git-create-field-${name}`}
        height={1}
        onPress={() => {
          if (!busy) setPicker(name)
        }}
      >
        {(state) => (
          <box
            style={{
              width: "100%",
              height: 1,
              backgroundColor: state.focused ? COLORS.diffModifiedBg : COLORS.panelRaised,
            }}
          >
            <text
              content={`${draft[name] || translateUi(placeholder)}  ▾`}
              style={{ fg: state.focused ? COLORS.git : COLORS.text }}
            />
          </box>
        )}
      </Button>
    </box>
  )
  const width = Math.min(88, Math.max(30, terminal.width - 4))
  const height = Math.min(draft.kind === "pr" ? 23 : 19, Math.max(10, terminal.height - 2))
  const invalid = validateGitHubCreateDraft(draft)
  return (
    <>
      <ModalSurface
        id="git-create-modal"
        dialogRef={dialogRef}
        width={width}
        height={height}
        zIndex={982}
        borderColor={COLORS.git}
        onBackdropPress={() => {
          if (!busy) onClose()
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
            {choiceField("repository", "Repositório (owner/repository)", "Selecionar repositório…")}
            {draft.kind === "pr" ? (
              <>
                {choiceField("base", "Branch base (remota)", "Selecionar branch…")}
                {choiceField(
                  "head",
                  "Branch comparada (remota, mesmo repositório)",
                  "Selecionar branch…",
                )}
              </>
            ) : null}
            {titleField()}
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
      </ModalSurface>
      {picker === "repository" ? (
        <GitHubCreateRepositoryPicker
          host={host}
          selected={draft.repository}
          demo={
            process.env[
              draft.kind === "pr" ? "TUIMINAL_GIT_PR_DEMO" : "TUIMINAL_GIT_ISSUES_DEMO"
            ] === "1"
          }
          onSelect={(repository) => onChange({ repository })}
          onClose={() => {
            setPicker(null)
            setTimeout(
              () => renderer.root.findDescendantById("git-create-field-repository")?.focus(),
              0,
            )
          }}
        />
      ) : picker ? (
        <GitHubCreateBranchPicker
          side={picker}
          host={host}
          repository={draft.repository.trim()}
          selected={draft[picker] ?? ""}
          demo={process.env.TUIMINAL_GIT_PR_DEMO === "1"}
          onSelect={(branch) => onChange({ [picker]: branch })}
          onClose={() => {
            const field = picker
            setPicker(null)
            setTimeout(
              () => renderer.root.findDescendantById(`git-create-field-${field}`)?.focus(),
              0,
            )
          }}
        />
      ) : null}
    </>
  )
}
