import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { databaseActionRowCount } from "../model/layout"
import { COMPACT_ACTIONS_BREAKPOINT } from "../rendering/constants"
import { noop, type TutorialState } from "./fixtures"

function EditActions({
  compact,
  selected,
  pending,
}: {
  compact: boolean
  selected: boolean
  pending: number
}) {
  return (
    <>
      {!selected && (
        <InlineButton
          id="database-tutorial-new-row-action"
          label={compact ? "[Ctrl+A]+" : "[Ctrl+A] Criar"}
          accent={COLORS.runner}
          onPress={noop}
        />
      )}
      <InlineButton
        id="database-tutorial-edit-cell-action"
        label={selected ? (compact ? "[E]2" : "[E] Editar 2") : compact ? "[E]" : "[Enter] Editar"}
        accent={COLORS.warning}
        onPress={noop}
      />
      <InlineButton
        id="database-tutorial-delete-row-action"
        label={
          selected ? (compact ? "[dd]2" : "[dd] Deletar 2") : compact ? "[dd]" : "[dd] Deletar"
        }
        accent={COLORS.danger}
        onPress={noop}
      />
      {selected && (
        <InlineButton
          id="database-export-selected-rows"
          label={compact ? "[X]2" : "[X] Exportar 2"}
          accent={COLORS.database}
          onPress={noop}
        />
      )}
      <InlineButton
        id="database-tutorial-undo-row-action"
        label={compact ? "[U]" : "[U] Desfazer"}
        accent={COLORS.database}
        disabled={!pending}
        onPress={noop}
      />
      <InlineButton
        id="database-tutorial-review-action"
        label={compact ? `[Ctrl+S]${pending}` : `[Ctrl+S] Revisar ${pending}`}
        accent={COLORS.success}
        active={pending > 0}
        disabled={!pending}
        onPress={noop}
      />
    </>
  )
}

function TableTools({
  compact,
  veryNarrow,
  narrow,
  state,
}: {
  compact: boolean
  veryNarrow: boolean
  narrow: boolean
  state: TutorialState
}) {
  const search = (
    <InlineButton
      label={compact ? "[S] Busca" : "[S] Buscar"}
      accent={COLORS.database}
      onPress={noop}
    />
  )
  return (
    <>
      <box id="tutorial-db-table-tools" style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
        <InlineButton
          label={
            compact
              ? state.sorted
                ? "[O]↑"
                : "[O]↕"
              : state.sorted
                ? "[O] Ordem id ↑"
                : "[O] Ordenar"
          }
          accent={COLORS.database}
          active={state.sorted}
          onPress={noop}
        />
        {!veryNarrow && search}
      </box>
      <InlineButton
        id="tutorial-db-sensitive"
        label={
          compact
            ? state.masked
              ? "[V] ◇"
              : "[V] ◆"
            : state.masked
              ? "[V] Revelar"
              : "[V] Mascarar"
        }
        accent={state.masked ? COLORS.danger : COLORS.database}
        active={state.masked}
        onPress={noop}
      />
      {narrow && (
        <InlineButton
          id="tutorial-db-inspector-toggle"
          label={compact ? "[I]" : "[I] Inspetor"}
          accent={COLORS.database}
          active={state.inspector}
          onPress={noop}
        />
      )}
    </>
  )
}

export function DatabaseTutorialFooter({
  width,
  narrow,
  state,
  pending,
}: {
  width: number
  narrow: boolean
  state: TutorialState
  pending: number
}) {
  const compact = width < COMPACT_ACTIONS_BREAKPOINT
  const veryNarrow = width < 64
  const data = state.view === "data"
  const search = (
    <InlineButton
      label={compact ? "[S] Busca" : "[S] Buscar"}
      accent={COLORS.database}
      onPress={noop}
    />
  )
  const edits = <EditActions compact={compact} selected={state.selected} pending={pending} />

  return (
    <box
      id="tutorial-db-navigation"
      style={{
        height: 1 + (data ? databaseActionRowCount(width, true) : 1),
        flexShrink: 0,
        border: ["top"],
        borderColor: COLORS.border,
      }}
    >
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
        {data && (
          <TableTools compact={compact} veryNarrow={veryNarrow} narrow={narrow} state={state} />
        )}
        <box style={{ flexGrow: 1 }} />
        <InlineButton
          id="database-refresh-catalog"
          label={compact ? "[R]" : "[R] Atualizar"}
          accent={COLORS.database}
          onPress={noop}
        />
      </box>
      {data && (
        <>
          <box
            style={{
              height: 1,
              flexShrink: 0,
              flexDirection: "row",
              justifyContent: "space-between",
            }}
          >
            {veryNarrow && search}
            <InlineButton
              label={state.selected ? "[Space] ●" : "[Space] ○"}
              accent={COLORS.database}
              active={state.selected}
              onPress={noop}
            />
            <InlineButton
              id="database-selection-sweep"
              label={compact ? "[Alt+Space] Sel" : "[Alt+Space] Intervalo"}
              accent={COLORS.database}
              active={state.selected}
              onPress={noop}
            />
            {!veryNarrow && edits}
          </box>
          {veryNarrow && (
            <box
              style={{
                height: 1,
                flexShrink: 0,
                flexDirection: "row",
                justifyContent: "space-between",
              }}
            >
              {edits}
            </box>
          )}
        </>
      )}
    </box>
  )
}
