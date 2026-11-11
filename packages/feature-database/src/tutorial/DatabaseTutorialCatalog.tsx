import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { COLORS, focusedPanelBorder, LAYOUT } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { DEMO_TABLES, noop } from "./fixtures"

export function DatabaseTutorialCatalog({
  width,
  active,
  query,
  filter,
}: {
  width: number
  active: boolean
  query: boolean
  filter: boolean
}) {
  const tables = filter ? DEMO_TABLES.filter((table) => table.name === "users") : DEMO_TABLES
  return (
    <box
      id="tutorial-db-catalog"
      style={{
        width,
        flexShrink: 0,
        ...focusedPanelBorder(active, COLORS.database),
        backgroundColor: active && LAYOUT.compact ? COLORS.panelRaised : COLORS.panel,
        paddingLeft: 1,
        paddingRight: 1,
      }}
    >
      <box style={{ height: 2, flexShrink: 0 }}>
        <box id="tutorial-db-connection" style={{ height: 1, flexShrink: 0 }}>
          <text content="◆ Loja Demo" style={{ fg: COLORS.database }} />
        </box>
        <box style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <text content="SQLite" style={{ fg: COLORS.database }} />
          <text content="1s · 3t" style={{ fg: COLORS.muted }} />
        </box>
      </box>
      <box
        style={{
          height: 1,
          width: Math.max(8, width - 4),
          flexDirection: "row",
          flexShrink: 0,
          marginBottom: 1,
          backgroundColor: COLORS.panelRaised,
        }}
      >
        <InlineButton
          label="[/]"
          accent={COLORS.database}
          backgroundColor={COLORS.panelRaised}
          onPress={noop}
        />
        <input
          id="table-search"
          value={filter ? "users" : ""}
          placeholder={translateUi("Filtrar schema ou tabela…")}
          style={{
            backgroundColor: COLORS.panelRaised,
            textColor: COLORS.text,
            cursorColor: COLORS.database,
            flexGrow: 1,
            flexShrink: 1,
            minWidth: 1,
          }}
        />
      </box>
      <select
        id="table-list"
        options={[
          { name: "▾ main", description: "schema", value: "main" },
          ...tables.map((table) => ({
            name: `  ▦ ${table.name}`,
            description: "table",
            value: table.name,
          })),
        ]}
        selectedIndex={tables.length}
        showDescription={false}
        showScrollIndicator
        wrapSelection
        style={{
          width: Math.max(8, width - 4),
          minHeight: 5,
          flexGrow: 1,
          flexShrink: 1,
          backgroundColor: COLORS.panel,
          focusedBackgroundColor: COLORS.panel,
          textColor: COLORS.muted,
          focusedTextColor: COLORS.text,
          selectedBackgroundColor: COLORS.panelRaised,
          selectedTextColor: COLORS.database,
        }}
      />
      {!query && (
        <>
          <InlineButton label="[?] Ações" accent={COLORS.database} onPress={noop} />
          <InlineButton label="[M] Escolher box" accent={COLORS.database} onPress={noop} />
        </>
      )}
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
        active={query}
        onPress={noop}
      />
    </box>
  )
}
