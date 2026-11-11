import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { ShortcutText } from "@xupon/tuiminal-core/ui/ShortcutText"
import { RunnerCommandFooter } from "../ui/RunnerCommandFooter"
import { RunnerMultiFooter } from "./RunnerMultiFooter"
import { RunnerProcessFooter } from "./RunnerProcessFooter"
import type { RunnerFooterProps } from "./runner-view-types"

export function RunnerFooter(props: RunnerFooterProps) {
  const { id, footerHeight, pickerMode, projectAvailable, focusPane, actionPalette } = props
  return (
    <box
      id={id ?? "runner-footer"}
      style={{ height: footerHeight, flexShrink: 0, flexDirection: "row" }}
    >
      {pickerMode === "closed" && (projectAvailable === false || focusPane === "history") ? (
        <InlineButton
          id="runner-action-palette-open"
          label="[?] Ações"
          accent={COLORS.runner}
          onPress={actionPalette.open}
        />
      ) : null}
      <RunnerFooterContent {...props} />
    </box>
  )
}
function RunnerFooterContent({
  pickerMode,
  projectSearchRef,
  setPickerMode,
  setProjectSearch,
  projectAvailable,
  openProjectPicker,
  focusPane,
  historyExpanded,
  focusCommandPane,
  focusLogPane,
  toggleHistoryPane,
  viewMode,
  logFooterActions,
  footerHeight,
  boxSelection,
  toggleViewMode,
  activeExecutions,
  cycleActiveExecution,
  selectedExecution,
  stopSelectedExecution,
  actionPalette,
  listMode,
  narrowRunner,
  setNarrowPane,
  footerActions,
}: RunnerFooterProps) {
  if (pickerMode !== "closed")
    return (
      <>
        <InlineButton
          label="[/] Buscar"
          accent={COLORS.runner}
          onPress={() => projectSearchRef.current?.focus()}
        />
        <InlineButton
          label="[Esc] Voltar"
          accent={COLORS.runner}
          onPress={() => {
            setPickerMode("closed")
            setProjectSearch("")
          }}
        />
      </>
    )
  if (projectAvailable === false)
    return (
      <InlineButton
        label="[N] Escolher projeto"
        accent={COLORS.runner}
        onPress={() => void openProjectPicker()}
      />
    )
  if (focusPane === "history" && historyExpanded)
    return (
      <>
        <InlineButton label="[H/←] Lista" accent={COLORS.runner} onPress={focusCommandPane} />
        <InlineButton label="[K/↑] Log" accent={COLORS.runner} onPress={focusLogPane} />
        <ShortcutText content={` ${translateUi("[J/K] Navegar")} `} style={{ fg: COLORS.muted }} />
        <InlineButton label="[S] Recolher" accent={COLORS.runner} onPress={toggleHistoryPane} />
      </>
    )
  if (focusPane === "log" && viewMode === "single")
    return (
      <RunnerCommandFooter
        id="runner-log-footer"
        actions={logFooterActions}
        height={footerHeight}
      />
    )
  if (viewMode === "multi")
    return (
      <>
        <InlineButton
          label="[M] Escolher box"
          accent={COLORS.runner}
          onPress={boxSelection.openSelection}
        />
        <InlineButton label="[Shift+M] Único" accent={COLORS.runner} onPress={toggleViewMode} />
        {activeExecutions.length ? (
          <RunnerMultiFooter
            {...{ cycleActiveExecution, selectedExecution, stopSelectedExecution }}
          />
        ) : null}
        <InlineButton
          id="runner-action-palette-open"
          label="[?] Ações"
          accent={COLORS.runner}
          active={actionPalette.isOpen}
          onPress={() => actionPalette.open()}
        />
      </>
    )
  if (listMode === "active")
    return (
      <RunnerProcessFooter
        {...{
          focusLogPane,
          selectedExecution,
          narrowRunner,
          setNarrowPane,
          stopSelectedExecution,
          toggleViewMode,
          actionPalette,
        }}
      />
    )
  return <RunnerCommandFooter actions={footerActions.commands} height={footerHeight} />
}
