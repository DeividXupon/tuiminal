import { HttpBoxSelection } from "./HttpBoxSelection"
import { useHttpEnvironmentKeyboard } from "../hooks/use-http-environment-keyboard"
import { ShortcutText } from "@xupon/tuiminal-core/ui/ShortcutText"
import { BRAND_COLOR } from "@xupon/tuiminal-core/ui/brand"
import { useRef } from "react"
import { COLORS, focusedPanelBorder } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import type { HttpEnvironmentTabs } from "../hooks/use-http-environment-tabs"
import type { HttpEnvironmentDocument } from "../model/environment-documents"

export function HttpEnvironmentPane({
  environments,
  document,
  active,
  position,
  onFocus,
  onBack,
}: {
  environments: HttpEnvironmentTabs
  document: HttpEnvironmentDocument
  active: boolean
  position: { left: number; top: number; width: number; height: number }
  onFocus: () => void
  onBack: () => void
}) {
  const global = document.key === "@globals"
  const blankId = useRef(crypto.randomUUID())
  const rows = environmentRows(document, blankId)
  const rowsRef = useRef(rows)
  rowsRef.current = rows
  const unavailable = Boolean(
    document.loading || document.busy || (!document.baseline && !document.fresh),
  )
  const keyboard = useHttpEnvironmentKeyboard({
    active,
    document,
    rowCount: rows.length,
    unavailable,
    onBack,
    onDeleteRow: (index) =>
      environments.edit(document.id, {
        rows: document.rows.filter((_, i) => i !== index),
      }),
  })
  function change(index: number, field: "name" | "value", value: string) {
    const next = rowsRef.current.map((row, i) => (i === index ? { ...row, [field]: value } : row))
    rowsRef.current = next
    const persisted = !next.at(-1)?.name && !next.at(-1)?.value ? next.slice(0, -1) : next
    environments.edit(document.id, { rows: persisted })
  }
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: OpenTUI pane focus follows mouse interaction; terminal boxes do not expose ARIA roles.
    <box
      id="http-environment-pane"
      focusable
      style={{
        position: "absolute",
        ...position,
        ...focusedPanelBorder(active, COLORS.http),
        backgroundColor: COLORS.panel,
        paddingLeft: 1,
        paddingRight: 1,
        overflow: "hidden",
      }}
      onMouseDown={onFocus}
    >
      <box style={{ flexDirection: "row", height: 1, flexShrink: 0 }}>
        <text
          content={global ? "◆ Global" : document.name || translateUi("Novo ambiente")}
          style={{ fg: COLORS.http, flexGrow: 1 }}
        />
        <text
          content={translateUi(
            global
              ? "Sempre ativo"
              : environments.selectedKey === document.key
                ? "Ambiente ativo"
                : "Ambiente",
          )}
          style={{ fg: COLORS.muted }}
        />
      </box>
      {environments.remote ? (
        <text
          content={translateUi("Valores compartilhados no Postman")}
          style={{ fg: COLORS.muted, height: 1, flexShrink: 0 }}
        />
      ) : null}
      {!global ? (
        <box style={{ flexDirection: "row", height: 1, flexShrink: 0 }}>
          <text content={`${translateUi("Nome")}: `} style={{ fg: COLORS.muted }} />
          <input
            id="http-environment-name"
            onMouseDown={keyboard.selectName}
            value={document.name}
            maxLength={120}
            onInput={(name) => environments.edit(document.id, { name })}
            style={{
              flexGrow: 1,
              ...nameColors(active && keyboard.nameSelected),
            }}
          />
        </box>
      ) : null}
      <box style={{ flexDirection: "row", flexWrap: "wrap", flexShrink: 0 }}>
        <InlineButton
          id="http-environment-save"
          label={document.busy ? "Salvando…" : "[Ctrl+S] Salvar"}
          accent={COLORS.http}
          disabled={unavailable}
          onPress={() => void environments.save(document.id)}
        />
        {!global && !document.fresh ? (
          <InlineButton
            id="http-environment-activate"
            label="Usar ambiente"
            accent={COLORS.http}
            disabled={unavailable}
            onPress={() => void environments.activate(document.key)}
          />
        ) : null}
        {!global && !document.fresh ? (
          <InlineButton
            id="http-environment-delete"
            label="Excluir ambiente"
            accent={COLORS.danger}
            disabled={unavailable}
            onPress={() => environments.remove(document.id)}
          />
        ) : null}
      </box>
      {document.loading ? (
        <text content={translateUi("Carregando…")} style={{ fg: COLORS.muted }} />
      ) : null}
      {document.error ? (
        <box style={{ flexShrink: 0 }}>
          <text content={translateUi(document.error)} style={{ fg: COLORS.danger }} />
          {!document.baseline && !document.fresh ? (
            <InlineButton
              id="http-environment-retry"
              label="Tentar novamente"
              accent={COLORS.http}
              onPress={() => void environments.load(document.id)}
            />
          ) : null}
        </box>
      ) : null}
      <HttpEnvironmentVariableTable
        document={document}
        environments={environments}
        unavailable={unavailable}
        rows={rows}
        change={change}
        keyboard={keyboard}
        active={active}
      />
      <EnvironmentKeyboardHints keyboard={keyboard} />
      <HttpBoxSelection id="http-environment-pane" />
    </box>
  )
}

function HttpEnvironmentVariableTable({
  document,
  environments,
  unavailable,
  rows,
  change,
  keyboard,
  active,
}: {
  document: HttpEnvironmentDocument
  environments: HttpEnvironmentTabs
  unavailable: boolean
  keyboard: ReturnType<typeof useHttpEnvironmentKeyboard>
  active: boolean
  rows: HttpEnvironmentDocument["rows"]
  change: (index: number, field: "name" | "value", value: string) => void
}) {
  return (
    <>
      <box
        style={{
          height: 1,
          flexDirection: "row",
          flexShrink: 0,
          backgroundColor: COLORS.panelRaised,
        }}
      >
        <text content={translateUi("Variável")} style={{ width: "40%", fg: COLORS.http }} />
        <text content={translateUi("Valor")} style={{ flexGrow: 1, fg: COLORS.http }} />
        <text content=" " style={{ width: 3 }} />
      </box>
      <scrollbox
        id="http-environment-table"
        viewportOptions={{
          onSizeChange() {
            keyboard.setViewportSize(`${this.width}:${this.height}`)
          },
        }}
        scrollY
        viewportCulling={false}
        style={{ flexGrow: 1, minHeight: 0 }}
      >
        {!document.loading && (document.baseline || document.fresh)
          ? rows.map((row, index) => (
              <box
                key={row.id}
                style={{
                  height: 1,
                  flexShrink: 0,
                  flexDirection: "row",
                  backgroundColor: index % 2 ? COLORS.panelRaised : COLORS.panelAlt,
                }}
              >
                <input
                  id={`http-environment-cell-${index}-name`}
                  value={row.name}
                  onMouseDown={() => keyboard.selectCell(index, "name")}
                  placeholder={translateUi("variável")}
                  onInput={(value) => change(index, "name", value)}
                  style={{
                    width: "40%",
                    ...cellColors(keyboard, active, index, "name"),
                    focusedTextColor: COLORS.text,
                    focusedBackgroundColor: COLORS.diffModifiedBg,
                  }}
                />
                <input
                  id={`http-environment-cell-${index}-value`}
                  value={row.value}
                  onMouseDown={() => keyboard.selectCell(index, "value")}
                  placeholder={translateUi("valor")}
                  onInput={(value) => change(index, "value", value)}
                  style={{
                    flexGrow: 1,
                    minWidth: 0,
                    ...cellColors(keyboard, active, index, "value"),
                    focusedTextColor: COLORS.text,
                    focusedBackgroundColor: COLORS.diffModifiedBg,
                  }}
                />
                <InlineButton
                  id={`http-environment-row-delete-${index}`}
                  label="×"
                  accent={COLORS.danger}
                  disabled={unavailable || index === document.rows.length}
                  onPress={() =>
                    environments.edit(document.id, {
                      rows: document.rows.filter((_, i) => i !== index),
                    })
                  }
                />
              </box>
            ))
          : null}
      </scrollbox>
    </>
  )
}

function environmentRows(document: HttpEnvironmentDocument, blankId: { current: string }) {
  if (document.rows.some((row) => row.id === blankId.current)) blankId.current = crypto.randomUUID()
  return [...document.rows, { id: blankId.current, name: "", value: "" }]
}

function EnvironmentKeyboardHints({
  keyboard,
}: {
  keyboard: ReturnType<typeof useHttpEnvironmentKeyboard>
}) {
  return (
    <box style={{ flexShrink: 0 }}>
      <ShortcutText
        content={
          keyboard.editingName
            ? "[↓] Tabela · [Tab] Próximo campo"
            : keyboard.editing
              ? "[Tab/Shift+Tab] Campo · [Esc] Tabela"
              : keyboard.actions
                ? "[Tab/Shift+Tab] Ação · [Enter] Executar · [Esc] Tabela"
                : keyboard.nameSelected
                  ? "[↓] Tabela · [Enter] Editar"
                  : "[↑↓←→] Navegar · [Enter] Editar"
        }
        style={{ flexShrink: 0, fg: COLORS.muted }}
      />
      <ShortcutText
        content={
          keyboard.editing || keyboard.actions
            ? "[Ctrl+S] Salvar · [Alt+←/→] Abas"
            : keyboard.nameSelected
              ? "[←/H] Ambientes · [Tab] Ações"
              : "[Tab] Ações · [N] Nova variável · [Del] Remover · [Esc] Ambientes"
        }
        style={{ flexShrink: 0, fg: COLORS.muted }}
      />
    </box>
  )
}

function nameColors(selected: boolean) {
  return {
    textColor: selected ? "#FFFFFF" : COLORS.text,
    backgroundColor: selected ? BRAND_COLOR : COLORS.panelRaised,
    focusedTextColor: COLORS.text,
    focusedBackgroundColor: COLORS.diffModifiedBg,
  }
}

function cellColors(
  keyboard: ReturnType<typeof useHttpEnvironmentKeyboard>,
  active: boolean,
  row: number,
  field: "name" | "value",
) {
  const selected = active && keyboard.selected.row === row && keyboard.selected.field === field
  return {
    textColor: selected ? "#FFFFFF" : COLORS.text,
    backgroundColor: selected ? BRAND_COLOR : row % 2 ? COLORS.panelRaised : COLORS.panelAlt,
  }
}
