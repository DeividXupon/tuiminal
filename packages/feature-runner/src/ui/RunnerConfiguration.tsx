import type { BoxRenderable, SelectRenderable } from "@opentui/core"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { useEffect, useRef, useState } from "react"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { ModalSurface } from "@xupon/tuiminal-core/ui/ModalSurface"
import { handleSelectMouseDown, handleSelectMouseScroll } from "@xupon/tuiminal-core/ui/selectMouse"
import type { RunnerCommand } from "../model/types"
import type { RunnerEnvironmentProfile } from "../model/config"
import type { RunnerFlow, RunnerNodeStatus } from "../model/plan"
import { RunnerConfigurationEditor, type RunnerEditorTarget } from "./RunnerConfigurationEditor"

const stateLabels: Record<RunnerNodeStatus, string> = {
  pending: "aguardando",
  starting: "iniciando",
  started: "iniciado",
  healthy: "saudável",
  success: "sucesso",
  failed: "falhou",
  stopped: "parado",
  blocked: "bloqueado",
}
type Props = {
  root: string
  commands: RunnerCommand[]
  profiles: RunnerEnvironmentProfile[]
  flows: RunnerFlow[]
  flowStates: Map<string, [string, RunnerNodeStatus][]>
  runFlow: (flow: RunnerFlow) => void
  stopFlow: (flow: RunnerFlow) => Promise<void>
  restartFlow: (flow: RunnerFlow) => Promise<void>
  onChanged: () => void
  onClose: () => void
}
export function RunnerConfiguration({
  root,
  commands,
  profiles,
  flows,
  flowStates,
  runFlow,
  stopFlow,
  restartFlow,
  onChanged,
  onClose,
}: Props) {
  const terminal = useTerminalDimensions()
  const renderer = useRenderer()
  const dialog = useRef<BoxRenderable | null>(null)
  const list = useRef<SelectRenderable | null>(null)
  const [editor, setEditor] = useState<RunnerEditorTarget | null>({ kind: "configuration" })
  const [index, setIndex] = useState(0)
  const [error, setError] = useState("")
  const items: Exclude<RunnerEditorTarget, { kind: "configuration" }>[] = [
    ...flows.map((flow) => ({ kind: "flow" as const, flow })),
    ...commands.map((command) => ({ kind: "command" as const, command })),
  ]
  const selected = items[index]
  const selectedFlow = selected?.kind === "flow" ? selected.flow : undefined
  useEffect(() => {
    if (editor) return
    renderer.currentFocusedRenderable?.blur()
    const timer = setTimeout(() => (items.length ? list.current : dialog.current)?.focus(), 0)
    return () => clearTimeout(timer)
  }, [editor, renderer, items.length])
  const perform = (action: (flow: RunnerFlow) => void | Promise<void>) => {
    if (!selectedFlow) return
    void Promise.resolve(action(selectedFlow)).catch((failure) => setError(String(failure)))
  }
  useKeyboard((key) => {
    if (editor) return
    if (key.name === "escape") {
      key.preventDefault()
      key.stopPropagation()
      onClose()
      return
    }
    if (key.ctrl) {
      key.preventDefault()
      key.stopPropagation()
      const actions: Record<string, () => void> = {
        y: () => setEditor({ kind: "configuration" }),
        n: () => setEditor({ kind: "command" }),
        f: () => setEditor({ kind: "flow" }),
        r: () => perform(runFlow),
        k: () => perform(stopFlow),
        t: () => perform(restartFlow),
      }
      actions[key.name]?.()
    }
  })
  if (editor)
    return (
      <RunnerConfigurationEditor
        root={root}
        target={editor}
        commands={commands}
        profiles={profiles}
        flows={flows}
        onClose={() => setEditor(null)}
        onSaved={() => {
          setEditor(null)
          onChanged()
        }}
      />
    )
  return (
    <ModalSurface
      id="runner-config-modal"
      dialogRef={dialog}
      width={Math.max(1, Math.min(110, terminal.width - 2))}
      height={Math.max(1, Math.min(30, terminal.height - 2))}
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
          <text
            content={
              (flowStates.get(selectedFlow.id) ?? [])
                .map(
                  ([id, state]) =>
                    `${commands.find((command) => command.id === id)?.label ?? id}: ${translateUi(stateLabels[state])}`,
                )
                .join(" · ") || translateUi("aguardando")
            }
            fg={COLORS.text}
            height={3}
          />
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
