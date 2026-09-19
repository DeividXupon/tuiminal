import { resolve } from "node:path"
import { canonicalRunnerRoot, RUNNER_SETTINGS_PATH } from "./runner-paths"
export { canonicalRunnerRoot, RUNNER_SETTINGS_PATH } from "./runner-paths"
import { readRunnerYaml, mutateRunnerYaml } from "./runner-yaml"
import { parseRunnerYaml, runnerYamlCommand } from "../model/configuration-yaml"
import type {
  RunnerConfiguredCommand,
  RunnerPersistedExecution,
  RunnerSessionState,
} from "../model/config"
import type { RunnerFlow } from "../model/plan"
import { RunnerSettingsFileState } from "./runner-settings-file"

type RunnerSettings = {
  version: 2
  savedCommands: Record<string, RunnerConfiguredCommand[]>
  flows: Record<string, RunnerFlow[]>
  sessions: Record<string, RunnerSessionState>
  history: RunnerPersistedExecution[]
}

const EMPTY_SETTINGS: RunnerSettings = {
  version: 2,
  savedCommands: {},
  flows: {},
  sessions: {},
  history: [],
}
const runnerSettingsFile = new RunnerSettingsFileState<RunnerSettings>()

function emptyRunnerSession(): RunnerSessionState {
  return {
    openedProjects: [],
    activeProject: null,
    viewMode: "single",
    environmentProfiles: {},
  }
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function runnerSessionValue(value: unknown): RunnerSessionState {
  const session = objectValue(value)
  if (!session) return emptyRunnerSession()
  return {
    openedProjects: Array.isArray(session.openedProjects)
      ? session.openedProjects
          .filter((item): item is string => typeof item === "string")
          .map((item) => resolve(item))
          .slice(-4)
      : [],
    activeProject:
      typeof session.activeProject === "string" ? resolve(session.activeProject) : null,
    viewMode: session.viewMode === "multi" ? "multi" : "single",
    environmentProfiles: (objectValue(session.environmentProfiles) as Record<string, string>) ?? {},
  }
}

function decodeRunnerSettings(content: string): RunnerSettings {
  const source = objectValue(JSON.parse(content))
  if (!source) throw new Error("A configuração do Runner não é um objeto JSON.")
  const storedSessions = objectValue(source.sessions) ?? {}
  const sessions = Object.fromEntries(
    Object.entries(storedSessions).map(([root, session]) => [
      resolve(root),
      runnerSessionValue(session),
    ]),
  )
  const legacySession = runnerSessionValue(source.session)
  const legacyScope = legacySession.openedProjects[0]
  if (legacyScope && !sessions[legacyScope]) sessions[legacyScope] = legacySession
  return {
    version: 2,
    flows: (objectValue(source.flows) as RunnerSettings["flows"]) ?? {},
    savedCommands: (objectValue(source.savedCommands) as RunnerSettings["savedCommands"]) ?? {},
    sessions,
    history: Array.isArray(source.history)
      ? source.history
          .filter((item): item is RunnerPersistedExecution => Boolean(objectValue(item)))
          .slice(0, 30)
      : [],
  }
}

function readSettingsFile(path: string) {
  return runnerSettingsFile.read(path, decodeRunnerSettings, EMPTY_SETTINGS)
}

function writeSettingsFile(settings: RunnerSettings, path: string) {
  runnerSettingsFile.write(path, settings)
}

function mutateSettings(callback: (settings: RunnerSettings) => void, path = RUNNER_SETTINGS_PATH) {
  const settings = readSettingsFile(path)
  callback(settings)
  writeSettingsFile(settings, path)
  return settings
}

export function loadRunnerSession(scopeRoot: string, path = RUNNER_SETTINGS_PATH) {
  return readSettingsFile(path).sessions[resolve(scopeRoot)] ?? emptyRunnerSession()
}

export function loadRunnerStartupState(scopeRoot: string, path = RUNNER_SETTINGS_PATH) {
  const settings = readSettingsFile(path)
  return {
    session: settings.sessions[resolve(scopeRoot)] ?? emptyRunnerSession(),
    history: settings.history,
  }
}

export function saveRunnerSession(
  scopeRoot: string,
  session: RunnerSessionState,
  path = RUNNER_SETTINGS_PATH,
) {
  mutateSettings((settings) => {
    settings.sessions[resolve(scopeRoot)] = {
      openedProjects: [...new Set(session.openedProjects)].slice(-4),
      activeProject: session.activeProject,
      viewMode: session.viewMode,
      environmentProfiles: session.environmentProfiles,
    }
  }, path)
}

export function loadRunnerDefinitions(root: string, path = RUNNER_SETTINGS_PATH) {
  const yaml = readRunnerYaml(root, path)
  if (yaml.source !== null) {
    try {
      return parseRunnerYaml(yaml.source)
    } catch {
      // Keep discovery available so the user can repair the original YAML in the editor.
      return { commands: [], flows: [], profiles: [] }
    }
  }
  const settings = readSettingsFile(path)
  const key = canonicalRunnerRoot(root)
  return {
    commands: settings.savedCommands[key] ?? [],
    flows: settings.flows[key] ?? [],
    profiles: [],
  }
}

export function listSavedRunnerCommands(root: string, path = RUNNER_SETTINGS_PATH) {
  return loadRunnerDefinitions(root, path).commands
}

export function saveRunnerCommand(
  root: string,
  input: { label: string; command: string } & Partial<RunnerConfiguredCommand>,
  path = RUNNER_SETTINGS_PATH,
) {
  const projectRoot = canonicalRunnerRoot(root)
  const normalizedLabel = input.label.trim().slice(0, 80)
  const normalizedCommand = input.command.trim()
  if (!normalizedLabel || !normalizedCommand) {
    throw new Error("Informe um nome e um comando para salvar.")
  }
  const id =
    input.id ??
    `saved:${Buffer.from(normalizedLabel.toLocaleLowerCase()).toString("base64url").slice(0, 80)}`
  const saved: RunnerConfiguredCommand = {
    description: "Comando salvo neste projeto",
    interactive: Boolean(input.interactive),
    autostart: false,
    restartPolicy: "never",
    restartDelayMs: 1_000,
    maxRestarts: 5,
    persistLogs: false,
    ...input,
    id,
    label: normalizedLabel,
    command: normalizedCommand,
    source: "saved",
  }
  if (mutateRunnerYaml(root, "commands", id, runnerYamlCommand(saved), path)) return saved
  mutateSettings((settings) => {
    const current = settings.savedCommands[projectRoot] ?? []
    settings.savedCommands[projectRoot] = [
      saved,
      ...current.filter((command) => command.id !== id),
    ].slice(0, 50)
  }, path)
  return saved
}

export function removeSavedRunnerCommand(root: string, id: string, path = RUNNER_SETTINGS_PATH) {
  if (mutateRunnerYaml(root, "commands", id, undefined, path)) return
  const projectRoot = canonicalRunnerRoot(root)
  mutateSettings((settings) => {
    settings.savedCommands[projectRoot] = (settings.savedCommands[projectRoot] ?? []).filter(
      (command) => command.id !== id,
    )
  }, path)
}

export function normalizeRunnerManualCommand(source: string) {
  return source.trim()
}

export function loadRunnerHistory(path = RUNNER_SETTINGS_PATH) {
  return readSettingsFile(path).history
}

export function saveRunnerHistoryEntry(
  execution: RunnerPersistedExecution,
  path = RUNNER_SETTINGS_PATH,
) {
  mutateSettings((settings) => {
    settings.history = [
      execution,
      ...settings.history.filter((item) => item.id !== execution.id),
    ].slice(0, 30)
  }, path)
}

export function listRunnerFlows(root: string, path = RUNNER_SETTINGS_PATH) {
  return loadRunnerDefinitions(root, path).flows
}

export function saveRunnerFlow(root: string, flow: RunnerFlow, path = RUNNER_SETTINGS_PATH) {
  if (!flow.label.trim() || !flow.stages.length)
    throw new Error("Informe um nome e pelo menos uma etapa.")
  const { id, ...definition } = flow
  if (mutateRunnerYaml(root, "flows", id, definition, path)) return
  mutateSettings((settings) => {
    const key = canonicalRunnerRoot(root)
    settings.flows[key] = [
      ...(settings.flows[key] ?? []).filter((item) => item.id !== flow.id),
      flow,
    ]
  }, path)
}

export function removeRunnerFlow(root: string, id: string, path = RUNNER_SETTINGS_PATH) {
  if (mutateRunnerYaml(root, "flows", id, undefined, path)) return
  mutateSettings((settings) => {
    const key = canonicalRunnerRoot(root)
    settings.flows[key] = (settings.flows[key] ?? []).filter((flow) => flow.id !== id)
  }, path)
}
