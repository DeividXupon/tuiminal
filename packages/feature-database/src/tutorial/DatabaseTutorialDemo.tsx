import { useTerminalDimensions } from "@opentui/react"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import {
  COLORS,
  databaseSelectionColors,
  LAYOUT,
  panelBorder,
} from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { ShortcutText } from "@xupon/tuiminal-core/ui/ShortcutText"
import type { DatabaseTable } from "../model/types"
import { SIDEBAR_WIDTH } from "../rendering/constants"
import { queryBatchSelectionBackground, queryRowColors } from "../rendering/query-presentation"
import { fitCell, shorten } from "../rendering/workspace-shared"
import { DatabaseTableHeader } from "../ui/DatabaseTableHeader"

export const TUTORIAL_DEMO_ROWS = [
  {
    id: "101",
    name: "Ana Lima",
    email: "ana@acme.dev",
    role: "admin",
    active: "sim",
    state: "selected",
    marked: true,
  },
  {
    id: "102",
    name: "Bruno Reis",
    email: "bruno@acme.dev",
    role: "editor",
    active: "sim",
    state: "edited",
    marked: false,
  },
  {
    id: "103",
    name: "Carla Melo",
    email: "carla@acme.dev",
    role: "viewer",
    active: "sim",
    state: "inserted",
    marked: false,
  },
  {
    id: "104",
    name: "Diego Luz",
    email: "diego@acme.dev",
    role: "viewer",
    active: "não",
    state: "deleted",
    marked: false,
  },
  {
    id: "105",
    name: "Eva Nunes",
    email: "eva@acme.dev",
    role: "editor",
    active: "sim",
    state: "normal",
    marked: true,
  },
  {
    id: "106",
    name: "Fábio Paz",
    email: "fabio@acme.dev",
    role: "viewer",
    active: "sim",
    state: "normal",
    marked: false,
  },
] as const

export const TUTORIAL_DEMO_FIELDS = [
  ["id", "101"],
  ["name", "Ana Lima"],
  ["email", "ana@acme.dev"],
  ["role", "admin"],
  ["active", "1"],
  ["password", "demo-access-2026"],
  ["created_at", "2026-08-21 14:32:08"],
] as const

const DEMO_SELECTED_TABLE: DatabaseTable = { schema: "public", name: "users", type: "table" }
const DEMO_TABLES: DatabaseTable[] = ["orders", "users", "products"].map((name) => ({
  schema: "public",
  name,
  type: "table",
}))

export function DatabaseTutorialDemo() {
  const terminal = useTerminalDimensions()
  const selectionColors = databaseSelectionColors()
  const narrow = terminal.width < 140
  const veryNarrow = terminal.width < 110
  const sidebarWidth = veryNarrow ? 26 : SIDEBAR_WIDTH
  const inspectorWidth = veryNarrow ? 24 : narrow ? 28 : 34
  const demoColumnWidth = veryNarrow ? 11 : narrow ? 13 : 16
  const visibleDemoColumns = veryNarrow
    ? (["id", "name"] as const)
    : narrow
      ? (["id", "name", "role"] as const)
      : (["id", "name", "email", "role", "active"] as const)
  const noop = () => {}
  return (
    <box
      id="database-workspace"
      style={{
        flexGrow: 1,
        flexDirection: "row",
        paddingX: LAYOUT.outerPadding,
        gap: LAYOUT.gap,
        backgroundColor: LAYOUT.workspaceBackground,
      }}
    >
      <box
        id="tutorial-db-catalog"
        style={{
          width: sidebarWidth,
          flexShrink: 0,
          ...panelBorder(COLORS.database),
          backgroundColor: COLORS.panel,
          paddingLeft: 1,
          paddingRight: 1,
        }}
      >
        <box id="tutorial-db-connection" style={{ height: 1, flexShrink: 0 }}>
          <text
            content={veryNarrow ? "◆ Loja Demo" : "◆ Loja Demo · SQLite"}
            style={{ fg: COLORS.database }}
          />
        </box>
        <box style={{ height: 2, flexShrink: 0 }}>
          <text content="◆ tutorial_store" style={{ fg: COLORS.database }} />
          <text content="DEMO · dados fictícios" style={{ fg: COLORS.warning }} />
        </box>
        <box
          id="table-search"
          style={{
            height: 1,
            flexShrink: 0,
            backgroundColor: COLORS.panelRaised,
            paddingLeft: 1,
            marginBottom: 1,
          }}
        >
          <ShortcutText content="[/] Buscar tabela…" style={{ fg: COLORS.muted }} />
        </box>
        <box id="table-list" style={{ flexGrow: 1, backgroundColor: COLORS.panel }}>
          <text content="▾ main" style={{ fg: COLORS.database }} />
          <text content="  ▦ orders" style={{ fg: COLORS.muted }} />
          <text content="  ▦ order_items" style={{ fg: COLORS.muted }} />
          <text content="› ▦ users" style={{ fg: COLORS.database, bg: COLORS.panelRaised }} />
          <text content="  ▦ products" style={{ fg: COLORS.muted }} />
          <text content="  ▦ categories" style={{ fg: COLORS.muted }} />
          <text content="  ▦ audit_logs" style={{ fg: COLORS.muted }} />
          <text content="  ◇ active_customers" style={{ fg: COLORS.muted }} />
        </box>
        <InlineButton label="[?] Ações" accent={COLORS.database} onPress={noop} />
        <InlineButton label="[M] Escolher box" accent={COLORS.database} onPress={noop} />
        <InlineButton
          id="tutorial-db-new-connection"
          label="[C] Conexões"
          accent={COLORS.database}
          onPress={noop}
        />
        <InlineButton
          id="tutorial-db-new-query"
          label="[W] Query"
          accent={COLORS.success}
          onPress={noop}
        />
      </box>
      <box
        id="tutorial-db-grid"
        style={{
          flexGrow: 1,
          minWidth: 18,
          ...panelBorder(COLORS.database),
          backgroundColor: LAYOUT.alternatePanel,
          paddingLeft: 1,
          paddingRight: 1,
        }}
      >
        <box
          id="tutorial-db-query-preview"
          style={{
            height: 4,
            flexShrink: 0,
            border: true,
            borderStyle: "rounded",
            borderColor: COLORS.border,
            backgroundColor: COLORS.panel,
            paddingLeft: 1,
            paddingRight: 1,
          }}
        >
          <text content="CONSULTA EXECUTADA" style={{ fg: COLORS.muted }} />
          <text
            content={
              veryNarrow ? "SELECT * FROM users" : "SELECT * FROM users ORDER BY id LIMIT 30;"
            }
            style={{ fg: COLORS.database }}
          />
        </box>

        <DatabaseTableHeader
          width={Math.max(16, terminal.width - sidebarWidth - inspectorWidth - 12)}
          view="data"
          history={DEMO_TABLES}
          selectedTable={DEMO_SELECTED_TABLE}
          onView={noop}
          onTable={noop}
          onNavigate={noop}
        />

        <box id="tutorial-db-table-grid" style={{ flexGrow: 1 }}>
          <text
            content={
              veryNarrow
                ? "6 registros · 3 alterações"
                : "RESULTADO · 6 registros · 3 alterações locais"
            }
            style={{ fg: COLORS.muted }}
          />
          <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
            <text
              content="○ │"
              style={{ width: 3, flexShrink: 0, fg: COLORS.muted, bg: COLORS.panelRaised }}
            />
            {visibleDemoColumns.map((column) => (
              <text
                key={column}
                content={fitCell(column.toUpperCase(), demoColumnWidth)}
                style={{ fg: COLORS.database, bg: COLORS.panelRaised }}
              />
            ))}
          </box>
          {TUTORIAL_DEMO_ROWS.map((row, index) => {
            const mutationKind =
              row.state === "edited"
                ? "update"
                : row.state === "inserted"
                  ? "insert"
                  : row.state === "deleted"
                    ? "delete"
                    : undefined
            const { background, accent } = queryRowColors(mutationKind, index)
            const backgroundColor = row.marked
              ? queryBatchSelectionBackground(background)
              : background
            return (
              <box
                key={row.id}
                style={{ height: 1, flexShrink: 0, flexDirection: "row", backgroundColor }}
              >
                <text
                  content={`${row.marked ? "●" : "○"} │`}
                  style={{
                    width: 3,
                    flexShrink: 0,
                    fg: row.marked ? COLORS.database : COLORS.muted,
                    bg: backgroundColor,
                  }}
                />
                {visibleDemoColumns.map((column) => {
                  const selected = row.state === "selected" && column === "id"
                  return (
                    <text
                      key={column}
                      content={fitCell(row[column], demoColumnWidth)}
                      style={{
                        fg: selected ? selectionColors.foreground : accent,
                        bg: selected ? selectionColors.background : backgroundColor,
                      }}
                    />
                  )
                })}
              </box>
            )
          })}
          <text
            content={
              veryNarrow
                ? "azul + · laranja ~ · vermelho −"
                : "◇ azul: nova · laranja: editada · vermelho: exclusão"
            }
            style={{ fg: COLORS.muted }}
          />
        </box>

        <box
          style={{
            height: 2,
            flexShrink: 0,
            flexDirection: "row",
            flexWrap: "wrap",
            border: ["top"],
            borderColor: COLORS.border,
          }}
        >
          <box
            id="tutorial-db-table-tools"
            style={{ height: 1, flexShrink: 0, flexDirection: "row" }}
          >
            <InlineButton
              label={narrow ? "[O]↕" : "[O] Ordenar"}
              accent={COLORS.database}
              onPress={noop}
            />
            <InlineButton
              label={narrow ? "[S]◇" : "[S] Buscar"}
              accent={COLORS.database}
              onPress={noop}
            />
          </box>
          <InlineButton
            id="tutorial-db-sensitive"
            label={narrow ? "[V] ◇" : "[V] Mascarar"}
            accent={COLORS.database}
            onPress={noop}
          />
          <box style={{ flexGrow: 1 }} />
          <InlineButton
            id="database-refresh-catalog"
            label={narrow ? "[R]" : "[R] Atualizar"}
            accent={COLORS.database}
            onPress={noop}
          />
        </box>
        <box
          style={{
            minHeight: 1,
            flexShrink: 0,
            flexDirection: "row",
            flexWrap: "wrap",
            justifyContent: "space-between",
          }}
        >
          <InlineButton
            id="tutorial-db-inspector-toggle"
            label="[I]"
            accent={COLORS.database}
            onPress={noop}
          />
          <box
            id="tutorial-db-selection"
            style={{ height: 1, flexShrink: 0, flexDirection: "row" }}
          >
            <InlineButton label="[Space] ●" accent={COLORS.database} active onPress={noop} />
            <InlineButton
              label={narrow ? "[Alt+Space] Sel" : "[Alt+Space] Intervalo"}
              accent={COLORS.database}
              onPress={noop}
            />
          </box>
          <InlineButton
            id="tutorial-db-new-row"
            label={narrow ? "[Ctrl+A]+" : "[Ctrl+A] Criar"}
            accent={COLORS.runner}
            onPress={noop}
          />
          <InlineButton
            id="tutorial-db-edit-cell"
            label={narrow ? "[E]2" : "[E] Editar 2"}
            accent={COLORS.warning}
            onPress={noop}
          />
          <InlineButton
            id="tutorial-db-delete-row"
            label={narrow ? "[dd]2" : "[dd] Deletar 2"}
            accent={COLORS.danger}
            onPress={noop}
          />
          <InlineButton
            id="tutorial-db-export"
            label={narrow ? "[X]2" : "[X] Exportar 2"}
            accent={COLORS.database}
            onPress={noop}
          />
          <InlineButton
            id="tutorial-db-undo-row"
            label="[U]"
            accent={COLORS.database}
            onPress={noop}
          />
          <InlineButton
            id="tutorial-db-review"
            label={narrow ? "[Ctrl+S]3" : "[Ctrl+S] Revisar 3"}
            accent={COLORS.success}
            active
            onPress={noop}
          />
        </box>

        <box
          id="tutorial-db-window-navigation"
          style={{
            height: 1,
            flexShrink: 0,
            flexDirection: "row",
            justifyContent: "space-between",
          }}
        >
          <ShortcutText content="[↑/↓] até 50 · +40" style={{ fg: COLORS.database }} />
          <ShortcutText content={translateUi("[/] foco: GRADE")} style={{ fg: COLORS.muted }} />
        </box>
      </box>

      <box
        id="tutorial-db-inspector"
        style={{
          width: inspectorWidth,
          flexShrink: 0,
          ...panelBorder(COLORS.database),
          backgroundColor: COLORS.panelAlt,
          paddingLeft: 1,
          paddingRight: 1,
        }}
      >
        <box
          style={{
            height: 4,
            flexShrink: 0,
            border: ["bottom"],
            borderColor: COLORS.border,
          }}
        >
          <text
            content={veryNarrow ? "◆ 1 / 6" : "◆ REGISTRO 1 / 6"}
            style={{ fg: COLORS.database }}
          />
          <text
            content={veryNarrow ? "Linha selecionada" : "Linha selecionada na grade"}
            style={{ fg: COLORS.text }}
          />
          <ShortcutText
            content={veryNarrow ? "[↑↓] · [E]" : "[↑↓] campo · [E] editar"}
            style={{ fg: COLORS.muted }}
          />
        </box>
        <box id="tutorial-db-inspector-fields" style={{ flexGrow: 1 }}>
          {TUTORIAL_DEMO_FIELDS.map(([field, value], index) => (
            <box
              key={field}
              style={{
                height: 2,
                flexShrink: 0,
                backgroundColor:
                  index === 0
                    ? COLORS.panelRaised
                    : index % 2 === 0
                      ? COLORS.panel
                      : COLORS.panelAlt,
                paddingLeft: 1,
              }}
            >
              <text content={`${index === 0 ? "›" : " "} ${field}`} style={{ fg: COLORS.muted }} />
              <text
                content={shorten(value, Math.max(8, inspectorWidth - 4))}
                style={{ fg: COLORS.text }}
              />
            </box>
          ))}
        </box>
        <text
          content={veryNarrow ? "DEMO · não salva" : "DEMO · nada será salvo"}
          style={{ fg: COLORS.warning }}
        />
      </box>
    </box>
  )
}
