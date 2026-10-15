import { runnerYamlStyle, useYamlHighlighting } from "./use-yaml-highlighting"
import { RunnerYamlSuggestions } from "./RunnerYamlSuggestions"
import type { TextareaRenderable } from "@opentui/core"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { useEffect, useMemo, useRef, useState } from "react"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { ModalSurface } from "@xupon/tuiminal-core/ui/ModalSurface"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import type { RunnerCommand } from "../model/types"
import type { RunnerEnvironmentProfile } from "../model/config"
import type { RunnerFlow } from "../model/plan"
import {
  runnerYamlSource,
  runnerYamlCommand,
  parseRunnerYaml,
  type RunnerYamlConfiguration,
  runnerYamlDocument,
  setRunnerYamlDefinition,
  validateRunnerYaml,
} from "../model/configuration-yaml"
import {
  runnerYamlContext,
  runnerYamlCompletionCommands,
  runnerYamlHelp,
  runnerYamlSuggestionDescription,
  runnerYamlSuggestions,
  runnerYamlTemplate,
} from "../model/yaml-editor"
import { handleRunnerYamlCompletionKey } from "./runner-yaml-keyboard"
import { runnerDirectorySuggestions, resolveRunnerEditorPaths } from "../services/editor-paths"
import { readRunnerYaml, saveRunnerYaml } from "../storage/runner-yaml"

export type RunnerEditorTarget =
  | { kind: "configuration" }
  | { kind: "command"; command?: RunnerCommand }
  | { kind: "flow"; flow?: RunnerFlow }
type Props = {
  root: string
  target?: RunnerEditorTarget
  commands: RunnerCommand[]
  profiles: RunnerEnvironmentProfile[]
  flows?: RunnerFlow[]
  onClose: () => void
  onSaved: () => void
}
export function RunnerConfigurationEditor({
  root,
  target = { kind: "configuration" },
  commands,
  profiles,
  flows = [],
  onClose,
  onSaved,
}: Props) {
  const renderer = useRenderer()
  const terminal = useTerminalDimensions()
  const input = useRef<TextareaRenderable | null>(null)
  const [targetId] = useState(() =>
    target.kind === "configuration"
      ? undefined
      : ((target.kind === "command" ? target.command?.id : target.flow?.id) ??
        `${target.kind}:${crypto.randomUUID()}`),
  )
  const [snapshot] = useState(() => {
    try {
      return { ...readRunnerYaml(root), error: "" }
    } catch (error) {
      return { path: "", source: null, hash: null, error: String(error) }
    }
  })
  const [source, setSource] = useState(() => {
    const source = snapshot.source ?? runnerYamlSource(commands, flows)
    if (target.kind === "configuration" || snapshot.error) return source
    try {
      const doc = runnerYamlDocument(source)
      const section = target.kind === "command" ? "commands" : "flows"
      if (doc.hasIn([section, targetId!])) return source
      const definition =
        target.kind === "command" && target.command
          ? runnerYamlCommand(target.command)
          : target.kind === "flow" && target.flow
            ? {
                label: target.flow.label,
                stages: target.flow.stages,
                autostart: target.flow.autostart,
              }
            : runnerYamlTemplate(target.kind, commands[0]?.id)
      setRunnerYamlDefinition(doc, section, targetId!, definition)
      return doc.toString({ lineWidth: 0 })
    } catch {
      return source
    }
  })
  const [inheritedProfiles] = useState(() => {
    if (snapshot.source === null) return profiles
    try {
      const local = parseRunnerYaml(snapshot.source).profiles
      return profiles.filter((profile) => !local.some((item) => item.id === profile.id))
    } catch {
      return profiles
    }
  })
  useYamlHighlighting(input, source)
  const [row, setRow] = useState(0)
  const [column, setColumn] = useState(0)
  const [anchor, setAnchor] = useState({ row: 0, column: 0 })
  const [suggesting, setSuggesting] = useState(false)
  const [forcedSuggestions, setForcedSuggestions] = useState(false)
  const [suggestionIndex, setSuggestionIndex] = useState(0)
  const [directories, setDirectories] = useState<string[]>([])
  const [saveError, setSaveError] = useState(snapshot.error)
  const [saving, setSaving] = useState(false)
  const live = useRef(true)
  const context = runnerYamlContext(source, row, column)
  const validation = useMemo(() => {
    let configuration: RunnerYamlConfiguration | null = null
    try {
      configuration = parseRunnerYaml(source)
      return {
        configuration,
        result: validateRunnerYaml(source, commands, inheritedProfiles),
        error: "",
      }
    } catch (error) {
      return {
        result: null,
        configuration,
        error: error instanceof Error ? error.message : "Configuração inválida.",
      }
    }
  }, [source, commands, inheritedProfiles])
  const completionCommands = runnerYamlCompletionCommands(commands, validation.configuration)
  const completionProfiles = [...inheritedProfiles, ...(validation.configuration?.profiles ?? [])]
  const suggestions =
    context.key === "cwd"
      ? context.block === "command"
        ? directories
        : []
      : runnerYamlSuggestions(context, completionCommands, completionProfiles)
  const alternatives = suggestions.filter((item) => item !== context.value)
  const visibleSuggestions = suggesting
    ? alternatives.length
      ? alternatives
      : forcedSuggestions
        ? suggestions
        : []
    : []
  const visibleItems = visibleSuggestions.map((value) => {
    const description = runnerYamlSuggestionDescription(
      context,
      value,
      completionCommands,
      completionProfiles,
    )
    return { value, description: description.text, translateDescription: description.translate }
  })
  const editorHeight = input.current?.height ?? Math.max(2, terminal.height - 11)
  const editorWidth = input.current?.width ?? Math.max(1, terminal.width - 4)
  useEffect(() => {
    live.current = true
    renderer.currentFocusedRenderable?.blur()
    const timer = setTimeout(() => {
      input.current?.focus()
      if (targetId) {
        const line = (input.current?.plainText ?? "")
          .split("\n")
          .findIndex((line) => /^  \S/.test(line) && line.includes(targetId))
        if (line >= 0) input.current?.setCursor(line, 0)
      }
    }, 0)
    return () => {
      live.current = false
      clearTimeout(timer)
    }
  }, [renderer, targetId])
  useEffect(() => {
    let current = true
    if (context.key === "cwd")
      void runnerDirectorySuggestions(root, context.value).then((paths) => {
        if (current) setDirectories(paths)
      })
    return () => {
      current = false
    }
  }, [context.key, context.value, root])
  const syncCursor = () => {
    const editor = input.current
    setRow(editor?.logicalCursor.row ?? 0)
    setColumn(editor?.logicalCursor.col ?? 0)
    setAnchor({
      row: editor?.visualCursor.visualRow ?? 0,
      column: editor?.visualCursor.visualCol ?? 0,
    })
  }
  const changed = () => {
    const editor = input.current
    setSource(editor?.plainText ?? "")
    syncCursor()
    setSaveError("")
    setSuggestionIndex(0)
    setSuggesting(true)
    setForcedSuggestions(false)
  }
  const save = async () => {
    if (!validation.result || saving || snapshot.error) return
    setSaving(true)
    try {
      for (const command of validation.result.commands)
        await resolveRunnerEditorPaths(root, command)
      if (!live.current) return
      snapshot.hash = saveRunnerYaml(snapshot.path, source, snapshot.hash)
      onSaved()
    } catch (error) {
      if (live.current)
        setSaveError(error instanceof Error ? error.message : "Configuração inválida.")
    } finally {
      if (live.current) setSaving(false)
    }
  }
  useKeyboard((key) => {
    const controlActions: Record<string, (() => void) | undefined> = {
      s: () => {
        void save()
      },
      space: () => {
        setSuggesting(true)
        setForcedSuggestions(true)
      },
    }
    const actions: Record<string, (() => void) | undefined> = {
      escape: () => {
        if (visibleSuggestions.length) setSuggesting(false)
        else onClose()
      },
      tab: () => input.current?.insertText("  "),
    }
    const action = (key.ctrl ? controlActions : actions)[key.name]
    if (action) {
      key.preventDefault()
      key.stopPropagation()
      action()
      return
    }
    const handled = handleRunnerYamlCompletionKey(key, {
      editor: input.current,
      focused: renderer.currentFocusedRenderable === input.current,
      source,
      row,
      column,
      suggestions: visibleSuggestions,
      moveSelection: (step) =>
        setSuggestionIndex((current) =>
          Math.max(0, Math.min(visibleSuggestions.length - 1, current + step)),
        ),
    })
    if (
      !handled &&
      ["up", "down", "left", "right", "home", "end", "pageup", "pagedown"].includes(key.name)
    )
      queueMicrotask(() => {
        if (!live.current || renderer.currentFocusedRenderable !== input.current) return
        syncCursor()
        setSuggestionIndex(0)
        setSuggesting(true)
        setForcedSuggestions(false)
      })
  })
  return (
    <>
      <ModalSurface
        id="runner-config-editor"
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
    </>
  )
}
