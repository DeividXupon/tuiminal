import type { RunnerCommand } from "./types"
import type { RunnerEnvironmentProfile } from "./config"
import { COMMAND_FIELDS } from "./editor"
import type { RunnerYamlConfiguration } from "./configuration-yaml"
import { runnerYamlBlock, type RunnerYamlBlock } from "./yaml-block"

const COMMAND_KEYS = [
  "label",
  "description",
  "command",
  "cwd",
  "env",
  "envFile",
  "profile",
  "interactive",
  "restart",
  "restartPolicy",
  "restartDelayMs",
  "maxRestarts",
  "persistLogs",
  "health",
  "healthCheck",
  "dependsOn",
  "autostart",
]

function blockKeys(block: RunnerYamlBlock, healthType: string) {
  switch (block) {
    case "root":
      return ["commands", "flows", "profiles"]
    case "command":
      return COMMAND_KEYS
    case "flow":
      return ["label", "autostart", "stages"]
    case "profile":
      return ["label", "env", "envFile"]
    case "health":
      return [
        "type",
        ...(healthType === "log" ? ["pattern"] : []),
        ...(healthType === "port" ? ["port", "host"] : []),
        ...(healthType === "http" ? ["url"] : []),
        "timeoutMs",
      ]
    case "dependency":
      return ["commandId", "condition"]
    case "stage":
      return ["commandIds", "waitFor"]
    default:
      return []
  }
}

const MAP_ENTRY_EXAMPLES: Partial<Record<RunnerYamlBlock, string>> = {
  commands: "build:",
  flows: "dev:",
  profiles: "development:",
  env: "PORT:",
}

function mapEntryState(beforeCursor: string, block: RunnerYamlBlock) {
  const example = MAP_ENTRY_EXAMPLES[block]
  if (!example) return null
  const draft = /^\s*([A-Za-z_][\w:-]*)$/.exec(beforeCursor)?.[1] ?? ""
  const keyDraft = /^\s*$/.test(beforeCursor) || Boolean(draft && !draft.endsWith(":"))
  return {
    key: "",
    value: draft,
    keyDraft,
    keyCandidates: keyDraft ? [draft ? `${draft}:` : example] : [],
    match: false,
  }
}

function lineKeyState(beforeCursor: string, scope: ReturnType<typeof runnerYamlBlock>) {
  const mapEntry = mapEntryState(beforeCursor, scope.block)
  if (mapEntry) return mapEntry
  const literalBlock = scope.block === "literal"
  const match = literalBlock ? null : /^(\s*(?:-\s*)?)([A-Za-z]\w*):\s*(.*)$/.exec(beforeCursor)
  const draft = match || literalBlock ? null : /^(\s*(?:-\s*)?)([A-Za-z]\w*)$/.exec(beforeCursor)
  const keys = blockKeys(scope.block, scope.healthType)
  const keyDraft = Boolean(draft || (!match && /^\s*(?:-\s*)?$/.test(beforeCursor) && keys.length))
  let key = match?.[2] ?? ""
  let value = match?.[3] ?? draft?.[2] ?? ""
  const itemPrefix = /^\s*-\s*/.exec(beforeCursor)
  if (!match && !keyDraft && itemPrefix) {
    value = beforeCursor.slice(itemPrefix[0].length)
    key =
      scope.block === "commandIds" ? "commandIds" : scope.block === "dependsOn" ? "dependsOn" : ""
  }
  return {
    key,
    value,
    keyDraft,
    keyCandidates: keyDraft ? keys : [],
    match: Boolean(match),
  }
}

export function runnerYamlContext(source: string, row: number, column?: number) {
  const lines = source.split("\n")
  const line = lines[row] ?? ""
  const beforeCursor = line.slice(0, column ?? line.length)
  const scope = runnerYamlBlock(source, row, column)
  const state = lineKeyState(beforeCursor, scope)
  const { key, value } = state
  const list =
    ["commandIds", "dependsOn"].includes(key) &&
    (value.startsWith("[") || (state.match && !value.trim()))
  let tail = list ? value.slice(value.lastIndexOf(",") + 1).replace(/^\[/, "") : value
  tail = tail.trim().replace(/^['"]|['"\]]+$/g, "")
  return {
    key,
    block: scope.block,
    value: tail,
    keyDraft: state.keyDraft,
    keyCandidates: state.keyCandidates,
  }
}
export type RunnerYamlContext = ReturnType<typeof runnerYamlContext>
export function runnerYamlCompletionCommands(
  commands: RunnerCommand[],
  configuration: RunnerYamlConfiguration | null,
): RunnerCommand[] {
  return [
    ...commands,
    ...(configuration?.commands ?? [])
      .filter((command) => !commands.some((item) => item.id === command.id))
      .map((command) => ({
        ...command,
        category: "custom" as const,
        displayCommand: command.command,
        program: "",
        args: [],
      })),
  ]
}
function distance(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let i = 1; i <= left.length; i++) {
    const current = [i]
    for (let j = 1; j <= right.length; j++)
      current[j] = Math.min(
        current[j - 1]! + 1,
        previous[j]! + 1,
        previous[j - 1]! + Number(left[i - 1] !== right[j - 1]),
      )
    previous.splice(0, previous.length, ...current)
  }
  return previous[right.length]!
}

export function rankRunnerYamlSuggestions(candidates: string[], query: string) {
  const unique = [...new Set(candidates)]
  const needle = query.toLocaleLowerCase()
  if (!needle) return unique.slice(0, 6)
  const matches = unique.filter((candidate) => candidate.toLocaleLowerCase().includes(needle))
  if (matches.length)
    return matches
      .sort(
        (a, b) =>
          Number(!a.toLocaleLowerCase().startsWith(needle)) -
            Number(!b.toLocaleLowerCase().startsWith(needle)) || a.length - b.length,
      )
      .slice(0, 6)
  if (needle.length < 3) return []
  const limit = Math.max(1, Math.floor(needle.length / 3))
  return unique
    .map((candidate) => {
      const lower = candidate.toLocaleLowerCase()
      return {
        candidate,
        score: Math.min(distance(needle, lower), distance(needle, lower.slice(0, needle.length))),
      }
    })
    .filter(({ score }) => score <= limit)
    .sort((a, b) => a.score - b.score || a.candidate.length - b.candidate.length)
    .slice(0, 3)
    .map(({ candidate }) => candidate)
}
function validValueKey(context: RunnerYamlContext) {
  const { block, key } = context
  if (blockKeys(block, "").includes(key)) return true
  if (block === "health") return ["pattern", "port", "host", "url"].includes(key)
  return (
    (block === "commandIds" && key === "commandIds") ||
    (block === "dependsOn" && key === "dependsOn")
  )
}
export function runnerYamlSuggestions(
  context: RunnerYamlContext,
  commands: RunnerCommand[],
  profiles: RunnerEnvironmentProfile[],
) {
  const { key, value } = context
  if (context.keyDraft) return rankRunnerYamlSuggestions(context.keyCandidates, value)
  if (!validValueKey(context)) return []
  let candidates: string[] = []
  if (key === "command") {
    if (/^[>|][+-]?$/.test(value)) return []
    candidates = [...new Set(commands.map((command) => command.displayCommand))]
    const exact = candidates.find((candidate) => candidate === value)
    return exact
      ? [
          exact,
          ...rankRunnerYamlSuggestions(
            candidates.filter((candidate) => candidate !== exact),
            value,
          ),
        ]
      : rankRunnerYamlSuggestions(candidates, value)
  }
  if (["commandId", "commandIds", "dependsOn"].includes(key)) {
    const matching = commands.filter(
      (command) => command.id.includes(value) || command.label.includes(value),
    )
    return rankRunnerYamlSuggestions(
      (matching.length ? matching : commands).map((command) => command.id),
      matching.length ? "" : value,
    )
  }
  if (key === "profile") candidates = profiles.map((profile) => profile.id)
  if (["restart", "restartPolicy"].includes(key)) candidates = ["never", "on-failure", "always"]
  if (["interactive", "autostart", "persistLogs"].includes(key)) candidates = ["false", "true"]
  if (["condition", "waitFor"].includes(key)) candidates = ["completed", "started"]
  if (key === "type") candidates = ["log", "http", "port"]
  return rankRunnerYamlSuggestions(candidates, value)
}
const KEY_DESCRIPTIONS: Record<string, string> = {
  commands: "Comandos executáveis deste projeto.",
  flows: "Fluxos com etapas ordenadas.",
  profiles: "Perfis de variáveis de ambiente.",
  label: "Nome exibido no Runner.",
  description: "Descrição exibida na lista de comandos.",
  command: "Comando executado pelo shell.",
  cwd: "Pasta onde o comando será executado.",
  env: "Variáveis de ambiente do processo.",
  envFile: "Arquivo de variáveis de ambiente.",
  profile: "Perfil de ambiente usado pelo comando.",
  interactive: "Abre o comando em um terminal interativo.",
  autostart: "Solicita início automático aprovado.",
  restart: "Política de reinício automático.",
  restartPolicy: "Política de reinício automático.",
  restartDelayMs: "Intervalo antes de reiniciar, em ms.",
  maxRestarts: "Limite de reinícios automáticos.",
  persistLogs: "Mantém os logs do processo.",
  health: "Verifica se o comando está pronto.",
  healthCheck: "Verifica se o comando está pronto.",
  type: "Método de verificação de prontidão.",
  pattern: "Padrão procurado nos logs.",
  port: "Porta TCP verificada.",
  host: "Host usado na verificação da porta.",
  url: "Endereço HTTP verificado.",
  timeoutMs: "Tempo máximo da verificação, em ms.",
  dependsOn: "Comandos que devem iniciar primeiro.",
  commandId: "ID do comando pré-requisito.",
  condition: "Condição para liberar o dependente.",
  stages: "Etapas executadas em ordem.",
  commandIds: "Comandos executados em paralelo.",
  waitFor: "Condição para avançar à próxima etapa.",
}
const MAP_ENTRY_DESCRIPTIONS: Partial<Record<RunnerYamlBlock, string>> = {
  commands: "ID único do comando. Abaixo dele, defina command e as demais opções.",
  flows: "ID único do fluxo. Abaixo dele, defina label, autostart e stages.",
  profiles: "ID único do perfil. Abaixo dele, defina env ou envFile.",
  env: "Nome da variável de ambiente. Informe o valor depois de dois-pontos.",
}
const VALUE_DESCRIPTIONS: Record<string, string> = {
  never: "Não reinicia automaticamente.",
  "on-failure": "Reinicia após uma falha.",
  always: "Reinicia quando o processo termina.",
  true: "Ativa esta opção.",
  false: "Desativa esta opção.",
  completed: "Aguarda o comando terminar com sucesso.",
  started: "Aguarda o início e a verificação de prontidão.",
  log: "Procura um padrão nos logs.",
  port: "Testa uma conexão TCP.",
  http: "Testa uma resposta HTTP.",
}

export function runnerYamlSuggestionDescription(
  context: RunnerYamlContext,
  suggestion: string,
  commands: RunnerCommand[],
  profiles: RunnerEnvironmentProfile[],
) {
  if (context.keyDraft)
    return {
      text: MAP_ENTRY_DESCRIPTIONS[context.block] ?? KEY_DESCRIPTIONS[suggestion] ?? "",
      translate: true,
    }
  if (context.key === "command") {
    const command = commands.find((item) => item.displayCommand === suggestion)
    return { text: command?.description || command?.label || suggestion, translate: false }
  }
  if (["commandId", "commandIds", "dependsOn"].includes(context.key)) {
    const command = commands.find((item) => item.id === suggestion)
    return { text: command?.description || command?.label || suggestion, translate: false }
  }
  if (context.key === "profile") {
    const profile = profiles.find((item) => item.id === suggestion)
    return { text: profile?.label || suggestion, translate: false }
  }
  if (context.key === "cwd")
    return { text: "Pasta onde o comando será executado.", translate: true }
  return { text: VALUE_DESCRIPTIONS[suggestion] ?? "", translate: true }
}
export function runnerYamlHelp(key: string) {
  if (key === "description")
    return "Texto opcional que descreve o comando na lista do Runner. Não altera o comando executado."
  if (key === "profile")
    return "ID de um perfil definido em profiles ou detectado no projeto. Vazio usa o perfil selecionado no Runner. [Ctrl+Space] mostra os perfis."
  if (["commands", "flows", "profiles", ""].includes(key))
    return "Edite commands, flows e profiles em YAML. [Enter] recua conforme o bloco; [Tab] insere dois espaços. [Ctrl+Space] sugere valores. [Ctrl+S] valida e salva o arquivo."
  if (key === "env")
    return "Mapa YAML de variáveis. Os valores do comando sobrescrevem o perfil. Ex.: PORT: '3000'"
  if (
    ["health", "healthCheck", "type", "pattern", "port", "host", "url", "timeoutMs"].includes(key)
  )
    return "health: use type: log com pattern, type: port com port/host ou type: http com url. timeoutMs aceita 500–600000."
  if (["dependsOn", "commandId", "condition"].includes(key))
    return "dependsOn: lista de commandId e condition. completed aguarda sucesso; started aguarda início e health check."
  if (["stages", "commandIds", "waitFor"].includes(key))
    return "stages: lista ordenada de etapas. commandIds executa em paralelo; waitFor: completed aguarda sucesso, started aguarda prontidão."
  return (
    COMMAND_FIELDS.find((field) => field.key === (key === "restart" ? "restartPolicy" : key))
      ?.help ??
    "Edite commands, flows e profiles em YAML. [Enter] recua conforme o bloco; [Tab] insere dois espaços. [Ctrl+Space] sugere valores. [Ctrl+S] valida e salva o arquivo."
  )
}
export function runnerYamlTemplate(kind: "command" | "flow", firstCommand?: string) {
  return kind === "command"
    ? {
        label: "",
        command: "",
        cwd: ".",
        env: {},
        interactive: false,
        restart: "never",
        health: null,
        dependsOn: [],
        autostart: false,
      }
    : {
        label: "",
        autostart: false,
        stages: [{ commandIds: firstCommand ? [firstCommand] : [], waitFor: "completed" }],
      }
}
