import type {
  RunnerRestartPolicy,
  RunnerHealthCheck,
  RunnerConfiguredCommand,
  RunnerEnvironmentProfile,
  RunnerPersistedExecution,
  RunnerSessionState,
} from "../model/config"
export type * from "../model/config"
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { isAbsolute, join, resolve } from "node:path"
import { parse as parseYaml } from "yaml"
import { definedProperties } from "../../../shared/data/defined-properties"
import { RunnerSettingsFileState } from "./runner-settings-file"

type RunnerSettings = {
  version: 2
  savedCommands: Record<string, RunnerConfiguredCommand[]>
  sessions: Record<string, RunnerSessionState>
  history: RunnerPersistedExecution[]
}

const configRoot = process.env.XDG_CONFIG_HOME?.trim() || join(homedir(), ".config")
export const RUNNER_SETTINGS_PATH = join(configRoot, "tuiminal", "runner.json")

const EMPTY_SETTINGS: RunnerSettings = {
  version: 2,
  savedCommands: {},
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

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function booleanValue(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback
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

function numberValue(value: unknown, fallback: number, minimum: number, maximum: number) {
  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isFinite(parsed)
    ? Math.min(maximum, Math.max(minimum, Math.floor(parsed)))
    : fallback
}

function normalizeRestartPolicy(value: unknown): RunnerRestartPolicy {
  return value === "always" || value === "on-failure" ? value : "never"
}

function normalizeEnvironment(value: unknown) {
  const source = objectValue(value)
  if (!source) return undefined
  const entries = Object.entries(source)
    .filter(
      (entry): entry is [string, string | number | boolean] =>
        typeof entry[1] === "string" ||
        typeof entry[1] === "number" ||
        typeof entry[1] === "boolean",
    )
    .map(([key, nested]) => [key, String(nested)] as const)
  return entries.length ? Object.fromEntries(entries) : undefined
}

function resolveInside(root: string, value: string | undefined) {
  if (!value) return undefined
  return isAbsolute(value) ? value : resolve(root, value)
}

function commandString(value: unknown) {
  if (typeof value === "string") return value.trim()
  if (!Array.isArray(value)) return ""
  return value
    .filter((item): item is string | number => typeof item === "string" || typeof item === "number")
    .map((item) => {
      const text = String(item)
      return /^[\w./:@-]+$/.test(text) ? text : `'${text.replaceAll("'", "'\\''")}'`
    })
    .join(" ")
}

function normalizeHealthCheck(value: unknown): RunnerHealthCheck | undefined {
  const health = objectValue(value)
  if (!health) return undefined
  const timeoutMs = numberValue(health.timeoutMs, 30_000, 500, 600_000)
  if (health.type === "port") {
    const port = numberValue(health.port, 0, 0, 65_535)
    if (!port) return undefined
    return {
      type: "port",
      host: stringValue(health.host) ?? "127.0.0.1",
      port,
      timeoutMs,
    }
  }
  if (health.type === "http") {
    const url = stringValue(health.url)
    return url ? { type: "http", url, timeoutMs } : undefined
  }
  if (health.type === "log") {
    const pattern = stringValue(health.pattern)
    return pattern ? { type: "log", pattern, timeoutMs } : undefined
  }
  return undefined
}

function configuredCommand(
  name: string,
  value: unknown,
  options: {
    root: string
    source: RunnerConfiguredCommand["source"]
    profiles?: Record<string, RunnerEnvironmentProfile>
  },
): RunnerConfiguredCommand | null {
  const definition = objectValue(value)
  const sourceCommand =
    typeof value === "string"
      ? value
      : commandString(definition?.command ?? definition?.shell ?? definition?.cmd)
  if (!sourceCommand) return null

  const profileName = stringValue(definition?.profile)
  const profile = profileName ? options.profiles?.[profileName] : undefined
  const explicitAutostart = definition?.autostart === true
  const autorestart = definition?.autorestart === true
  const restartPolicy = autorestart
    ? "on-failure"
    : normalizeRestartPolicy(definition?.restart ?? definition?.restartPolicy)
  const label = stringValue(definition?.label) ?? name
  return definedProperties({
    id: `${options.source}:${name}`,
    label,
    command: sourceCommand,
    description: stringValue(definition?.description) ?? `Comando importado de ${options.source}`,
    source: options.source,
    cwd: resolveInside(options.root, stringValue(definition?.cwd)),
    env: {
      ...(profile?.env ?? {}),
      ...(normalizeEnvironment(definition?.env) ?? {}),
    },
    envFile: resolveInside(options.root, stringValue(definition?.envFile) ?? profile?.envFile),
    interactive: booleanValue(definition?.interactive),
    autostart: options.source === "tuiminal" && explicitAutostart,
    restartPolicy,
    restartDelayMs: numberValue(definition?.restartDelayMs, 1_000, 100, 300_000),
    maxRestarts: numberValue(definition?.maxRestarts, 5, 0, 100),
    persistLogs: booleanValue(definition?.persistLogs),
    healthCheck: normalizeHealthCheck(definition?.health ?? definition?.healthCheck),
  })
}

function parseProfiles(root: string, value: unknown) {
  const definitions = objectValue(value) ?? {}
  const profiles: Record<string, RunnerEnvironmentProfile> = {}
  for (const [name, rawDefinition] of Object.entries(definitions)) {
    const definition =
      typeof rawDefinition === "string" ? { envFile: rawDefinition } : objectValue(rawDefinition)
    if (!definition) continue
    profiles[name] = definedProperties({
      id: `config:${name}`,
      label: name,
      envFile: resolveInside(root, stringValue(definition.envFile)),
      env: normalizeEnvironment(definition.env),
    })
  }
  return profiles
}

export function parseTuiminalRunnerConfig(
  source: string,
  root: string,
): {
  commands: RunnerConfiguredCommand[]
  profiles: RunnerEnvironmentProfile[]
} {
  const document = objectValue(parseYaml(source)) ?? {}
  const profiles = parseProfiles(root, document.profiles)
  const definitions = objectValue(document.commands) ?? {}
  const commands = Object.entries(definitions)
    .map(([name, value]) =>
      configuredCommand(name, value, {
        root,
        source: "tuiminal",
        profiles,
      }),
    )
    .filter((command): command is RunnerConfiguredCommand => Boolean(command))
  return { commands, profiles: Object.values(profiles) }
}

export function parseMprocsConfig(source: string, root: string) {
  const document = objectValue(parseYaml(source)) ?? {}
  const definitions = objectValue(document.procs) ?? {}
  return Object.entries(definitions)
    .map(([name, value]) =>
      configuredCommand(name, value, {
        root,
        source: "mprocs",
      }),
    )
    .filter((command): command is RunnerConfiguredCommand => Boolean(command))
}

export function parseProcfile(source: string, root: string) {
  return source.split(/\r?\n/).flatMap((rawLine) => {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) return []
    const separator = line.indexOf(":")
    if (separator <= 0) return []
    const name = line.slice(0, separator).trim()
    const command = line.slice(separator + 1).trim()
    if (!name || !command) return []
    const parsed = configuredCommand(name, command, {
      root,
      source: "procfile",
    })
    return parsed ? [parsed] : []
  })
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

export function listSavedRunnerCommands(root: string, path = RUNNER_SETTINGS_PATH) {
  return readSettingsFile(path).savedCommands[resolve(root)] ?? []
}

export function saveRunnerCommand(
  root: string,
  input: { label: string; command: string; interactive?: boolean },
  path = RUNNER_SETTINGS_PATH,
) {
  const projectRoot = resolve(root)
  const normalizedLabel = input.label.trim().slice(0, 80)
  const normalizedCommand = input.command.trim()
  if (!normalizedLabel || !normalizedCommand) {
    throw new Error("Informe um nome e um comando para salvar.")
  }
  const id = `saved:${Buffer.from(normalizedLabel.toLocaleLowerCase())
    .toString("base64url")
    .slice(0, 80)}`
  const saved: RunnerConfiguredCommand = {
    id,
    label: normalizedLabel,
    command: normalizedCommand,
    description: "Comando salvo neste projeto",
    source: "saved",
    interactive: Boolean(input.interactive),
    autostart: false,
    restartPolicy: "never",
    restartDelayMs: 1_000,
    maxRestarts: 5,
    persistLogs: false,
  }
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
  const projectRoot = resolve(root)
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

export function loadRunnerProjectConfiguration(root: string) {
  const projectRoot = resolve(root)
  const commands: RunnerConfiguredCommand[] = [...listSavedRunnerCommands(projectRoot)]
  const profiles: RunnerEnvironmentProfile[] = []
  const tuiminalCandidates = [
    join(projectRoot, ".tuiminal", "runner.yaml"),
    join(projectRoot, ".tuiminal", "runner.yml"),
    join(projectRoot, "tuiminal.runner.yaml"),
    join(projectRoot, "tuiminal.runner.yml"),
  ]
  const tuiminalPath = tuiminalCandidates.find(existsSync)
  if (tuiminalPath) {
    try {
      const parsed = parseTuiminalRunnerConfig(readFileSync(tuiminalPath, "utf8"), projectRoot)
      commands.push(...parsed.commands)
      profiles.push(...parsed.profiles)
    } catch {
      // Invalid optional configuration must not hide automatically detected commands.
    }
  }
  const mprocsPath = join(projectRoot, "mprocs.yaml")
  if (existsSync(mprocsPath)) {
    try {
      commands.push(...parseMprocsConfig(readFileSync(mprocsPath, "utf8"), projectRoot))
    } catch {
      // Keep discovery resilient when another tool accepts YAML extensions we do not.
    }
  }
  for (const filename of ["Procfile", "Procfile.dev"]) {
    const path = join(projectRoot, filename)
    if (!existsSync(path)) continue
    try {
      commands.push(...parseProcfile(readFileSync(path, "utf8"), projectRoot))
    } catch {
      // Ignore unreadable optional process files.
    }
  }
  return { commands, profiles }
}

export function discoverRunnerEnvironmentProfiles(
  root: string,
  configuredProfiles?: RunnerEnvironmentProfile[],
) {
  const projectRoot = resolve(root)
  const configured = configuredProfiles ?? loadRunnerProjectConfiguration(projectRoot).profiles
  let files: string[] = []
  try {
    files = readdirSync(projectRoot)
      .filter((name) => /^\.env(?:\.[\w.-]+)?$/.test(name))
      .filter((name) => {
        try {
          return statSync(join(projectRoot, name)).isFile()
        } catch {
          return false
        }
      })
      .sort()
      .slice(0, 12)
  } catch {
    // An unreadable project simply has no detected environment profiles.
  }
  const detected = files.map((name) => ({
    id: `file:${name}`,
    label: name,
    envFile: join(projectRoot, name),
  }))
  const unique = new Map<string, RunnerEnvironmentProfile>()
  for (const profile of [...configured, ...detected]) unique.set(profile.id, profile)
  return [...unique.values()]
}

export function parseRunnerEnv(source: string) {
  const environment: Record<string, string> = {}
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue
    const normalized = line.startsWith("export ") ? line.slice(7).trim() : line
    const separator = normalized.indexOf("=")
    if (separator <= 0) continue
    const key = normalized.slice(0, separator).trim()
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue
    let value = normalized.slice(separator + 1).trim()
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1)
    }
    environment[key] = value.replaceAll("\\n", "\n")
  }
  return environment
}

function loadEnvFile(path: string | undefined) {
  if (!path) return {}
  try {
    return parseRunnerEnv(readFileSync(path, "utf8"))
  } catch {
    return {}
  }
}

export function runnerProcessEnvironment(
  profile: RunnerEnvironmentProfile | undefined,
  command: Pick<RunnerConfiguredCommand, "env" | "envFile">,
) {
  return {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    ),
    ...loadEnvFile(profile?.envFile),
    ...(profile?.env ?? {}),
    ...loadEnvFile(command.envFile),
    ...(command.env ?? {}),
  }
}

function safeLogName(label: string) {
  return (
    label
      .trim()
      .replace(/[^\p{L}\p{N}._-]+/gu, "-")
      .replace(/^-+|-+$/g, "") || "processo"
  )
}

export function exportRunnerLog(root: string, label: string, content: string) {
  const directory = join(resolve(root), "tuiminal-logs")
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  const stamp = new Date()
    .toISOString()
    .replaceAll(":", "-")
    .replace(/\.\d{3}Z$/, "Z")
  const base = `${safeLogName(label)}-${stamp}`
  let path = join(directory, `${base}.log`)
  let suffix = 2
  while (existsSync(path)) {
    path = join(directory, `${base}-${suffix}.log`)
    suffix += 1
  }
  writeFileSync(path, content.endsWith("\n") ? content : `${content}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  })
  return path
}

export function runnerPortUrl(host: string, port: number) {
  const normalizedHost =
    !host || host === "*" || host === "0.0.0.0" || host === "::"
      ? "127.0.0.1"
      : host.includes(":") && !host.startsWith("[")
        ? `[${host}]`
        : host
  return `http://${normalizedHost}:${port}`
}
