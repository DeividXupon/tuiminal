import type { InputRenderable } from "@opentui/core"
import { useKeyboard } from "@opentui/react"
import { useEffect, useRef, type RefObject } from "react"
import { COLORS } from "../../../core/settings/theme"
import { translateUi } from "../../../shared/i18n/index"
import { InlineButton } from "../../../shared/ui/InlineButton"
import type { HttpDocumentState, HttpResponseSnapshot, HttpResponseView } from "../model/types"
import type { HttpCookie } from "../services/cookies"
import { HttpResponseMoreTabs } from "./HttpResponseMoreTabs"

function viewLabel(view: HttpResponseView) {
  return { pretty: "Pretty", raw: "Raw", headers: "Headers", timing: "Timing", more: "Mais" }[view]
}

function ResponseInput({
  id,
  value,
  placeholder,
  inputRef,
  registerInput,
  onChange,
  onSubmit,
  onEscape,
}: {
  id: string
  value: string
  placeholder: string
  inputRef: RefObject<InputRenderable | null>
  registerInput?: (input: InputRenderable | null) => void
  onChange: (value: string) => void
  onSubmit: () => void
  onEscape: () => void
}) {
  return (
    <input
      ref={(input) => {
        inputRef.current = input
        registerInput?.(input)
      }}
      id={id}
      value={value}
      placeholder={translateUi(placeholder)}
      onInput={onChange}
      onSubmit={onSubmit}
      onKeyDown={(event) => {
        if (event.name !== "escape") return
        event.preventDefault()
        event.stopPropagation()
        inputRef.current?.blur()
        onEscape()
      }}
      onMouseDown={() => inputRef.current?.focus()}
      style={{
        flexGrow: 1,
        backgroundColor: COLORS.canvas,
        focusedBackgroundColor: COLORS.panelRaised,
      }}
    />
  )
}

function ResponseActions({
  document,
  response,
  searchRef,
  jsonPathRef,
  onChange,
  onCopy,
  onCopyLine,
  onSave,
  onOpen,
  onDownload,
  onCancelDownload,
  downloading,
}: {
  document: HttpDocumentState
  response: HttpResponseSnapshot
  searchRef: RefObject<InputRenderable | null>
  jsonPathRef: RefObject<InputRenderable | null>
  onChange: (patch: Partial<HttpDocumentState["responsePresentation"]>) => void
  onCopy: () => void
  onCopyLine: (() => void) | null
  onSave: () => void
  onOpen: () => void
  onDownload: () => void
  onCancelDownload: () => void
  downloading: boolean
}) {
  const presentation = document.responsePresentation
  const supportsJson = response.bodyKind === "json" && document.responseView === "pretty"
  const nextFold = presentation.foldDepth === null ? 2 : presentation.foldDepth === 2 ? 1 : null
  return (
    <box style={{ height: 1, flexShrink: 0, flexDirection: "row", overflow: "hidden" }}>
      <InlineButton
        label="[Ctrl+F] Buscar"
        accent={COLORS.http}
        active={presentation.searchOpen}
        onPress={() => {
          onChange({ searchOpen: true })
          setTimeout(() => searchRef.current?.focus(), 0)
        }}
      />
      <InlineButton
        label="Wrap"
        accent={COLORS.http}
        active={presentation.wrap}
        onPress={() => onChange({ wrap: !presentation.wrap })}
      />
      <InlineButton
        label="Linhas"
        accent={COLORS.http}
        active={presentation.lineNumbers}
        onPress={() => onChange({ lineNumbers: !presentation.lineNumbers })}
      />
      {supportsJson ? (
        <InlineButton
          label={presentation.foldDepth === null ? "Fold" : `Fold ${presentation.foldDepth}`}
          accent={COLORS.http}
          active={presentation.foldDepth !== null}
          onPress={() => onChange({ foldDepth: nextFold })}
        />
      ) : null}
      {supportsJson ? (
        <InlineButton
          label="JSONPath"
          accent={COLORS.http}
          active={presentation.jsonPathOpen}
          onPress={() => {
            onChange({ jsonPathOpen: !presentation.jsonPathOpen })
            setTimeout(() => jsonPathRef.current?.focus(), 0)
          }}
        />
      ) : null}
      <InlineButton
        label="Copiar"
        accent={COLORS.http}
        disabled={
          response.bodyKind === "binary" &&
          (document.responseView === "pretty" || document.responseView === "raw")
        }
        onPress={onCopy}
      />
      {onCopyLine ? (
        <InlineButton label="Copiar linha" accent={COLORS.http} onPress={onCopyLine} />
      ) : null}
      <InlineButton label="Salvar" accent={COLORS.http} onPress={onSave} />
      {response.bodyKind === "binary" ? (
        <InlineButton label="[O] Abrir" accent={COLORS.http} onPress={onOpen} />
      ) : null}
      {response.truncated ? (
        <InlineButton
          label={downloading ? "Cancelar download" : "Baixar completo"}
          accent={downloading ? COLORS.danger : COLORS.http}
          active={downloading}
          onPress={downloading ? onCancelDownload : onDownload}
        />
      ) : null}
    </box>
  )
}

function SearchRow({
  document,
  searchRef,
  matches,
  registerSearchInput,
  onChange,
  onNext,
}: {
  document: HttpDocumentState
  searchRef: RefObject<InputRenderable | null>
  matches: number
  registerSearchInput: (input: InputRenderable | null) => void
  onChange: (patch: Partial<HttpDocumentState["responsePresentation"]>) => void
  onNext: () => void
}) {
  const presentation = document.responsePresentation
  const current =
    presentation.searchQuery && matches ? (presentation.searchMatchIndex % matches) + 1 : 0
  return (
    <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
      <ResponseInput
        id={`http-response-search-${document.request.id}`}
        value={presentation.searchQuery}
        placeholder="BUSCAR NA RESPOSTA"
        inputRef={searchRef}
        registerInput={registerSearchInput}
        onChange={(searchQuery) => onChange({ searchQuery, searchMatchIndex: 0 })}
        onSubmit={onNext}
        onEscape={() => onChange({ searchOpen: false })}
      />
      <text
        content={`${current}/${matches}`}
        style={{ fg: matches ? COLORS.http : COLORS.muted }}
      />
      <InlineButton
        label="[Enter] Próximo"
        accent={COLORS.http}
        disabled={!matches}
        onPress={onNext}
      />
      <InlineButton
        label="[Esc] Fechar"
        accent={COLORS.http}
        onPress={() => onChange({ searchOpen: false })}
      />
    </box>
  )
}

function JsonPathRow({
  document,
  jsonPathRef,
  onChange,
}: {
  document: HttpDocumentState
  jsonPathRef: RefObject<InputRenderable | null>
  onChange: (patch: Partial<HttpDocumentState["responsePresentation"]>) => void
}) {
  return (
    <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
      <ResponseInput
        id={`http-response-jsonpath-${document.request.id}`}
        value={document.responsePresentation.jsonPath}
        placeholder="JSONPATH · $.items[0].id"
        inputRef={jsonPathRef}
        onChange={(jsonPath) => onChange({ jsonPath })}
        onSubmit={() => jsonPathRef.current?.blur()}
        onEscape={() => onChange({ jsonPathOpen: false, jsonPath: "" })}
      />
      <InlineButton
        label="[Esc] Fechar"
        accent={COLORS.http}
        onPress={() => onChange({ jsonPathOpen: false, jsonPath: "" })}
      />
    </box>
  )
}

export function HttpResponseToolbar({
  document,
  response,
  cookies,
  matches,
  registerSearchInput,
  onSelectView,
  onChange,
  onSearchNext,
  onFocus,
  onCopy,
  onCopyLine,
  onSave,
  onOpen,
  onDownload,
  onCancelDownload,
  downloading,
  active,
}: {
  document: HttpDocumentState
  response: HttpResponseSnapshot | null
  cookies: HttpCookie[]
  matches: number
  registerSearchInput: (input: InputRenderable | null) => void
  onSelectView: (view: HttpResponseView) => void
  onChange: (patch: Partial<HttpDocumentState["responsePresentation"]>) => void
  onSearchNext: () => void
  onFocus: () => void
  onCopy: () => void
  onCopyLine: (() => void) | null
  onSave: () => void
  onOpen: () => void
  onDownload: () => void
  onCancelDownload: () => void
  downloading: boolean
  active: boolean
}) {
  const searchRef = useRef<InputRenderable | null>(null)
  const jsonPathRef = useRef<InputRenderable | null>(null)
  const presentation = document.responsePresentation
  const contentView =
    document.responseView === "pretty" ||
    document.responseView === "raw" ||
    document.responseView === "headers"
  useKeyboard((key) => {
    if (!active || key.name !== "escape") return
    if (presentation.searchOpen) {
      key.preventDefault()
      key.stopPropagation()
      onChange({ searchOpen: false })
    } else if (presentation.jsonPathOpen) {
      key.preventDefault()
      key.stopPropagation()
      onChange({ jsonPathOpen: false, jsonPath: "" })
    }
  })
  useEffect(() => {
    if (!presentation.searchOpen) return
    const timer = setTimeout(() => searchRef.current?.focus(), 0)
    return () => clearTimeout(timer)
  }, [presentation.searchOpen])
  useEffect(() => {
    if (!presentation.jsonPathOpen) return
    const timer = setTimeout(() => jsonPathRef.current?.focus(), 0)
    return () => clearTimeout(timer)
  }, [presentation.jsonPathOpen])
  return (
    <>
      <box
        style={{
          height: 1,
          flexShrink: 0,
          flexDirection: "row",
          backgroundColor: COLORS.panelRaised,
          overflow: "hidden",
        }}
      >
        {(["pretty", "raw", "headers", "timing", "more"] as const).map((view) => (
          <InlineButton
            key={view}
            label={viewLabel(view)}
            accent={COLORS.http}
            active={document.responseView === view}
            onPress={() => {
              onFocus()
              onSelectView(view)
            }}
          />
        ))}
      </box>
      {response && document.responseView === "more" ? (
        <HttpResponseMoreTabs
          active={presentation.moreView}
          response={response}
          cookieCount={cookies.length}
          onChange={(moreView) => onChange({ moreView })}
        />
      ) : null}
      {response && contentView ? (
        <ResponseActions
          document={document}
          response={response}
          searchRef={searchRef}
          jsonPathRef={jsonPathRef}
          onChange={onChange}
          onCopy={onCopy}
          onCopyLine={onCopyLine}
          onSave={onSave}
          onOpen={onOpen}
          onDownload={onDownload}
          onCancelDownload={onCancelDownload}
          downloading={downloading}
        />
      ) : null}
      {response && presentation.searchOpen ? (
        <SearchRow
          document={document}
          searchRef={searchRef}
          matches={matches}
          registerSearchInput={registerSearchInput}
          onChange={onChange}
          onNext={onSearchNext}
        />
      ) : null}
      {response &&
      presentation.jsonPathOpen &&
      response.bodyKind === "json" &&
      document.responseView === "pretty" ? (
        <JsonPathRow document={document} jsonPathRef={jsonPathRef} onChange={onChange} />
      ) : null}
    </>
  )
}
