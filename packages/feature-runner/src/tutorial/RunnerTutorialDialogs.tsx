import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { useMemo } from "react"
import { parseRunnerYaml } from "../model/configuration-yaml"
import { runnerYamlContext } from "../model/yaml-editor"
import { RunnerAutostartTrustView } from "../ui/RunnerAutostartTrustView"
import { RunnerConfigurationEditorView } from "../ui/RunnerConfigurationEditorView"
import { RunnerConfigurationView } from "../ui/RunnerConfigurationView"
import { RunnerProjectPicker } from "../ui/RunnerProjectPicker"
import { RunnerSaveCommandView } from "../ui/RunnerSaveCommandView"
import { useYamlHighlighting } from "../ui/use-yaml-highlighting"
import { noop, TUTORIAL_COMMANDS, TUTORIAL_ROOT, TUTORIAL_YAML } from "./fixtures"
import { TutorialPalette } from "./RunnerTutorialPalette"
import { tutorialRefs } from "./refs"

export function TutorialProjectPicker({
  terminal,
  refs,
}: {
  terminal: { width: number; height: number }
  refs: ReturnType<typeof tutorialRefs>
}) {
  const projects = ["runner-project", "web-dashboard", "api-service"].map((name) => ({
    name,
    path: `/demo/${name}`,
    displayPath: `/demo/${name}`,
  }))
  return (
    <RunnerProjectPicker
      id="tutorial-runner-projects"
      {...refs}
      terminal={terminal}
      pickerMode="projects"
      filteredProjects={projects}
      filteredDirectoryEntries={[]}
      projectSearch=""
      setProjectSearch={noop}
      projectPickerError=""
      projectOptions={[
        ...projects.map((p) => ({
          name: `${p.path === TUTORIAL_ROOT ? "●" : "◇"} ${p.name}`,
          description: p.path,
          value: p.path,
        })),
        {
          name: "⌕ PROCURAR NOS ARQUIVOS…",
          description: "Navegar até qualquer pasta do computador",
          value: "directory",
        },
      ]}
      loadDirectory={async () => {}}
      switchProject={noop}
      directoryOptions={[]}
      browserDirectory="/demo"
      homeDirectory="/demo"
      projectsLoading={false}
      directoryLoading={false}
    />
  )
}

function TutorialYaml({
  invalid,
  width,
  height,
}: {
  invalid: boolean
  width: number
  height: number
}) {
  const refs = useMemo(tutorialRefs, [])
  const source = invalid ? TUTORIAL_YAML.replace("[api, web]", "[api, missing]") : TUTORIAL_YAML
  useYamlHighlighting(refs.input, source)
  const parsed = parseRunnerYaml(source)
  return (
    <RunnerConfigurationEditorView
      key={source}
      id={`tutorial-runner-${invalid ? "validation" : "yaml"}`}
      terminal={{ width, height }}
      onClose={noop}
      snapshot={{
        path: "~/.config/tuiminal/runner/<project-hash>/runner.yaml",
        error: "",
        source: null,
        hash: null,
      }}
      input={refs.input}
      source={source}
      changed={noop}
      live={{ current: false }}
      syncCursor={noop}
      setSuggestionIndex={noop}
      setSuggesting={noop}
      setForcedSuggestions={noop}
      visibleItems={[]}
      suggestionIndex={0}
      context={runnerYamlContext(source, 0, 0)}
      anchor={{ row: 0, column: 0 }}
      editorHeight={height - 11}
      editorWidth={width - 4}
      saveError=""
      validation={
        invalid
          ? { configuration: parsed, result: null, error: "Referência ausente ou ambígua: missing" }
          : { configuration: parsed, result: parsed, error: "" }
      }
      saving={false}
      save={async () => {}}
    />
  )
}

export function RunnerTutorialDialog({
  scene,
  width,
  height,
}: {
  scene: string
  width: number
  height: number
}) {
  const refs = useMemo(tutorialRefs, [])
  const id = `tutorial-runner-${scene}`
  if (scene === "palette") return <TutorialPalette width={width} height={height} />
  if (scene === "yaml" || scene === "validation")
    return <TutorialYaml invalid={scene === "validation"} width={width} height={height} />
  if (scene === "manual") {
    const modalWidth = Math.max(1, Math.min(88, width - 2))
    return (
      <RunnerSaveCommandView
        id={id}
        {...refs}
        width={modalWidth}
        height={Math.max(1, Math.min(19, height - 2))}
        onClose={noop}
        command="bun run smoke"
        contentWidth={Math.max(8, modalWidth - 6)}
        name="smoke"
        nameValueRef={{ current: "smoke" }}
        setName={noop}
        submit={noop}
        interactive={false}
        toggleInteractive={noop}
        compact={modalWidth < 64}
      />
    )
  }
  if (scene === "flows" || scene === "flow-running") {
    const flow = parseRunnerYaml(TUTORIAL_YAML).flows[0]
    if (!flow) throw new Error("Missing tutorial flow")
    const items = [
      { kind: "flow" as const, flow },
      ...TUTORIAL_COMMANDS.map((command) => ({ kind: "command" as const, command })),
    ]
    return (
      <RunnerConfigurationView
        id={id}
        dialog={refs.dialogRef}
        list={refs.list}
        terminal={{ width, height }}
        onClose={noop}
        root={TUTORIAL_ROOT}
        setEditor={noop}
        items={items}
        index={0}
        setIndex={noop}
        selectedFlow={flow}
        flowStates={
          new Map([
            [
              flow.id,
              scene === "flow-running"
                ? [
                    ["build", "success"],
                    ["dev:api", "healthy"],
                    ["dev:web", "failed"],
                    ["test", "blocked"],
                  ]
                : [],
            ],
          ])
        }
        commands={TUTORIAL_COMMANDS}
        perform={noop}
        runFlow={noop}
        stopFlow={async () => {}}
        restartFlow={async () => {}}
        error=""
        selected={items[0]}
      />
    )
  }
  if (scene === "trust")
    return (
      <RunnerAutostartTrustView
        id={id}
        {...refs}
        width={Math.max(30, Math.min(100, width - 4))}
        height={Math.max(12, Math.min(24, height - 2))}
        onClose={noop}
        onApprove={noop}
        content={`${translateUi("PROJETO")}  ${TUTORIAL_ROOT}\n${translateUi("PERFIL")}  local\n\n${translateUi("COMANDO")} 1 · dev:api\nbun run dev:api\n${translateUi("DIRETÓRIO")}  ${TUTORIAL_ROOT}\n${translateUi("VARIÁVEIS")}  NODE_ENV\n${translateUi("ARQUIVO DE AMBIENTE")}  .env.local\nrestart: never · autostart: true\n${translateUi("ARQUIVO DE AMBIENTE")} .env.local\n${translateUi("PERFIL")} local\n${translateUi("PTY interativo")}  —`}
      />
    )
  return null
}
