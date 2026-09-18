import type { RunnerCommand } from "./types"
import type { RunnerEnvironmentProfile } from "./config"
import { COMMAND_FIELDS } from "./editor"

export function runnerYamlContext(source: string, row: number) {
  const lines = source.split("\n")
  const line = lines[row] ?? ""
  const match = /^(\s*(?:-\s*)?)([A-Za-z]\w*):\s*(.*)$/.exec(line)
  let key = match?.[2] ?? ""
  let value = match?.[3] ?? ""
  let prefix = match ? `${match[1]}${key}: ` : ""
  if (!match && /^\s*-\s*/.test(line)) {
    prefix = /^\s*-\s*/.exec(line)![0]
    value = line.slice(prefix.length)
    for (let index = row - 1; index >= 0; index--) {
      const parent = /^\s*(commandIds|dependsOn):/.exec(lines[index]!)
      if (parent) {
        key = parent[1]!
        break
      }
      if (/^\S/.test(lines[index]!)) break
    }
  }
  const list =
    ["commandIds", "dependsOn"].includes(key) &&
    (value.startsWith("[") || (Boolean(match) && !value.trim()))
  let tail = list ? value.slice(value.lastIndexOf(",") + 1).replace(/^\[/, "") : value
  tail = tail.trim().replace(/^['"]|['"\]]+$/g, "")
  return {
    row,
    line,
    key,
    value: tail,
    prefix,
    list,
    listPrefix: list ? value.slice(0, value.lastIndexOf(",") + 1) || "[" : "",
  }
}
export type RunnerYamlContext = ReturnType<typeof runnerYamlContext>
export function runnerYamlSuggestions(
  context: RunnerYamlContext,
  commands: RunnerCommand[],
  profiles: RunnerEnvironmentProfile[],
) {
  const { key, value } = context
  let candidates: string[] = []
  if (key === "command") candidates = commands.map((command) => command.displayCommand)
  if (["commandId", "commandIds", "dependsOn"].includes(key))
    return commands
      .filter((command) => command.id.includes(value) || command.label.includes(value))
      .map((command) => command.id)
      .slice(0, 6)
  if (key === "profile") candidates = profiles.map((profile) => profile.id)
  if (["restart", "restartPolicy"].includes(key)) candidates = ["never", "on-failure", "always"]
  if (["interactive", "autostart", "persistLogs"].includes(key)) candidates = ["false", "true"]
  if (["condition", "waitFor"].includes(key)) candidates = ["completed", "started"]
  if (key === "type") candidates = ["log", "http", "port"]
  return [...new Set(candidates)].filter((candidate) => candidate.includes(value)).slice(0, 6)
}
export function runnerYamlSuggestionLine(context: RunnerYamlContext, value: string) {
  const scalar = ["interactive", "autostart", "persistLogs"].includes(context.key)
    ? value
    : JSON.stringify(value)
  return (
    context.prefix +
    (context.list
      ? `${context.listPrefix}${context.listPrefix.endsWith(",") ? " " : ""}${scalar}]`
      : scalar)
  )
}
export function runnerYamlHelp(key: string) {
  if (key === "description")
    return "Texto opcional que descreve o comando na lista do Runner. Não altera o comando executado."
  if (key === "profile")
    return "ID de um perfil definido em profiles ou detectado no projeto. Vazio usa o perfil selecionado no Runner. [Ctrl+Space] mostra os perfis."
  if (["commands", "flows", "profiles", ""].includes(key))
    return "Edite commands, flows e profiles em YAML. [Tab] insere dois espaços. [Ctrl+Space] sugere valores. [Ctrl+S] valida e salva o arquivo."
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
    "Edite commands, flows e profiles em YAML. [Tab] insere dois espaços. [Ctrl+Space] sugere valores. [Ctrl+S] valida e salva o arquivo."
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
