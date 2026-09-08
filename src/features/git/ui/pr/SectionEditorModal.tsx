import type { BoxRenderable, InputRenderable } from "@opentui/core"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { Button } from "@tuiparts/react/button"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { COLORS } from "../../../../core/settings/theme"
import { translateUi } from "../../../../shared/i18n"
import { InlineButton } from "../../../../shared/ui/InlineButton"
import { ShortcutText } from "../../../../shared/ui/ShortcutText"
import { PULL_REQUEST_COLUMNS } from "../../model/pr/config"
import { normalizePullRequestQuery } from "../../model/pr/query"
import { parsePullRequestSectionOptions } from "../../model/pr/sections"
import type { PullRequestColumn, PullRequestSort } from "../../model/pr/types"
import { GitHubQuerySuggestions } from "../query/GitHubQuerySuggestions"
import { useGitHubQueryAutocomplete } from "../query/useGitHubQueryAutocomplete"

export type SectionEditorMode = "query" | "create" | "edit"

export type SectionEditorValues = {
  title: string
  query: string
  columns: PullRequestColumn[]
  sort: PullRequestSort
  limit: number
}

type SectionEditorInputValues = {
  title: string
  query: string
  columns: string
  sort: string
  limit: string
}

export function SectionEditorModal({
  open,
  mode,
  initialTitle,
  initialQuery,
  initialColumns = PULL_REQUEST_COLUMNS,
  initialSort = "updated-desc",
  initialLimit = 20,
  repositories = [],
  onClose,
  onApply,
  onSave,
}: {
  open: boolean
  mode: SectionEditorMode
  initialTitle: string
  initialQuery: string
  initialColumns?: readonly PullRequestColumn[]
  initialSort?: PullRequestSort
  initialLimit?: number
  repositories?: readonly string[]
  onClose: () => void
  onApply: (query: string) => void
  onSave: (values: SectionEditorValues) => void
}) {
  const renderer = useRenderer()
  const terminal = useTerminalDimensions()
  const dialogRef = useRef<BoxRenderable | null>(null)
  const titleRef = useRef<InputRenderable | null>(null)
  const queryRef = useRef<InputRenderable | null>(null)
  const columnsRef = useRef<InputRenderable | null>(null)
  const sortRef = useRef<InputRenderable | null>(null)
  const limitRef = useRef<InputRenderable | null>(null)
  const initialValues = useMemo<SectionEditorInputValues>(
    () => ({
      title: initialTitle,
      query: initialQuery,
      columns: initialColumns.join(","),
      sort: initialSort,
      limit: String(initialLimit),
    }),
    [initialColumns, initialLimit, initialQuery, initialSort, initialTitle],
  )
  const valuesRef = useRef<SectionEditorInputValues>(initialValues)
  const [values, setValues] = useState(valuesRef.current)
  const [error, setError] = useState("")
  const hasTitle = mode !== "query"

  const validate = useCallback(() => {
    const title = valuesRef.current.title.trim()
    const query = normalizePullRequestQuery(valuesRef.current.query)
    if (hasTitle && !title) return translateUi("Informe o nome da seção.")
    if (!query) return translateUi("Informe uma query do GitHub.")
    if (!hasTitle) {
      return {
        title,
        query,
        columns: [...PULL_REQUEST_COLUMNS],
        sort: "updated-desc" as const,
        limit: 20,
      }
    }
    try {
      return { title, query, ...parsePullRequestSectionOptions(valuesRef.current) }
    } catch (reason) {
      return translateUi(reason instanceof Error ? reason.message : "Opções da seção inválidas")
    }
  }, [hasTitle])

  const apply = useCallback(() => {
    const result = validate()
    if (typeof result === "string") return setError(result)
    onApply(result.query)
  }, [onApply, validate])

  const save = useCallback(() => {
    const result = validate()
    if (typeof result === "string") return setError(result)
    onSave(result)
  }, [onSave, validate])

  const update = (field: keyof SectionEditorInputValues, value: string) => {
    const next = { ...valuesRef.current, [field]: value }
    valuesRef.current = next
    setValues(next)
    setError("")
  }

  const autocomplete = useGitHubQueryAutocomplete({
    active: open,
    inputId: "git-pr-section-editor-query",
    query: values.query,
    kind: "pr",
    repositories,
    onChange: (query) => update("query", query),
  })

  useEffect(() => {
    if (!open) return
    const next = initialValues
    valuesRef.current = next
    setValues(next)
    setError("")
    renderer.currentFocusedRenderable?.blur()
    const timeout = setTimeout(() => (hasTitle ? titleRef.current : queryRef.current)?.focus(), 0)
    return () => clearTimeout(timeout)
  }, [hasTitle, initialValues, open, renderer])

  useKeyboard((key) => {
    if (!open) return
    if (key.name === "escape") {
      key.preventDefault()
      key.stopPropagation()
      const focused = renderer.currentFocusedRenderable
      const focusedId = focused?.id
      if (
        focusedId?.startsWith("git-pr-section-editor-") &&
        focusedId !== "git-pr-section-editor-modal"
      ) {
        focused?.blur()
        dialogRef.current?.focus()
      } else onClose()
      return
    }
    if (key.name === "tab" && hasTitle) {
      key.preventDefault()
      const fields = [titleRef, queryRef, columnsRef, sortRef, limitRef]
      const focused = fields.findIndex(
        (field) => field.current?.id === renderer.currentFocusedRenderable?.id,
      )
      fields[(focused + 1) % fields.length]?.current?.focus()
      return
    }
    if (key.ctrl && key.name === "s") {
      key.preventDefault()
      key.stopPropagation()
      save()
    }
  })

  if (!open) return null
  const width = Math.max(42, Math.min(92, terminal.width - 4))
  const title =
    mode === "query"
      ? "◆ FILTRAR PULL REQUESTS"
      : mode === "create"
        ? "◆ NOVA SEÇÃO"
        : "◆ EDITAR SEÇÃO"
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
          id="git-pr-section-editor-modal"
          focusable
          style={{
            width,
            height: hasTitle ? 25 : 16,
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
            <text content={translateUi(title)} style={{ fg: COLORS.git }} />
            <InlineButton label="[Esc] Fechar" accent={COLORS.git} onPress={onClose} />
          </box>
          {hasTitle ? (
            <EditorField
              label="NOME"
              id="git-pr-section-editor-title"
              inputRef={titleRef}
              value={values.title}
              width={width}
              placeholder="Equipe"
              onInput={(value) => update("title", value)}
            />
          ) : null}
          <EditorField
            label="QUERY"
            id="git-pr-section-editor-query"
            inputRef={queryRef}
            value={values.query}
            width={width}
            placeholder="is:open author:@me"
            onInput={(value) => update("query", value)}
            onSubmit={mode === "query" ? apply : save}
          />
          <GitHubQuerySuggestions
            suggestions={autocomplete.suggestions}
            selectedIndex={autocomplete.selectedIndex}
            width={Math.max(20, width - 4)}
            onSelect={(index) => {
              autocomplete.apply(index)
              queryRef.current?.focus()
            }}
          />
          {hasTitle ? (
            <>
              <EditorField
                label="COLUNAS"
                id="git-pr-section-editor-columns"
                inputRef={columnsRef}
                value={values.columns}
                width={width}
                placeholder="repository,title,review,ci,changes"
                onInput={(value) => update("columns", value)}
              />
              <EditorField
                label="ORDEM"
                id="git-pr-section-editor-sort"
                inputRef={sortRef}
                value={values.sort}
                width={width}
                placeholder="updated-desc"
                onInput={(value) => update("sort", value)}
              />
              <EditorField
                label="LIMITE"
                id="git-pr-section-editor-limit"
                inputRef={limitRef}
                value={values.limit}
                width={width}
                placeholder="20"
                onInput={(value) => update("limit", value)}
              />
            </>
          ) : null}
          <text
            content={
              error ||
              translateUi("Use filtros do GitHub; o escopo de repositórios é aplicado à parte.")
            }
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
            <ShortcutText
              content="[Esc] desfocar/fechar  [Tab] campo"
              style={{ fg: COLORS.muted }}
            />
            <box style={{ height: 1, flexDirection: "row" }}>
              {mode === "query" ? (
                <InlineButton label="[Enter] Aplicar" accent={COLORS.git} onPress={apply} />
              ) : null}
              <InlineButton label="[Ctrl+S] Salvar" accent={COLORS.git} onPress={save} />
            </box>
          </box>
        </box>
      </box>
    </>
  )
}

function EditorField({
  label,
  id,
  inputRef,
  value,
  width,
  placeholder,
  onInput,
  onSubmit,
}: {
  label: string
  id: string
  inputRef: React.RefObject<InputRenderable | null>
  value: string
  width: number
  placeholder: string
  onInput: (value: string) => void
  onSubmit?: () => void
}) {
  return (
    <box style={{ height: 2, flexShrink: 0, flexDirection: "row", marginTop: 1 }}>
      <text
        content={`${translateUi(label)}  `}
        style={{ width: 8, flexShrink: 0, fg: COLORS.muted }}
      />
      <input
        ref={inputRef}
        id={id}
        value={value}
        placeholder={placeholder}
        width={Math.max(14, width - 13)}
        maxLength={500}
        onMouseDown={() => inputRef.current?.focus()}
        onInput={onInput}
        {...(onSubmit ? { onSubmit } : {})}
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
  )
}
