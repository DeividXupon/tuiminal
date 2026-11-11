import type { TextareaRenderable } from "@opentui/core"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { ModalSurface } from "@xupon/tuiminal-core/ui/ModalSurface"
import type * as React from "react"
import type { RunnerYamlConfiguration } from "../model/configuration-yaml"
import type { RunnerYamlBlock } from "../model/yaml-block"
import { runnerYamlHelp } from "../model/yaml-editor"
import { RunnerYamlSuggestions } from "./RunnerYamlSuggestions"
import { runnerYamlStyle } from "./use-yaml-highlighting"

export type RunnerConfigurationEditorViewProps = {
  id?: string
  terminal: { width: number; height: number }
  onClose: () => void
  snapshot:
    | { error: string; path: string; source: string; hash: string }
    | { error: string; path: string; source: null; hash: null }
  input: React.RefObject<TextareaRenderable | null>
  source: string
  changed: () => void
  live: React.RefObject<boolean>
  syncCursor: () => void
  setSuggestionIndex: React.Dispatch<React.SetStateAction<number>>
  setSuggesting: React.Dispatch<React.SetStateAction<boolean>>
  setForcedSuggestions: React.Dispatch<React.SetStateAction<boolean>>
  visibleItems: { value: string; description: string; translateDescription: boolean }[]
  suggestionIndex: number
  context: {
    key: string
    block: RunnerYamlBlock
    value: string
    keyDraft: boolean
    keyCandidates: string[]
  }
  anchor: { row: number; column: number }
  editorHeight: number
  editorWidth: number
  saveError: string
  validation:
    | { configuration: RunnerYamlConfiguration; result: RunnerYamlConfiguration; error: string }
    | { result: null; configuration: RunnerYamlConfiguration | null; error: string }
  saving: boolean
  save: () => Promise<void>
}
export function RunnerConfigurationEditorView({
  id,
  terminal,
  onClose,
  snapshot,
  input,
  source,
  changed,
  live,
  syncCursor,
  setSuggestionIndex,
  setSuggesting,
  setForcedSuggestions,
  visibleItems,
  suggestionIndex,
  context,
  anchor,
  editorHeight,
  editorWidth,
  saveError,
  validation,
  saving,
  save,
}: RunnerConfigurationEditorViewProps) {
  return (
    <ModalSurface
      id={id ?? "runner-config-editor"}
      width={Math.max(1, Math.min(140, terminal.width - 2))}
      height={Math.max(1, terminal.height - 2)}
      zIndex={975}
      borderColor={COLORS.runner}
      onBackdropPress={onClose}
    >
      <box height={1} flexDirection="row" justifyContent="space-between">
        <text content={translateUi("EDITOR YAML DO RUNNER")} fg={COLORS.runner} />
        <InlineButton label="[Esc] Voltar" onPress={onClose} accent={COLORS.runner} />
      </box>
      <text content={snapshot.path} fg={COLORS.muted} height={1} truncate />
      <box style={{ position: "relative", flexGrow: 1, minHeight: 2 }}>
        <textarea
          ref={input}
          id="runner-config-yaml"
          initialValue={source}
          syntaxStyle={runnerYamlStyle}
          onContentChange={changed}
          onCursorChange={() => {
            const editor = input.current
            queueMicrotask(() => {
              if (!live.current || input.current !== editor) return
              syncCursor()
            })
            setSuggestionIndex(0)
            setSuggesting(true)
            setForcedSuggestions(false)
          }}
          onMouseDown={() => {
            input.current?.focus()
            queueMicrotask(() => {
              if (live.current) syncCursor()
            })
          }}
          style={{
            width: "100%",
            height: "100%",
            backgroundColor: COLORS.panelRaised,
            focusedBackgroundColor: COLORS.panelRaised,
            textColor: COLORS.text,
            focusedTextColor: COLORS.text,
            cursorColor: COLORS.runner,
            wrapMode: "none",
          }}
        />
        <RunnerYamlSuggestions
          items={visibleItems}
          selectedIndex={suggestionIndex}
          query={context.value}
          anchor={anchor}
          editorHeight={editorHeight}
          editorWidth={editorWidth}
          onSelect={setSuggestionIndex}
        />
      </box>
      <box height={1} flexDirection="row">
        <InlineButton
          id="runner-config-suggest"
          label="[Ctrl+Space] Sugestões"
          onPress={() => {
            setSuggesting(true)
            setForcedSuggestions(true)
            input.current?.focus()
          }}
          accent={COLORS.runner}
        />
      </box>
      <scrollbox height={terminal.height >= 28 ? 4 : 2} scrollY flexShrink={0}>
        <text content={translateUi(runnerYamlHelp(context.key))} fg={COLORS.text} />
      </scrollbox>
      <text
        id="runner-config-validation"
        content={translateUi(saveError || validation.error || "Configuração válida.")}
        fg={saveError || validation.error ? COLORS.danger : COLORS.success}
        height={2}
      />
      <InlineButton
        id="runner-config-save"
        label="[Ctrl+S] Salvar"
        disabled={!validation.result || saving || Boolean(snapshot.error)}
        onPress={() => void save()}
        accent={COLORS.runner}
      />
    </ModalSurface>
  )
}
