import type { ScrollBoxRenderable } from "@opentui/core"
import { useEffect, useRef } from "react"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import type { HttpEnvironment } from "../storage/environments"
import {
  HttpEnvironmentTableRow,
  type HttpEnvironmentFormMode,
  type HttpEnvironmentRow,
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
      <scrollbox ref={scrollRef} scrollY viewportCulling style={{ flexGrow: 1, paddingTop: 1 }}>
        {choices.map((name, index) => {
          const environment = name
            ? environments.find((candidate) => candidate.name === name)
            : undefined
          const details = environment?.production ? " · PROD" : ""
          return (
            <box key={name ?? "none"} style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
              <box style={{ flexGrow: 1, overflow: "hidden" }}>
                <InlineButton
                  id={`http-environment-choice-${name ?? "none"}`}
                  label={truncateDisplay(
                    `${name === activeName ? "◆" : "◇"} ${name ?? translateUi("Sem ambiente")}${details}`,
                    Math.max(12, contentWidth - (name ? 24 : 2)),
                  )}
                  accent={environment?.production ? COLORS.danger : COLORS.http}
                  active={index === selection}
                  onPress={() => onSelect(name)}
                />
              </box>
              {name ? (
                <>
                  <InlineButton
                    id={`http-environment-edit-${name}`}
                    label="[E] Editar"
                    accent={COLORS.http}
                    onPress={() => onEdit(name)}
                  />
                  <InlineButton
                    id={`http-environment-delete-${name}`}
                    label="[D] Excluir"
                    accent={COLORS.danger}
                    onPress={() => onDelete(name)}
                  />
                </>
              ) : null}
            </box>
          )
        })}
      </scrollbox>
      <text
        content={translateUi("[↑/↓] Navegar · [Enter] Usar · [E] Editar · [D] Excluir")}
        style={{ fg: COLORS.muted }}
      />
      <InlineButton
        id="http-environment-new"
        label="[N] Novo ambiente"
        accent={COLORS.http}
        onPress={onCreate}
      />
    </>
  )
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
  onBack,
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
  onBack: () => void
  onSave: () => void
  onFocusName: () => void
  onFocusCell: (index: number, column: 0 | 1) => void
}) {
  const tableScrollRef = useRef<ScrollBoxRenderable | null>(null)
  useEffect(() => {
    if (mode === "table" || mode === "cell") {
      tableScrollRef.current?.scrollTo(Math.max(0, rowIndex - 2))
    }
  }, [mode, rowIndex])
  return (
    <>
      <text
        content={translateUi(
          formKind === "create"
            ? "Novo ambiente global"
            : formKind === "edit"
              ? "Editar ambiente"
              : "Globals · sempre ativo",
        )}
        style={{ fg: COLORS.http }}
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
        style={{ flexGrow: 1, flexDirection: "row", backgroundColor: COLORS.panelRaised }}
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
        <box style={{ flexGrow: 1 }}>
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
          <scrollbox ref={tableScrollRef} scrollY viewportCulling style={{ flexGrow: 1 }}>
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
        <text
          content={translateUi("[↑/↓] Nome/Tabela · [Enter] Editar · [Esc] Voltar")}
          style={{ fg: COLORS.muted }}
        />
      ) : (
        <text
          content={translateUi(
            formKind === "globals"
              ? "[/] Tabela · [Enter] Editar · [Tab] Próximo · [Esc] Voltar"
              : "[/] Nome ou tabela · [Enter] Editar · [Tab] Próximo · [Esc] Voltar",
          )}
          style={{ fg: COLORS.muted }}
        />
      )}
      {error ? <text content={translateUi(error)} style={{ fg: COLORS.danger }} /> : null}
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row", justifyContent: "flex-end" }}>
        <InlineButton
          id="http-environment-back"
          label="[B] Ambientes"
          accent={COLORS.http}
          onPress={onBack}
        />
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
