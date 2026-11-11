import type { ScrollBoxRenderable } from "@opentui/core"
import { displayWidth, translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { ShortcutText } from "@xupon/tuiminal-core/ui/ShortcutText"
import { useCallback, useEffect, useRef } from "react"
import type { HttpEnvironment } from "../storage/environments"
import { HttpEnvironmentChoice } from "./HttpEnvironmentChoice"
import {
  type HttpEnvironmentFormMode,
  type HttpEnvironmentRow,
  HttpEnvironmentTableRow,
} from "./HttpEnvironmentTableRow"

export type { HttpEnvironmentFormMode, HttpEnvironmentRow } from "./HttpEnvironmentTableRow"

export function environmentFormRows(environment?: HttpEnvironment): HttpEnvironmentRow[] {
  return [
    ...Object.entries(environment?.values ?? {}).map(([name, value]) => ({
      id: crypto.randomUUID(),
      name,
      value,
    })),
    { id: crypto.randomUUID(), name: "", value: "" },
  ]
}

const inputStyle = {
  flexGrow: 1,
  backgroundColor: COLORS.panelRaised,
  focusedBackgroundColor: COLORS.panelRaised,
  textColor: COLORS.text,
  focusedTextColor: COLORS.text,
  selectionFg: COLORS.text,
  cursorColor: COLORS.http,
  placeholderColor: COLORS.muted,
}

export function HttpEnvironmentList({
  environments,
  activeName,
  selection,
  contentWidth,
  onSelect,
  onCreate,
  onOpenGlobals,
  onEdit,
  onDelete,
}: {
  environments: HttpEnvironment[]
  activeName: string | null
  selection: number
  contentWidth: number
  onSelect: (name: string | null) => void
  onCreate: () => void
  onOpenGlobals: () => void
  onEdit: (name: string) => void
  onDelete: (name: string) => void
}) {
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)
  const choices: Array<string | null> = [
    null,
    ...environments.map((environment) => environment.name),
  ]
  const createLabel = "[N] Novo ambiente"
  const hintsWidth = Math.max(1, contentWidth - displayWidth(translateUi(createLabel)) - 2)
  const hintSegments = translateUi("[↑/↓] Navegar · [Enter] Usar · [E] Editar · [D] Excluir").split(
    " · ",
  )
  let visibleHints = ""
  for (const segment of hintSegments) {
    const next = visibleHints ? `${visibleHints} · ${segment}` : segment
    if (displayWidth(next) > hintsWidth) break
    visibleHints = next
  }
  if (!visibleHints) visibleHints = truncateDisplay(hintSegments[0] ?? "", hintsWidth)
  useEffect(() => {
    scrollRef.current?.scrollTo(Math.max(0, selection - 2))
  }, [selection])
  return (
    <>
      <text
        content={translateUi("Escolha o ambiente usado para preparar e enviar requests.")}
        style={{ fg: COLORS.muted }}
      />
      <InlineButton
        id="http-environment-globals"
        label="[G] Globals · sempre ativo"
        accent={COLORS.http}
        active
        onPress={onOpenGlobals}
      />
      <scrollbox
        ref={scrollRef}
        scrollY
        viewportCulling
        style={{ flexGrow: 1, minHeight: 0, overflow: "hidden", paddingTop: 1 }}
      >
        {choices.map((name, index) => {
          const environment = name
            ? environments.find((candidate) => candidate.name === name)
            : undefined
          return (
            <HttpEnvironmentChoice
              key={name ?? "none"}
              name={name}
              production={!!environment?.production}
              current={name === activeName}
              selected={index === selection}
              index={index}
              width={contentWidth}
              onSelect={onSelect}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          )
        })}
      </scrollbox>
      <box
        id="http-environment-list-footer"
        style={{ height: 1, flexShrink: 0, flexDirection: "row", overflow: "hidden" }}
      >
        <ShortcutText
          id="http-environment-list-hints"
          content={visibleHints}
          style={{ width: hintsWidth, flexShrink: 0, overflow: "hidden", fg: COLORS.muted }}
        />
        <InlineButton
          id="http-environment-new"
          label={createLabel}
          accent={COLORS.http}
          onPress={onCreate}
        />
      </box>
    </>
  )
}

function formHint(mode: HttpEnvironmentFormMode, globals: boolean) {
  if (mode === "name" || mode === "cell") return "[Tab] Próximo campo · [Shift+Tab] Anterior"
  return globals
    ? "[/] Tabela · [Enter] Editar · [Tab] Próximo · [Esc] Voltar"
    : "[/] Nome ou tabela · [Enter] Editar · [Tab] Próximo · [Esc] Voltar"
}

export function HttpEnvironmentCreateForm({
  formKind,
  name,
  rows,
  mode,
  target,
  rowIndex,
  column,
  busy,
  error,
  onNameChange,
  onRowChange,
  onChooseName,
  onChooseTable,
  onSave,
  onFocusName,
  onFocusCell,
}: {
  formKind: "create" | "edit" | "globals"
  name: string
  rows: HttpEnvironmentRow[]
  mode: HttpEnvironmentFormMode
  target: "name" | "table"
  rowIndex: number
  column: 0 | 1
  busy: boolean
  error: string
  onNameChange: (value: string) => void
  onRowChange: (index: number, column: 0 | 1, value: string) => void
  onChooseName: () => void
  onChooseTable: () => void
  onSave: () => void
  onFocusName: () => void
  onFocusCell: (index: number, column: 0 | 1) => void
}) {
  const tableScrollRef = useRef<ScrollBoxRenderable | null>(null)
  const revealRow = useCallback(() => {
    if (mode === "table" || mode === "cell") {
      const scroll = tableScrollRef.current
      if (!scroll) return
      const precedingRows = Math.min(2, Math.max(0, scroll.viewport.height - 1))
      scroll.scrollTo(Math.max(0, rowIndex - precedingRows))
    }
  }, [mode, rowIndex])
  useEffect(revealRow, [revealRow])
  return (
    <>
      <text
        content={translateUi(
          formKind === "create"
            ? "Novo ambiente"
            : formKind === "edit"
              ? "Editar ambiente"
              : "Globals · sempre ativo",
        )}
        style={{ fg: COLORS.http, flexShrink: 0 }}
      />
      <box
        id="http-environment-name-block"
        style={{
          height: 1,
          flexShrink: 0,
          flexDirection: "row",
          backgroundColor: COLORS.panelRaised,
        }}
      >
        <box
          id="http-environment-name-rail"
          style={{
            width: 1,
            flexShrink: 0,
            backgroundColor:
              mode === "choose" && target === "name" ? COLORS.http : COLORS.panelRaised,
          }}
        />
        {mode === "choose" && formKind !== "globals" ? (
          <InlineButton
            id="http-environment-target-name"
            label="[Enter] Nome"
            accent={COLORS.http}
            active={target === "name"}
            onPress={onChooseName}
          />
        ) : (
          <text content={translateUi("NOME")} style={{ width: 12, fg: COLORS.muted }} />
        )}
        {formKind === "globals" ? (
          <text content="Globals" style={{ flexGrow: 1, fg: COLORS.text, bg: COLORS.canvas }} />
        ) : (
          <input
            id="http-environment-create-name"
            value={name}
            placeholder={translateUi("Nome do ambiente")}
            maxLength={80}
            onInput={onNameChange}
            onMouseDown={onFocusName}
            style={{
              ...inputStyle,
              backgroundColor: COLORS.canvas,
              focusedBackgroundColor: COLORS.canvas,
            }}
          />
        )}
      </box>
      <box
        id="http-environment-table-block"
        style={{
          flexGrow: 1,
          minHeight: 0,
          overflow: "hidden",
          flexDirection: "row",
          backgroundColor: COLORS.panelRaised,
        }}
      >
        <box
          id="http-environment-table-rail"
          style={{
            width: 1,
            flexShrink: 0,
            backgroundColor:
              mode === "choose" && target === "table" ? COLORS.http : COLORS.panelRaised,
          }}
        />
        <box style={{ flexGrow: 1, minHeight: 0, overflow: "hidden" }}>
          {mode === "choose" ? (
            <InlineButton
              id="http-environment-target-table"
              label="[Enter] Tabela"
              accent={COLORS.http}
              active={target === "table"}
              onPress={onChooseTable}
            />
          ) : null}
          <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
            <text content={translateUi("VARIÁVEL")} style={{ width: "50%", fg: COLORS.muted }} />
            <text content={translateUi("VALOR")} style={{ fg: COLORS.muted }} />
          </box>
          <scrollbox
            ref={tableScrollRef}
            scrollY
            viewportCulling
            onSizeChange={revealRow}
            style={{ flexGrow: 1, minHeight: 0, overflow: "hidden" }}
          >
            {rows.map((row, index) => (
              <HttpEnvironmentTableRow
                key={row.id}
                row={row}
                index={index}
                mode={mode}
                rowIndex={rowIndex}
                column={column}
                onRowChange={onRowChange}
                onFocusCell={onFocusCell}
              />
            ))}
          </scrollbox>
        </box>
      </box>
      {mode === "choose" ? (
        <ShortcutText
          id="http-environment-form-hints"
          content="[↑/↓] Nome/Tabela · [Enter] Editar · [Esc] Voltar"
          style={{ fg: COLORS.muted, flexShrink: 0 }}
        />
      ) : (
        <ShortcutText
          id="http-environment-form-hints"
          content={formHint(mode, formKind === "globals")}
          style={{ fg: COLORS.muted, flexShrink: 0 }}
        />
      )}
      {error ? <text content={translateUi(error)} style={{ fg: COLORS.danger }} /> : null}
      <box
        style={{
          minHeight: 1,
          flexShrink: 0,
          flexDirection: "row",
          flexWrap: "wrap",
          justifyContent: "flex-end",
          backgroundColor: COLORS.panelRaised,
        }}
      >
        <InlineButton
          id="http-environment-create-save"
          label={
            busy
              ? "SALVANDO…"
              : formKind === "create"
                ? "[Ctrl+S] Criar ambiente"
                : "[Ctrl+S] Salvar ambiente"
          }
          accent={COLORS.http}
          disabled={busy}
          onPress={onSave}
        />
      </box>
    </>
  )
}
