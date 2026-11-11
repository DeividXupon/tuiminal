import type { BoxRenderable, SelectRenderable } from "@opentui/core"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { useEffect, useRef, useState } from "react"
import type { RunnerEnvironmentProfile } from "../model/config"
import type { RunnerFlow, RunnerNodeStatus } from "../model/plan"
import type { RunnerCommand } from "../model/types"
import { RunnerConfigurationEditor, type RunnerEditorTarget } from "./RunnerConfigurationEditor"
import { RunnerConfigurationView } from "./RunnerConfigurationView"

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
    <RunnerConfigurationView
      {...{
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
      }}
    />
  )
}
