import { isMap, parseDocument, stringify } from "yaml"
import type { RunnerConfiguredCommand, RunnerEnvironmentProfile } from "./config"
import type { RunnerCommand } from "./types"
import { createRunnerPlan, resolveRunnerReference, type RunnerFlow } from "./plan"
import { runnerCommandDraft, validateRunnerCommandDraft } from "./editor"

export type RunnerYamlConfiguration = {
  commands: RunnerConfiguredCommand[]
  flows: RunnerFlow[]
  profiles: RunnerEnvironmentProfile[]
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Configuração inválida.")
  return value as Record<string, unknown>
}
function knownKeys(value: Record<string, unknown>, keys: string[]) {
  if (Object.keys(value).some((key) => !keys.includes(key)))
    throw new Error("Campo YAML desconhecido.")
}
function text(value: unknown, fallback = "") {
  if (value === undefined || value === null) return fallback
  if (typeof value !== "string") throw new Error("Configuração inválida.")
  return value
}
function boolean(value: unknown, fallback = false) {
  if (value === undefined) return fallback
  if (typeof value !== "boolean") throw new Error("Use true ou false.")
  return value
}
function environment(value: unknown) {
  const env = object(value ?? {})
  if (
    Object.entries(env).some(
      ([key, item]) =>
        !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) ||
        !["string", "number", "boolean"].includes(typeof item),
    )
  )
    throw new Error("Ambiente deve ser um mapa de variáveis e valores simples.")
  return Object.fromEntries(Object.entries(env).map(([key, item]) => [key, String(item)]))
}
function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error("Configuração inválida.")
  return value
}
function condition(value: unknown): "started" | "completed" {
  if (value === undefined) return "completed"
  if (value !== "started" && value !== "completed") throw new Error("Use started ou completed.")
  return value
}
export function runnerYamlDocument(source: string) {
  const document = parseDocument(source, { uniqueKeys: true })
  if (document.errors.length) throw document.errors[0]
  return document
}

export function setRunnerYamlDefinition(
  document: ReturnType<typeof runnerYamlDocument>,
  section: "commands" | "flows",
  id: string,
  value: unknown,
) {
  document.setIn([section, id], value)
  const collection = document.get(section, true)
  if (isMap(collection)) collection.flow = false
}

export function parseRunnerYaml(source: string): RunnerYamlConfiguration {
  const document = object(runnerYamlDocument(source).toJS({ maxAliasCount: 100 }) ?? {})
  knownKeys(document, ["commands", "flows", "profiles"])
  const profiles = Object.entries(object(document.profiles ?? {})).map(([id, raw]) => {
    const value = object(raw)
    knownKeys(value, ["label", "env", "envFile"])
    return {
      id,
      label: text(value.label, id),
      env: environment(value.env),
      envFile: text(value.envFile),
    }
  })
  const commands = Object.entries(object(document.commands ?? {})).map(([id, raw]) => {
    const value = typeof raw === "string" ? { command: raw } : object(raw)
    knownKeys(value, [
      "label",
      "command",
      "description",
      "cwd",
      "env",
      "envFile",
      "profile",
      "interactive",
      "autostart",
      "restart",
      "restartPolicy",
      "restartDelayMs",
      "maxRestarts",
      "persistLogs",
      "health",
      "healthCheck",
      "dependsOn",
    ])
    const health = value.health ?? value.healthCheck
    const draft = {
      ...runnerCommandDraft(),
      label: text(value.label, id),
      command: text(value.command),
      cwd: text(value.cwd, "."),
      env: JSON.stringify(environment(value.env)),
      envFile: text(value.envFile),
      profile: text(value.profile),
      interactive: String(boolean(value.interactive)),
      autostart: String(boolean(value.autostart)),
      restartPolicy: text(value.restart ?? value.restartPolicy, "never"),
      restartDelayMs: String(value.restartDelayMs ?? 1000),
      maxRestarts: String(value.maxRestarts ?? 5),
      healthCheck: health == null ? "" : JSON.stringify(health),
    }
    const command = validateRunnerCommandDraft(
      draft,
      id,
      [],
      draft.profile ? [{ id: draft.profile, label: draft.profile }] : [],
    )
    command.description = text(value.description, command.description)
    command.persistLogs = boolean(value.persistLogs)
    command.dependsOn = array(value.dependsOn ?? []).map((rawDependency) => {
      const dependency =
        typeof rawDependency === "string" ? { commandId: rawDependency } : object(rawDependency)
      knownKeys(dependency, ["commandId", "condition"])
      return { commandId: text(dependency.commandId), condition: condition(dependency.condition) }
    })
    return command
  })
  const flows = Object.entries(object(document.flows ?? {})).map(([id, raw]) => {
    const value = object(raw)
    knownKeys(value, ["label", "autostart", "stages"])
    const stages = array(value.stages ?? []).map((rawStage) => {
      const stage = object(rawStage)
      knownKeys(stage, ["commandIds", "waitFor"])
      return {
        commandIds: array(stage.commandIds).map((item) => text(item)),
        waitFor: condition(stage.waitFor),
      }
    })
    if (!stages.length || !text(value.label, id).trim())
      throw new Error("Informe um nome e pelo menos uma etapa.")
    return { id, label: text(value.label, id), autostart: boolean(value.autostart), stages }
  })
  return { commands, flows, profiles }
}

export function runnerYamlCommand(command: RunnerCommand | RunnerConfiguredCommand) {
  const configured = "command" in command
  return {
    label: command.label,
    description: command.description,
    command: configured ? command.command : command.displayCommand,
    cwd: (configured ? command.cwd : command.workingDirectory) || ".",
    env: command.env ?? {},
    profile: command.profile ?? "",
    envFile: command.envFile ?? "",
    interactive: command.interactive ?? false,
    restart: command.restartPolicy ?? "never",
    restartDelayMs: command.restartDelayMs ?? 1000,
    maxRestarts: command.maxRestarts ?? 5,
    health: command.healthCheck ?? null,
    dependsOn: command.dependsOn ?? [],
    autostart: command.autostart ?? false,
    persistLogs: command.persistLogs ?? false,
  }
}
export function runnerYamlSource(
  commands: (RunnerCommand | RunnerConfiguredCommand)[],
  flows: RunnerFlow[],
  profiles: RunnerEnvironmentProfile[] = [],
) {
  return stringify(
    {
      commands: Object.fromEntries(
        commands.map((command) => [command.id, runnerYamlCommand(command)]),
      ),
      flows: Object.fromEntries(flows.map(({ id, ...flow }) => [id, flow])),
      ...(profiles.length
        ? { profiles: Object.fromEntries(profiles.map(({ id, ...profile }) => [id, profile])) }
        : {}),
    },
    { lineWidth: 0 },
  )
}
export function validateRunnerYaml(
  source: string,
  detected: RunnerCommand[],
  inheritedProfiles: RunnerEnvironmentProfile[],
) {
  const configuration = parseRunnerYaml(source)
  const configured: RunnerCommand[] = configuration.commands.map((command) => ({
    ...command,
    displayCommand: command.command,
    category: "custom",
    program: "",
    args: [],
  }))
  const catalog = [
    ...configured,
    ...detected.filter(
      (command) => command.source !== "saved" && !configured.some((item) => item.id === command.id),
    ),
  ]
  const profiles = [...configuration.profiles, ...inheritedProfiles]
  for (const command of configuration.commands) {
    if (command.profile && !profiles.some((profile) => profile.id === command.profile))
      throw new Error("Perfil não encontrado.")
    for (const dependency of command.dependsOn ?? [])
      dependency.commandId = resolveRunnerReference(catalog, dependency.commandId).id
  }
  createRunnerPlan(
    catalog,
    configuration.commands.map((command) => command.id),
  )
  for (const flow of configuration.flows) {
    for (const stage of flow.stages)
      stage.commandIds = stage.commandIds.map((id) => resolveRunnerReference(catalog, id).id)
    createRunnerPlan(catalog, [], flow)
  }
  return configuration
}
