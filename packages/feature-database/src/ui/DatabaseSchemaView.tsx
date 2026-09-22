import type { ScrollBoxRenderable } from "@opentui/core"
import type { Ref } from "react"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { ShortcutText } from "@xupon/tuiminal-core/ui/ShortcutText"
import type { DatabaseTable, DatabaseTableStructure } from "../model/types"
import { renderDatabaseRelationshipDiagram } from "../rendering/relationship-diagram"

function SchemaDiagram({
  table,
  structure,
  availableWidth,
}: {
  table: DatabaseTable
  structure: DatabaseTableStructure
  availableWidth: number
}) {
  const lines = renderDatabaseRelationshipDiagram(
    table,
    structure.relationships,
    availableWidth - 2,
  )
  return (
    <>
      <text
        content={`◆ ${translateUi("RELACIONAMENTOS")} · ${structure.relationships.length}`}
        style={{ fg: COLORS.database, bg: COLORS.panelRaised }}
      />
      <text
        content={lines.length ? lines.join("\n") : translateUi("Nenhum relacionamento encontrado.")}
        style={{ fg: lines.length ? COLORS.text : COLORS.muted }}
      />
    </>
  )
}

function SchemaDetails({ structure }: { structure: DatabaseTableStructure }) {
  return (
    <>
      <text content="◆ DDL" style={{ fg: COLORS.database, bg: COLORS.panelRaised }} />
      <text content={structure.ddl || "—"} style={{ fg: COLORS.text }} />
      <text content=" " />
      <text
        content={`◆ ${translateUi("RELACIONAMENTOS")} · ${structure.relationships.length}`}
        style={{ fg: COLORS.database, bg: COLORS.panelRaised }}
      />
      {structure.relationships.length ? (
        structure.relationships.map((relation) => (
          <text
            key={`${relation.direction}-${relation.name}-${relation.relatedSchema}-${relation.relatedTable}`}
            content={`${relation.direction === "outgoing" ? "→" : "←"} ${relation.name} · (${relation.columns.join(", ")}) ${relation.direction === "outgoing" ? "→" : "←"} ${relation.relatedSchema}.${relation.relatedTable} (${relation.relatedColumns.join(", ")}) · UPDATE ${relation.onUpdate} · DELETE ${relation.onDelete}`}
            style={{ fg: relation.direction === "outgoing" ? COLORS.success : COLORS.warning }}
          />
        ))
      ) : (
        <text
          content={translateUi("Nenhum relacionamento encontrado.")}
          style={{ fg: COLORS.muted }}
        />
      )}
      <text content=" " />
      <text
        content={`◆ ${translateUi("CONSTRAINTS")} · ${structure.constraints.length}`}
        style={{ fg: COLORS.database, bg: COLORS.panelRaised }}
      />
      {structure.constraints.length ? (
        structure.constraints.map((constraint) => (
          <text
            key={`${constraint.type}-${constraint.name}`}
            content={`${constraint.type} · ${constraint.name} · ${constraint.definition}`}
            style={{ fg: constraint.type === "FOREIGN KEY" ? COLORS.warning : COLORS.text }}
          />
        ))
      ) : (
        <text
          content={translateUi("Nenhuma constraint encontrada.")}
          style={{ fg: COLORS.muted }}
        />
      )}
      <text content=" " />
      <text
        content={`◆ ${translateUi("ÍNDICES")} · ${structure.indexes.length}`}
        style={{ fg: COLORS.database, bg: COLORS.panelRaised }}
      />
      {structure.indexes.length ? (
        structure.indexes.map((index) => (
          <text
            key={index.name}
            content={`${index.unique ? "UNIQUE" : "INDEX"} · ${index.name} · ${index.definition}`}
            style={{ fg: index.unique ? COLORS.database : COLORS.text }}
          />
        ))
      ) : (
        <text content={translateUi("Nenhum índice encontrado.")} style={{ fg: COLORS.muted }} />
      )}
      <text content=" " />
      <ShortcutText content={translateUi("[↑/↓] Rolar · mouse")} style={{ fg: COLORS.muted }} />
    </>
  )
}

export function DatabaseSchemaView({
  table,
  structure,
  loading,
  diagramOpen,
  availableWidth,
  scrollRef,
  onToggleDiagram,
}: {
  table: DatabaseTable
  structure: DatabaseTableStructure | null
  loading: boolean
  diagramOpen: boolean
  availableWidth: number
  scrollRef: Ref<ScrollBoxRenderable>
  onToggleDiagram: () => void
}) {
  return (
    <box style={{ flexGrow: 1, backgroundColor: COLORS.panel }}>
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
        <InlineButton
          id="database-schema-diagram-toggle"
          label={diagramOpen ? "[G] Detalhes" : "[G] Diagrama"}
          accent={COLORS.database}
          active={diagramOpen}
          onPress={onToggleDiagram}
        />
      </box>
      <scrollbox
        ref={scrollRef}
        id="database-schema-inspector"
        scrollY
        viewportCulling
        style={{ flexGrow: 1, backgroundColor: COLORS.panel }}
        verticalScrollbarOptions={{
          trackOptions: { backgroundColor: COLORS.panel, foregroundColor: COLORS.border },
        }}
      >
        {loading ? null : structure ? (
          diagramOpen ? (
            <SchemaDiagram table={table} structure={structure} availableWidth={availableWidth} />
          ) : (
            <SchemaDetails structure={structure} />
          )
        ) : (
          <text content={translateUi("Estrutura indisponível.")} style={{ fg: COLORS.muted }} />
        )}
      </scrollbox>
    </box>
  )
}
