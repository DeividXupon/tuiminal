import type { InputRenderable } from "@opentui/core"
import { useMemo, useRef, useState } from "react"
import { COLORS } from "../../../core/settings/theme"
import { displayWidth, translateUi, truncateDisplay } from "../../../shared/i18n/index"
import { InlineButton } from "../../../shared/ui/InlineButton"
import { buildHttpCollectionTree } from "../model/collection-tree"
import type { HttpProjectRequestItem, HttpWorkspaceState } from "../model/types"

export function HttpCollectionTree({
  state,
  contentWidth,
  projectRequests,
  projectErrors,
  registerSearchInput,
  onFocus,
  onOpen,
  onImport,
  onRun,
}: {
  state: HttpWorkspaceState
  contentWidth: number
  projectRequests: HttpProjectRequestItem[]
  projectErrors: number
  registerSearchInput: (input: InputRenderable | null) => void
  onFocus: () => void
  onOpen: (request: HttpProjectRequestItem) => void
  onImport: () => void
  onRun: () => void
}) {
  const [query, setQuery] = useState("")
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const searchRef = useRef<InputRenderable | null>(null)
  const rows = useMemo(
    () => buildHttpCollectionTree(projectRequests, collapsed, query),
    [collapsed, projectRequests, query],
  )
  const toggle = (id: string) =>
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const compactActions = contentWidth < 26
  const compactSearch = contentWidth < 30

  return (
    <>
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
        <InlineButton
          id="http-collection-import-button"
          label={compactActions ? "[I]" : "[I] Importar"}
          accent={COLORS.http}
          onPress={onImport}
        />
        <InlineButton
          id="http-collection-runner-button"
          label={compactActions ? "[R]" : "[R] Rodar"}
          accent={COLORS.http}
          onPress={onRun}
        />
      </box>
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
        <InlineButton
          id="http-collection-search-button"
          label={compactSearch ? "[F]" : "[F] Buscar"}
          accent={COLORS.http}
          active={Boolean(query)}
          onPress={() => {
            onFocus()
            searchRef.current?.focus()
          }}
        />
        <input
          ref={(input) => {
            searchRef.current = input
            registerSearchInput(input)
          }}
          id="http-collection-search"
          value={query}
          placeholder={compactSearch ? "…" : translateUi("Buscar coleção")}
          onInput={setQuery}
          onMouseDown={() => {
            onFocus()
            searchRef.current?.focus()
          }}
          style={{
            flexGrow: 1,
            backgroundColor: COLORS.canvas,
            focusedBackgroundColor: COLORS.panelRaised,
          }}
        />
        {query ? (
          <InlineButton
            id="http-collection-search-clear"
            label="[×]"
            accent={COLORS.danger}
            onPress={() => setQuery("")}
          />
        ) : null}
      </box>
      {rows.length ? (
        rows.map((row) => {
          const indent = "  ".repeat(row.depth)
          const indentWidth = displayWidth(indent)
          if (row.kind === "request") {
            const nameWidth = Math.max(
              1,
              contentWidth - 2 - indentWidth - displayWidth(row.item.request.method) - 1,
            )
            return (
              <InlineButton
                key={row.id}
                id={`http-navigation-project-${row.item.request.id}`}
                label={`${indent}${row.item.request.method} ${truncateDisplay(
                  row.item.request.name,
                  nameWidth,
                )}`}
                accent={COLORS.http}
                active={row.item.request.id === state.activeDocumentId}
                onPress={() => {
                  onFocus()
                  onOpen(row.item)
                }}
              />
            )
          }
          const count = ` (${row.requestCount})`
          const nameWidth = Math.max(1, contentWidth - 2 - indentWidth - 2 - displayWidth(count))
          return (
            <InlineButton
              key={row.id}
              id={`http-collection-${row.kind}-${row.path}`}
              label={`${indent}${row.expanded ? "▾" : "▸"} ${truncateDisplay(
                row.name,
                nameWidth,
              )}${count}`}
              accent={COLORS.http}
              onPress={() => toggle(row.id)}
            />
          )
        })
      ) : (
        <text
          content={truncateDisplay(
            translateUi(
              query
                ? "Nenhum request corresponde à busca."
                : "Nenhum arquivo .http ou .rest no projeto.",
            ),
            contentWidth,
          )}
          style={{ fg: COLORS.muted }}
        />
      )}
      {projectErrors ? (
        <text
          content={truncateDisplay(
            translateUi(`${projectErrors} arquivo(s) não puderam ser lidos.`),
            contentWidth,
          )}
          style={{ fg: COLORS.warning }}
        />
      ) : null}
    </>
  )
}
