import type { BoxRenderable, InputRenderable } from "@opentui/core"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { Button } from "@tuiparts/react/button"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { COLORS } from "../../../../core/settings/theme"
import { translateUi } from "../../../../shared/i18n"
import { InlineButton } from "../../../../shared/ui/InlineButton"
import { ShortcutText } from "../../../../shared/ui/ShortcutText"
import { ISSUE_COLUMNS } from "../../model/issue/config"
import { parseIssueSectionOptions } from "../../model/issue/sections"
import type { IssueColumn, IssueSort } from "../../model/issue/types"
import { readGitHubSearchQuery } from "../../model/search-query"
import { GitHubQuerySuggestions } from "../query/GitHubQuerySuggestions"
import { useGitHubQueryAutocomplete } from "../query/useGitHubQueryAutocomplete"

export type IssueSectionEditorMode = "query" | "create" | "edit"
export type IssueSectionEditorValues = {
  title: string
  query: string
  columns: IssueColumn[]
  sort: IssueSort
  limit: number
}

type InputValues = { title: string; query: string; columns: string; sort: string; limit: string }

export function IssueSectionEditorModal({
  mode,
  initialTitle,
  initialQuery,
  initialColumns = ISSUE_COLUMNS,
  initialSort = "updated-desc",
  initialLimit = 20,
  repositories = [],
  onClose,
  onApply,
  onSave,
}: {
  mode: IssueSectionEditorMode
  initialTitle: string
  initialQuery: string
  initialColumns?: readonly IssueColumn[]
  initialSort?: IssueSort
  initialLimit?: number
  repositories?: readonly string[]
  onClose: () => void
  onApply: (query: string) => void
  onSave: (values: IssueSectionEditorValues) => void
}) {
  const renderer = useRenderer()
  const terminal = useTerminalDimensions()
  const dialogRef = useRef<BoxRenderable | null>(null)
  const titleRef = useRef<InputRenderable | null>(null)
  const queryRef = useRef<InputRenderable | null>(null)
  const columnsRef = useRef<InputRenderable | null>(null)
  const sortRef = useRef<InputRenderable | null>(null)
  const limitRef = useRef<InputRenderable | null>(null)
  const initialValues = useMemo<InputValues>(
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

  const validate = useCallback(() => {
    const title = valuesRef.current.title.trim()
    if (hasTitle && !title) return translateUi("Informe o nome da seção.")
    try {
      const { normalized: query } = readGitHubSearchQuery(valuesRef.current.query)
      if (!query) return translateUi("Informe uma query do GitHub.")
      if (!hasTitle) {
        return {
          title,
          query,
          columns: [...ISSUE_COLUMNS],
          sort: "updated-desc" as const,
          limit: 20,
        }
      }
      return { title, query, ...parseIssueSectionOptions(valuesRef.current) }
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

  const update = (field: keyof InputValues, value: string) => {
    const next = { ...valuesRef.current, [field]: value }
    valuesRef.current = next
    setValues(next)
    setError("")
  }

  const autocomplete = useGitHubQueryAutocomplete({
    active: true,
    inputId: "git-issue-section-editor-query",
    query: values.query,
    kind: "issue",
    repositories,
    onChange: (query) => update("query", query),
  })

  useEffect(() => {
    valuesRef.current = initialValues
    setValues(initialValues)
    setError("")
    renderer.currentFocusedRenderable?.blur()
    const timeout = setTimeout(() => (hasTitle ? titleRef.current : queryRef.current)?.focus(), 0)
    return () => clearTimeout(timeout)
  }, [hasTitle, initialValues, renderer])

  useKeyboard((key) => {
    if (key.name === "escape") {
      key.preventDefault()
      key.stopPropagation()
      const focused = renderer.currentFocusedRenderable
      if (
        focused?.id?.startsWith("git-issue-section-editor-") &&
        focused.id !== "git-issue-section-editor-modal"
      ) {
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

  const width = Math.max(42, Math.min(92, terminal.width - 4))
  const title =
    mode === "query"
      ? "◆ FILTRAR ISSUES"
      : mode === "create"
        ? "◆ NOVA SEÇÃO DE ISSUES"
        : "◆ EDITAR SEÇÃO DE ISSUES"
  const fields: Array<{
    label: string
    id: string
    ref: React.RefObject<InputRenderable | null>
    value: string
    placeholder: string
    field: keyof InputValues
  }> = [
    ...(hasTitle
      ? [
          {
            label: "NOME",
            id: "git-issue-section-editor-title",
            ref: titleRef,
            value: values.title,
            placeholder: "Equipe",
            field: "title" as const,
          },
        ]
      : []),
    {
      label: "QUERY",
      id: "git-issue-section-editor-query",
      ref: queryRef,
      value: values.query,
      placeholder: "is:open author:@me",
      field: "query",
    },
    ...(hasTitle
      ? [
          {
            label: "COLUNAS",
            id: "git-issue-section-editor-columns",
            ref: columnsRef,
            value: values.columns,
            placeholder: "updated,state,repository,title,comments",
            field: "columns" as const,
          },
          {
            label: "ORDEM",
            id: "git-issue-section-editor-sort",
            ref: sortRef,
            value: values.sort,
            placeholder: "updated-desc",
            field: "sort" as const,
          },
          {
            label: "LIMITE",
            id: "git-issue-section-editor-limit",
            ref: limitRef,
            value: values.limit,
            placeholder: "20",
            field: "limit" as const,
          },
        ]
      : []),
  ]
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
        position="absolute"
        top={0}
        left={0}
        width="100%"
        height="100%"
        zIndex={971}
        alignItems="center"
        justifyContent="center"
      >
        <box
          ref={dialogRef}
          id="git-issue-section-editor-modal"
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
            <InlineButton
              label={translateUi("[Esc] Fechar")}
              accent={COLORS.git}
              onPress={onClose}
            />
          </box>
          {fields.map((field) => (
            <box
              key={field.id}
              style={{ height: 2, flexShrink: 0, flexDirection: "row", marginTop: 1 }}
            >
              <text
                content={`${translateUi(field.label)}  `}
                style={{ width: 8, flexShrink: 0, fg: COLORS.muted }}
              />
              <input
                ref={field.ref}
                id={field.id}
                value={field.value}
                placeholder={field.placeholder}
                width={Math.max(14, width - 13)}
                maxLength={500}
                onMouseDown={() => field.ref.current?.focus()}
                onInput={(value) => update(field.field, value)}
                {...(field.field === "query" && mode === "query" ? { onSubmit: apply } : {})}
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
          ))}
          <GitHubQuerySuggestions
            suggestions={autocomplete.suggestions}
            selectedIndex={autocomplete.selectedIndex}
            width={Math.max(20, width - 4)}
            onSelect={(index) => {
              autocomplete.apply(index)
              queryRef.current?.focus()
            }}
          />
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
              content={translateUi("[Esc] desfocar/fechar  [Tab] campo")}
              style={{ fg: COLORS.muted }}
            />
            <box style={{ height: 1, flexDirection: "row" }}>
              {mode === "query" ? (
                <InlineButton
                  label={translateUi("[Enter] Aplicar")}
                  accent={COLORS.git}
                  onPress={apply}
                />
              ) : null}
              <InlineButton
                label={translateUi("[Ctrl+S] Salvar")}
                accent={COLORS.git}
                onPress={save}
              />
            </box>
          </box>
        </box>
      </box>
    </>
  )
}
