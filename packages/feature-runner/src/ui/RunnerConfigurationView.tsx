import type { BoxRenderable, SelectRenderable } from "@opentui/core"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { ModalSurface } from "@xupon/tuiminal-core/ui/ModalSurface"
import { handleSelectMouseDown, handleSelectMouseScroll } from "@xupon/tuiminal-core/ui/selectMouse"
import type * as React from "react"
import type { RunnerFlow, RunnerNodeStatus } from "../model/plan"
import type { RunnerCommand } from "../model/types"
import type { RunnerEditorTarget } from "./RunnerConfigurationEditor"
import { RunnerFlowStatus } from "./RunnerFlowStatus"

export type RunnerConfigurationViewProps = {
  id?: string
  dialog: React.RefObject<BoxRenderable | null>
  terminal: { width: number; height: number }
  onClose: () => void
  root: string
  setEditor: React.Dispatch<React.SetStateAction<RunnerEditorTarget | null>>
  list: React.RefObject<SelectRenderable | null>
  items: ({ kind: "command"; command?: RunnerCommand } | { kind: "flow"; flow?: RunnerFlow })[]
  index: number
  setIndex: React.Dispatch<React.SetStateAction<number>>
  selectedFlow: RunnerFlow | undefined
  flowStates: Map<string, [string, RunnerNodeStatus][]>
  commands: RunnerCommand[]
  perform: (action: (flow: RunnerFlow) => void | Promise<void>) => void
  runFlow: (flow: RunnerFlow) => void
  stopFlow: (flow: RunnerFlow) => Promise<void>
  restartFlow: (flow: RunnerFlow) => Promise<void>
  error: string
  selected:
    | { kind: "command"; command?: RunnerCommand }
    | { kind: "flow"; flow?: RunnerFlow }
    | undefined
}
export function RunnerConfigurationView({
  id,
  dialog,
  terminal,
  onClose,
  root,
  setEditor,
  list,
  items,
  index,
  setIndex,
  selectedFlow,
  flowStates,
  commands,
  perform,
  runFlow,
  stopFlow,
  restartFlow,
  error,
  selected,
}: RunnerConfigurationViewProps) {
  return (
    <ModalSurface
      id={id ?? "runner-config-modal"}
      dialogRef={dialog}
      width={Math.max(1, Math.min(110, terminal.width - 2))}
      height={Math.max(
        1,
        Math.min(
          30,
          terminal.height - 2,
          9 + Math.max(2, items.length * 2) + (selectedFlow ? 5 : 0),
        ),
      )}
      zIndex={970}
      borderColor={COLORS.runner}
      onBackdropPress={onClose}
    >
      <box height={1} flexDirection="row" justifyContent="space-between">
        <text content={translateUi("CONFIGURAÇÃO DO RUNNER")} fg={COLORS.runner} />
        <InlineButton label="[Esc] Fechar" onPress={onClose} accent={COLORS.runner} />
      </box>
      <text content={root} fg={COLORS.muted} height={1} truncate />
      <text
        content={translateUi(
          "Salvo globalmente por projeto. Arquivos do projeto são somente leitura.",
        )}
        fg={COLORS.muted}
        height={2}
      />
      <box height={1} flexDirection="row">
        <InlineButton
          label="[Ctrl+Y] Editar YAML"
          onPress={() => setEditor({ kind: "configuration" })}
          accent={COLORS.runner}
        />
        <InlineButton
          id="runner-config-new-command"
          label="[Ctrl+N] Novo comando"
          onPress={() => setEditor({ kind: "command" })}
          accent={COLORS.runner}
        />
        <InlineButton
          id="runner-config-new-flow"
          label="[Ctrl+F] Novo fluxo"
          onPress={() => setEditor({ kind: "flow" })}
          accent={COLORS.runner}
        />
      </box>
      <select
        ref={list}
        id="runner-config-list"
        options={items.map((item) => ({
          name: `${item.kind === "flow" ? "◇" : "❯"} ${item.kind === "flow" ? item.flow?.label : item.command?.label}`,
          description:
            item.kind === "flow"
              ? translateUi("Fluxo salvo")
              : (item.command?.displayCommand ?? ""),
        }))}
        selectedIndex={index}
        onChange={setIndex}
        onSelect={(next) => {
          if (items[next]) setEditor(items[next]!)
        }}
        onMouseDown={(event) =>
          handleSelectMouseDown(event, list.current, {
            optionCount: items.length,
            showDescription: true,
          })
        }
        onMouseScroll={(event) => handleSelectMouseScroll(event, list.current)}
        style={{
          flexGrow: 1,
          minHeight: 2,
          backgroundColor: COLORS.panel,
          focusedBackgroundColor: COLORS.panel,
          selectedBackgroundColor: COLORS.runner,
          selectedTextColor: COLORS.canvas,
        }}
      />
      {selectedFlow ? (
        <box height={5} flexShrink={0}>
          <RunnerFlowStatus states={flowStates.get(selectedFlow.id) ?? []} commands={commands} />
          <box height={1} flexDirection="row">
            <InlineButton
              id="runner-config-run"
              label="[Ctrl+R] Executar fluxo"
              onPress={() => perform(runFlow)}
              accent={COLORS.runner}
            />
            <InlineButton
              id="runner-config-stop"
              label="[Ctrl+K] Parar fluxo"
              onPress={() => perform(stopFlow)}
              accent={COLORS.danger}
            />
            <InlineButton
              id="runner-config-restart"
              label="[Ctrl+T] Reiniciar fluxo"
              onPress={() => perform(restartFlow)}
              accent={COLORS.runner}
            />
          </box>
        </box>
      ) : null}
      <text content={error} fg={COLORS.danger} height={1} />
      <InlineButton
        id="runner-config-edit"
        label="[Enter] Editar"
        disabled={!selected}
        onPress={() => {
          if (selected) setEditor(selected)
        }}
        accent={COLORS.runner}
      />
    </ModalSurface>
  )
}
