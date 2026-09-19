import type { BoxRenderable, InputRenderable } from "@opentui/core"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { ModalSurface } from "@xupon/tuiminal-core/ui/ModalSurface"
import { ShortcutText } from "@xupon/tuiminal-core/ui/ShortcutText"
import type { RemoteSectionSort } from "../../model/remote-sections"
import { readGitHubSearchQuery } from "../../model/search-query"
import { GitHubQuerySuggestions } from "../query/GitHubQuerySuggestions"
import { useGitHubQueryAutocomplete } from "../query/useGitHubQueryAutocomplete"

export type GitRemoteSectionEditorMode = "query" | "create" | "edit"
export type GitRemoteSectionEditorInputValues = {
  title: string
  query: string
  columns: string
  sort: string
  limit: string
}
export type GitRemoteSectionEditorValues<Column extends string> = {
  title: string
  query: string
  columns: Column[]
  sort: RemoteSectionSort
  limit: number
}

type Props<Column extends string> = {
  kind: "pr" | "issue"
  open: boolean
  mode: GitRemoteSectionEditorMode
  initialTitle: string
  initialQuery: string
  initialColumns: readonly Column[]
  initialSort: RemoteSectionSort
  initialLimit: number
  repositories: readonly string[]
  columnPlaceholder: string
  parseOptions: (values: GitRemoteSectionEditorInputValues) => {
    columns: Column[]
    sort: RemoteSectionSort
    limit: number
  }
  onClose: () => void
  onApply: (query: string) => void
  onSave: (values: GitRemoteSectionEditorValues<Column>) => void
}

function editorTitle(kind: "pr" | "issue", mode: GitRemoteSectionEditorMode) {
  if (kind === "pr") {
    if (mode === "query") return "◆ FILTRAR PULL REQUESTS"
    return mode === "create" ? "◆ NOVA SEÇÃO" : "◆ EDITAR SEÇÃO"
  }
  if (mode === "query") return "◆ FILTRAR ISSUES"
  return mode === "create" ? "◆ NOVA SEÇÃO DE ISSUES" : "◆ EDITAR SEÇÃO DE ISSUES"
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
  inputRef: RefObject<InputRenderable | null>
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

/** Shared PR/Issue section editor UI; each model still owns query and option rules. */
export function GitRemoteSectionEditor<Column extends string>({
  kind,
  open,
  mode,
  initialTitle,
  initialQuery,
  initialColumns,
  initialSort,
  initialLimit,
  repositories,
  columnPlaceholder,
  parseOptions,
  onClose,
  onApply,
  onSave,
}: Props<Column>) {
  const renderer = useRenderer()
  const terminal = useTerminalDimensions()
  const dialogRef = useRef<BoxRenderable | null>(null)
  const titleRef = useRef<InputRenderable | null>(null)
  const queryRef = useRef<InputRenderable | null>(null)
  const columnsRef = useRef<InputRenderable | null>(null)
  const sortRef = useRef<InputRenderable | null>(null)
  const limitRef = useRef<InputRenderable | null>(null)
  const idPrefix = `git-${kind}-section-editor`
  const initialValues = useMemo<GitRemoteSectionEditorInputValues>(
    () => ({
      title: initialTitle,
      query: initialQuery,
      columns: initialColumns.join(","),
      sort: initialSort,
      limit: String(initialLimit),
    }),
    [initialColumns, initialLimit, initialQuery, initialSort, initialTitle],
  )
  const valuesRef = useRef(initialValues)
  const [values, setValues] = useState(initialValues)
  const [error, setError] = useState("")
  const hasTitle = mode !== "query"

  const validate = useCallback((): GitRemoteSectionEditorValues<Column> | string => {
    const title = valuesRef.current.title.trim()
    if (hasTitle && !title) return translateUi("Informe o nome da seção.")
    try {
      const { normalized: query } = readGitHubSearchQuery(valuesRef.current.query)
      if (!query) return translateUi("Informe uma query do GitHub.")
      if (!hasTitle) {
        return { title, query, columns: [...initialColumns], sort: "updated-desc", limit: 20 }
      }
      return { title, query, ...parseOptions(valuesRef.current) }
    } catch (reason) {
      return translateUi(reason instanceof Error ? reason.message : "Opções da seção inválidas")
    }
  }, [hasTitle, initialColumns, parseOptions])

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

  const update = (field: keyof GitRemoteSectionEditorInputValues, value: string) => {
    const next = { ...valuesRef.current, [field]: value }
    valuesRef.current = next
    setValues(next)
    setError("")
  }

  const autocomplete = useGitHubQueryAutocomplete({
    active: open,
    inputId: `${idPrefix}-query`,
    query: values.query,
    kind,
    repositories,
    onChange: (query) => update("query", query),
  })

  useEffect(() => {
    if (!open) return
    valuesRef.current = initialValues
    setValues(initialValues)
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
      if (focused?.id?.startsWith(`${idPrefix}-`) && focused.id !== `${idPrefix}-modal`) {
        focused.blur()
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
  const suggestions = (
    <GitHubQuerySuggestions
      suggestions={autocomplete.suggestions}
      selectedIndex={autocomplete.selectedIndex}
      width={Math.max(20, width - 4)}
      onSelect={(index) => {
        autocomplete.apply(index)
        queryRef.current?.focus()
      }}
    />
  )
  return (
    <ModalSurface
      id={`${idPrefix}-modal`}
      dialogRef={dialogRef}
      width={width}
      height={hasTitle ? 25 : 16}
      zIndex={970}
      borderColor={COLORS.git}
      onBackdropPress={onClose}
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
        <text content={translateUi(editorTitle(kind, mode))} style={{ fg: COLORS.git }} />
        <InlineButton label="[Esc] Fechar" accent={COLORS.git} onPress={onClose} />
      </box>
      {hasTitle ? (
        <EditorField
          label="NOME"
          id={`${idPrefix}-title`}
          inputRef={titleRef}
          value={values.title}
          width={width}
          placeholder="Equipe"
          onInput={(value) => update("title", value)}
        />
      ) : null}
      <EditorField
        label="QUERY"
        id={`${idPrefix}-query`}
        inputRef={queryRef}
        value={values.query}
        width={width}
        placeholder="is:open author:@me"
        onInput={(value) => update("query", value)}
        onSubmit={mode === "query" ? apply : save}
      />
      {kind === "pr" ? suggestions : null}
      {hasTitle ? (
        <>
          <EditorField
            label="COLUNAS"
            id={`${idPrefix}-columns`}
            inputRef={columnsRef}
            value={values.columns}
            width={width}
            placeholder={columnPlaceholder}
            onInput={(value) => update("columns", value)}
          />
          <EditorField
            label="ORDEM"
            id={`${idPrefix}-sort`}
            inputRef={sortRef}
            value={values.sort}
            width={width}
            placeholder="updated-desc"
            onInput={(value) => update("sort", value)}
          />
          <EditorField
            label="LIMITE"
            id={`${idPrefix}-limit`}
            inputRef={limitRef}
            value={values.limit}
            width={width}
            placeholder="20"
            onInput={(value) => update("limit", value)}
          />
        </>
      ) : null}
      {kind === "issue" ? suggestions : null}
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
        <ShortcutText content="[Esc] desfocar/fechar  [Tab] campo" style={{ fg: COLORS.muted }} />
        <box style={{ height: 1, flexDirection: "row" }}>
          {mode === "query" ? (
            <InlineButton label="[Enter] Aplicar" accent={COLORS.git} onPress={apply} />
          ) : null}
          <InlineButton label="[Ctrl+S] Salvar" accent={COLORS.git} onPress={save} />
        </box>
      </box>
    </ModalSurface>
  )
}
