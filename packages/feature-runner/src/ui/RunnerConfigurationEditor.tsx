import { RunnerYamlGuide } from "./RunnerYamlGuide"
import { runnerYamlStyle, useYamlHighlighting } from "./use-yaml-highlighting"
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
  runnerYamlHelp,
  runnerYamlSuggestions,
  runnerYamlSuggestionLine,
  runnerYamlTemplate,
} from "../model/yaml-editor"
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
  onManage?: () => void
}
export function RunnerConfigurationEditor({
  root,
  target = { kind: "configuration" },
  commands,
  profiles,
  flows = [],
  onClose,
  onSaved,
  onManage,
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
  const [guideOpen, setGuideOpen] = useState(false)
  useYamlHighlighting(input, source)
  const openGuide = () => {
    setSuggesting(false)
    input.current?.blur()
    setGuideOpen(true)
  }
  const closeGuide = () => {
    setGuideOpen(false)
    input.current?.focus()
  }
  const [row, setRow] = useState(0)
  const initialSource = useRef(source)
  const [suggesting, setSuggesting] = useState(false)
  const [suggestionIndex, setSuggestionIndex] = useState(0)
  const [directories, setDirectories] = useState<string[]>([])
  const [saveError, setSaveError] = useState(snapshot.error)
  const [saving, setSaving] = useState(false)
  const live = useRef(true)
  const context = runnerYamlContext(source, row)
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
  const suggestions =
    context.key === "cwd"
      ? directories
      : runnerYamlSuggestions(
          context,
          [
            ...commands,
            ...(validation.configuration?.commands ?? [])
              .filter((command) => !commands.some((item) => item.id === command.id))
              .map((command) => ({
                ...command,
                category: "custom" as const,
                displayCommand: command.command,
                program: "",
                args: [],
              })),
          ],
          [...inheritedProfiles, ...(validation.configuration?.profiles ?? [])],
        )
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
  const changed = () => {
    setSource(input.current?.plainText ?? "")
    setSaveError("")
    setSuggestionIndex(0)
  }
  const accept = (suggestion: string) => {
    const editor = input.current
    if (!editor) return
    editor.setCursor(row, 0)
    editor.gotoLineEnd({ select: true })
    editor.insertText(runnerYamlSuggestionLine(context, suggestion))
    editor.focus()
    setSuggesting(false)
    changed()
  }
  const save = async () => {
    if (!validation.result || saving || snapshot.error) return
    setSaving(true)
    try {
      for (const command of validation.result.commands)
        await resolveRunnerEditorPaths(root, command)
      if (!live.current) return
      snapshot.hash = saveRunnerYaml(snapshot.path, source, snapshot.hash)
      initialSource.current = source
      onSaved()
    } catch (error) {
      if (live.current)
        setSaveError(error instanceof Error ? error.message : "Configuração inválida.")
    } finally {
      if (live.current) setSaving(false)
    }
  }
  const manage = () => {
    if (source !== initialSource.current)
      setSaveError("Salve o YAML antes de abrir comandos e fluxos.")
    else onManage?.()
  }
  useKeyboard((key) => {
    if (guideOpen) return
    const controlActions: Record<string, (() => void) | undefined> = {
      s: () => {
        void save()
      },
      space: () => setSuggesting((current) => !current),
      o: onManage ? manage : undefined,
    }
    const actions: Record<string, (() => void) | undefined> = {
      f1: openGuide,
      escape: () => {
        if (suggesting) setSuggesting(false)
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
    if (!suggesting || !["up", "down", "return", "enter"].includes(key.name)) return
    key.preventDefault()
    key.stopPropagation()
    if (key.name === "up" || key.name === "down")
      setSuggestionIndex((current) =>
        Math.max(0, Math.min(suggestions.length - 1, current + (key.name === "up" ? -1 : 1))),
      )
    else if (suggestions[suggestionIndex]) accept(suggestions[suggestionIndex]!)
  })
  return (
    <>
      <ModalSurface
        id="runner-config-editor"
        width={Math.max(1, Math.min(140, terminal.width - 2))}
        height={Math.max(1, terminal.height - 2)}
        zIndex={975}
        borderColor={COLORS.runner}
        onBackdropPress={() => {
          if (!guideOpen) onClose()
        }}
      >
        <box height={1} flexDirection="row" justifyContent="space-between">
          <text content={translateUi("EDITOR YAML DO RUNNER")} fg={COLORS.runner} />
          <InlineButton
            id="runner-config-guide-open"
            label="[F1] Tutorial YAML"
            onPress={openGuide}
            accent={COLORS.runner}
          />
          <InlineButton label="[Esc] Voltar" onPress={onClose} accent={COLORS.runner} />
        </box>
        <text content={snapshot.path} fg={COLORS.muted} height={1} truncate />
        <textarea
          ref={input}
          id="runner-config-yaml"
          initialValue={source}
          syntaxStyle={runnerYamlStyle}
          onContentChange={changed}
          onCursorChange={({ line }) => {
            setRow(line)
            setSuggestionIndex(0)
          }}
          onMouseDown={() => input.current?.focus()}
          style={{
            flexGrow: 1,
            minHeight: 2,
            backgroundColor: COLORS.panelRaised,
            focusedBackgroundColor: COLORS.panelRaised,
            textColor: COLORS.text,
            focusedTextColor: COLORS.text,
            cursorColor: COLORS.runner,
            wrapMode: "none",
          }}
        />
        <box height={1} flexDirection="row">
          <InlineButton
            id="runner-config-suggest"
            label="[Ctrl+Space] Sugestões"
            onPress={() => {
              setSuggesting((current) => !current)
              input.current?.focus()
            }}
            accent={COLORS.runner}
          />
          {onManage ? (
            <InlineButton
              id="runner-config-manage"
              label="[Ctrl+O] Comandos e fluxos"
              onPress={manage}
              accent={COLORS.runner}
            />
          ) : null}
        </box>
        {suggesting ? (
          <box height={Math.min(3, suggestions.length) || 1} flexShrink={0}>
            {suggestions.length ? (
              suggestions
                .slice(Math.max(0, suggestionIndex - 2), Math.max(0, suggestionIndex - 2) + 3)
                .map((suggestion, index) => (
                  <box key={suggestion} height={1} flexDirection="row">
                    <InlineButton
                      id={`runner-config-suggestion-${index}`}
                      label="[Enter] Usar"
                      active={suggestion === suggestions[suggestionIndex]}
                      onPress={() => accept(suggestion)}
                      accent={COLORS.runner}
                    />
                    <text content={suggestion} fg={COLORS.text} truncate />
                  </box>
                ))
            ) : (
              <text content={translateUi("Nenhuma sugestão.")} fg={COLORS.muted} />
            )}
          </box>
        ) : null}
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
      {guideOpen ? <RunnerYamlGuide currentKey={context.key} onClose={closeGuide} /> : null}
    </>
  )
}
