import type { ScrollBoxRenderable } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/react"
import { COLORS, focusedPanelBorder, LAYOUT } from "@xupon/tuiminal-core/settings/theme"
import { useRef } from "react"
import { useWorkspaceRepaint } from "@xupon/tuiminal-core/ui/workspace-repaint"
import { databaseSidebarWidth } from "../model/layout"
import { ROW_INSPECTOR_BREAKPOINT } from "../rendering/constants"
import { DatabaseSchemaView } from "../ui/DatabaseSchemaView"
import { DatabaseTableHeader } from "../ui/DatabaseTableHeader"
import { DatabaseTableMetadata } from "../ui/DatabaseTableMetadata"
import { DatabaseTutorialCatalog } from "./DatabaseTutorialCatalog"
import { DatabaseTutorialData } from "./DatabaseTutorialData"
import { DatabaseTutorialDialogs } from "./DatabaseTutorialDialogs"
import { DatabaseTutorialFooter } from "./DatabaseTutorialFooter"
import { DatabaseTutorialQuery } from "./DatabaseTutorialQuery"
import {
  DEMO_COLUMNS,
  DEMO_STRUCTURE,
  DEMO_TABLE,
  DEMO_TABLES,
  noop,
  tutorialRows,
  tutorialState,
  type TutorialState,
} from "./fixtures"

function TutorialStructure({
  state,
  target,
  width,
}: {
  state: TutorialState
  target: string | null
  width: number
}) {
  const structureRef = useRef<ScrollBoxRenderable | null>(null)
  const diagram = target === "tutorial-db-diagram"
  if (state.view === "columns" || state.view === "indexes")
    return (
      <box
        id={state.view === "columns" ? "tutorial-db-columns" : "tutorial-db-indexes"}
        style={{ flexGrow: 1 }}
      >
        <DatabaseTableMetadata
          width={width}
          view={state.view}
          columns={DEMO_COLUMNS}
          indexes={DEMO_STRUCTURE.indexes}
        />
      </box>
    )
  return (
    <box id={diagram ? "tutorial-db-diagram" : "tutorial-db-schema"} style={{ flexGrow: 1 }}>
      <DatabaseSchemaView
        table={DEMO_TABLE}
        structure={DEMO_STRUCTURE}
        loading={false}
        diagramOpen={diagram}
        availableWidth={width}
        scrollRef={structureRef}
        onToggleDiagram={noop}
      />
    </box>
  )
}

export function DatabaseTutorialDemo({
  activeTargetId = null,
}: {
  activeTargetId?: string | null
}) {
  const terminal = useTerminalDimensions()
  const state = tutorialState(activeTargetId)
  useWorkspaceRepaint(JSON.stringify([state.view, state.query, state.inspector, state.dialog]))
  const sidebarWidth = databaseSidebarWidth(terminal.width)
  const width = Math.max(16, terminal.width - sidebarWidth - 7)
  const narrow = terminal.width < ROW_INSPECTOR_BREAKPOINT
  const rows = tutorialRows(state)
  const catalogActive =
    !activeTargetId ||
    ["tutorial-db-catalog", "tutorial-db-connection", "table-search", "table-list"].includes(
      activeTargetId,
    )
  const gridActive = !catalogActive && !state.inspector
  return (
    <>
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
        <DatabaseTutorialCatalog
          width={sidebarWidth}
          active={catalogActive}
          query={state.query}
          filter={activeTargetId === "table-search"}
        />
        <box
          id="tutorial-db-grid"
          style={{
            position: "relative",
            flexGrow: 1,
            minWidth: 1,
            ...focusedPanelBorder(gridActive, COLORS.database),
            backgroundColor:
              gridActive && LAYOUT.compact ? COLORS.panelRaised : LAYOUT.alternatePanel,
            paddingLeft: 1,
            paddingRight: 1,
          }}
        >
          {state.query ? (
            <DatabaseTutorialQuery width={width} />
          ) : (
            <>
              <DatabaseTableHeader
                width={width}
                view={state.view}
                history={DEMO_TABLES}
                selectedTable={DEMO_TABLE}
                onView={noop}
                onTable={noop}
                onNavigate={noop}
              />
              {state.view !== "data" ? (
                <TutorialStructure state={state} target={activeTargetId} width={width} />
              ) : (
                <DatabaseTutorialData
                  rows={rows}
                  state={state}
                  width={width}
                  inspectorWidth={narrow ? 0 : Math.max(28, Math.min(38, Math.floor(width * 0.32)))}
                  detailOnly={narrow && state.inspector}
                  active={gridActive}
                />
              )}
              <DatabaseTutorialFooter
                width={width}
                narrow={narrow}
                state={state}
                pending={rows.filter((row) => row.change).length}
              />
            </>
          )}
        </box>
      </box>
      <DatabaseTutorialDialogs state={state} />
    </>
  )
}
