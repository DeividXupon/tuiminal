import {
  concretePgpassCandidate,
  EXTERNAL_DATABASE_ENTRY_LIMIT,
  externalConnectionId,
  matchingPgpassPassword,
  missingConnectionFields,
  mysqlTlsMode,
  parseMyCnf,
  parseMysqlLoginPaths,
  parseOptionGroups,
  parsePgpass,
  postgresTlsMode,
  type ParsedOptionGroup,
  type ParsedPgpassEntry,
} from "../model/external-connection-config"
import type {
  DatabaseConnectionDraft,
  DatabaseConnectionProfile,
  ExternalDatabaseConnectionCandidate,
} from "../model/types"
import {
  type ExternalDatabaseEnvironment,
  externalDatabasePaths,
  readExternalDatabaseFile,
} from "./external-database-files"
import { runMysqlConfigEditor } from "./mysql-config-editor"

type ExternalDiscoveryResult = {
  profiles: DatabaseConnectionProfile[]
  candidates: ExternalDatabaseConnectionCandidate[]
  credentials: Map<string, string>
  warnings: string[]
}
type DiscoveryOptions = {
  home?: string
  platform?: NodeJS.Platform
  environment?: ExternalDatabaseEnvironment
  effectiveUserId?: number
  runMysqlConfigEditor?: (signal?: AbortSignal) => Promise<string | null>
  signal?: AbortSignal
}
type CandidateInput = Omit<
  ExternalDatabaseConnectionCandidate,
  "id" | "missing" | "host" | "database" | "username" | "socket"
> & {
  host?: string | undefined
  database?: string | undefined
  username?: string | undefined
  socket?: string | undefined
}

const externalProfiles = new Map<string, DatabaseConnectionProfile>()
const externalCredentials = new Map<string, string>()
const completedProfiles = new Map<string, DatabaseConnectionProfile>()
const completedCredentials = new Map<string, string>()
let externalCandidates: ExternalDatabaseConnectionCandidate[] = []
let externalWarnings: string[] = []

export { externalDatabasePaths } from "./external-database-files"

function port(value: string | undefined, fallback: number) {
  const parsed = value === undefined || value === "" ? fallback : Number(value)
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65_535 ? parsed : fallback
}

function profileOrCandidate(
  result: ExternalDiscoveryResult,
  input: CandidateInput,
  identity: string,
  password: string | undefined,
  passwordAvailable: boolean,
) {
  if (result.profiles.length + result.candidates.length >= EXTERNAL_DATABASE_ENTRY_LIMIT) return
  const id = externalConnectionId(input.externalSource, identity, [
    input.host,
    input.port,
    input.database,
    input.username,
    input.socket,
  ])
  const candidate = Object.fromEntries(
    Object.entries({
      ...input,
      id,
      missing: missingConnectionFields(input, passwordAvailable),
    }).filter(([, value]) => value !== undefined),
  ) as ExternalDatabaseConnectionCandidate
  if (candidate.missing.length) result.candidates.push(candidate)
  else result.profiles.push(candidate)
  if (passwordAvailable) result.credentials.set(id, password ?? "")
}

function addMyCnf(result: ExternalDiscoveryResult, source: string, secretsAllowed: boolean) {
  const parsed = parseMyCnf(source)
  if (parsed.hasUnsupportedInclude) {
    result.warnings.push("~/.my.cnf: diretivas !include e !includedir não são seguidas.")
  }
  const values = parsed.values
  if (!Object.keys(values).length) return
  const passwordPresent = Object.hasOwn(values, "password")
  profileOrCandidate(
    result,
    {
      name: ".my.cnf · client",
      driver: "mysql",
      source: "external",
      externalSource: "mysql-option-file",
      host: values.host || undefined,
      port: port(values.port, 3306),
      database: values.database || undefined,
      username: values.user || undefined,
      socket: values.socket || undefined,
      ssl: mysqlTlsMode(values["ssl-mode"]) !== "disable",
      tlsMode: values.socket ? "disable" : mysqlTlsMode(values["ssl-mode"]),
      writeEnabled: true,
    },
    "client",
    secretsAllowed ? values.password : undefined,
    !passwordPresent || secretsAllowed,
  )
  if (passwordPresent && !secretsAllowed) {
    result.warnings.push("~/.my.cnf: a senha foi ignorada porque o arquivo não é privado.")
  }
}

function addLoginPaths(result: ExternalDiscoveryResult, source: string) {
  for (const group of parseMysqlLoginPaths(source)) {
    const values = group.values
    profileOrCandidate(
      result,
      {
        name: `MySQL login · ${group.name}`,
        driver: "mysql",
        source: "external",
        externalSource: "mysql-login-path",
        host: values.host || undefined,
        port: port(values.port, 3306),
        username: values.user || undefined,
        socket: values.socket || undefined,
        ssl: !values.socket,
        tlsMode: values.socket ? "disable" : "prefer",
        writeEnabled: true,
      },
      group.name,
      group.hasPassword ? undefined : "",
      !group.hasPassword,
    )
  }
}

function pgpassTarget(values: Record<string, string>) {
  const host = values.host?.trim()
  const username = values.user?.trim()
  const database = values.dbname?.trim() || username
  if (!host || !username || !database || host.includes(",")) return null
  return { host, port: port(values.port, 5432), database, username }
}

function addPostgresService(
  result: ExternalDiscoveryResult,
  group: ParsedOptionGroup,
  serviceSecretsAllowed: boolean,
  passEntries: ParsedPgpassEntry[],
  passSecretsAllowed: boolean,
) {
  const target = pgpassTarget(group.values)
  if (!target) {
    result.warnings.push(`PostgreSQL service ${group.name}: host/usuário/banco incompletos.`)
    return
  }
  const servicePasswordPresent = Object.hasOwn(group.values, "password")
  let password = passSecretsAllowed ? matchingPgpassPassword(passEntries, target) : undefined
  if (servicePasswordPresent) {
    password = serviceSecretsAllowed ? group.values.password : undefined
  }
  const tlsMode = postgresTlsMode(group.values.sslmode)
  profileOrCandidate(
    result,
    {
      ...target,
      name: `PostgreSQL service · ${group.name}`,
      driver: "postgres",
      source: "external",
      externalSource: "postgres-service",
      ssl: tlsMode !== "disable",
      tlsMode,
      writeEnabled: true,
    },
    group.name,
    password,
    password !== undefined,
  )
  if (servicePasswordPresent && !serviceSecretsAllowed) {
    result.warnings.push(
      `PostgreSQL service ${group.name}: a senha foi ignorada porque o arquivo não é privado.`,
    )
  }
}

function addPostgresServices(
  result: ExternalDiscoveryResult,
  serviceSource: string | null,
  serviceSecretsAllowed: boolean,
  passEntries: ParsedPgpassEntry[],
  passSecretsAllowed: boolean,
) {
  if (!serviceSource) return
  for (const group of parseOptionGroups(serviceSource)) {
    addPostgresService(result, group, serviceSecretsAllowed, passEntries, passSecretsAllowed)
  }
}

function addPgpassProfiles(
  result: ExternalDiscoveryResult,
  passEntries: ParsedPgpassEntry[],
  passSecretsAllowed: boolean,
) {
  for (const entry of passEntries) {
    const target = concretePgpassCandidate(entry)
    if (!target) continue
    profileOrCandidate(
      result,
      {
        ...target,
        name: `.pgpass · ${target.host}/${target.database}`,
        driver: "postgres",
        source: "external",
        externalSource: "postgres-passfile",
        ssl: true,
        tlsMode: "prefer",
        writeEnabled: true,
      },
      `${target.host}:${target.port}/${target.database}:${target.username}`,
      passSecretsAllowed ? entry.password : undefined,
      passSecretsAllowed,
    )
  }
}

export async function discoverExternalDatabaseConnections(
  options: DiscoveryOptions = {},
): Promise<ExternalDiscoveryResult> {
  const environment = options.environment ?? process.env
  const platform = options.platform ?? process.platform
  const effectiveUserId = options.effectiveUserId ?? process.geteuid?.()
  const paths = externalDatabasePaths(options.home, platform, environment)
  const result: ExternalDiscoveryResult = {
    profiles: [],
    candidates: [],
    credentials: new Map(),
    warnings: [],
  }
  const mysql = readExternalDatabaseFile(paths.mysql, platform, effectiveUserId, result.warnings)
  if (mysql) addMyCnf(result, mysql.source, mysql.secretsAllowed)
  try {
    const loginPaths = await (options.runMysqlConfigEditor ?? runMysqlConfigEditor)(options.signal)
    if (loginPaths) addLoginPaths(result, loginPaths)
  } catch (error) {
    if (!options.signal?.aborted) {
      result.warnings.push(
        `mysql_config_editor: ${error instanceof Error ? error.message : "falha na descoberta"}.`,
      )
    }
  }
  const service = readExternalDatabaseFile(
    paths.pgService,
    platform,
    effectiveUserId,
    result.warnings,
  )
  const passfile = readExternalDatabaseFile(
    paths.pgpass,
    platform,
    effectiveUserId,
    result.warnings,
  )
  const passEntries = passfile ? parsePgpass(passfile.source) : []
  addPostgresServices(
    result,
    service?.source ?? null,
    service?.secretsAllowed ?? false,
    passEntries,
    passfile?.secretsAllowed ?? false,
  )
  addPgpassProfiles(result, passEntries, passfile?.secretsAllowed ?? false)
  if (passfile && !passfile.secretsAllowed) {
    result.warnings.push("pgpass: as senhas foram ignoradas porque o arquivo não é privado.")
  }
  return result
}

export function installExternalDatabaseConnections(result: ExternalDiscoveryResult) {
  const previousIds = new Set(externalProfiles.keys())
  externalProfiles.clear()
  externalCredentials.clear()
  for (const profile of result.profiles) externalProfiles.set(profile.id, profile)
  for (const [id, password] of result.credentials) externalCredentials.set(id, password)
  externalCandidates = result.candidates.filter((candidate) => {
    const completed = completedProfiles.get(candidate.id)
    if (!completed) return true
    externalProfiles.set(completed.id, completed)
    externalCredentials.set(completed.id, completedCredentials.get(completed.id) ?? "")
    return false
  })
  for (const [id, profile] of completedProfiles) {
    if (!result.candidates.some((candidate) => candidate.id === id)) {
      completedProfiles.delete(id)
      completedCredentials.delete(id)
    } else externalProfiles.set(id, profile)
  }
  externalWarnings = result.warnings
  return [...previousIds].filter((id) => !externalProfiles.has(id))
}

export function listExternalDatabaseProfiles() {
  return [...externalProfiles.values()]
}

export function listExternalDatabaseCandidates() {
  return [...externalCandidates]
}

export function externalDatabaseDiscoveryWarnings() {
  return [...externalWarnings]
}

export function externalDatabasePassword(connectionId: string) {
  return externalCredentials.get(connectionId)
}

export function clearExternalDatabaseConnections() {
  externalProfiles.clear()
  externalCredentials.clear()
  completedProfiles.clear()
  completedCredentials.clear()
  externalCandidates = []
  externalWarnings = []
}

export function completeExternalDatabaseConnection(
  candidate: ExternalDatabaseConnectionCandidate,
  draft: DatabaseConnectionDraft,
  password: string,
) {
  const { missing: _missing, ...candidateProfile } = candidate
  const profile = Object.fromEntries(
    Object.entries({
      ...candidateProfile,
      ...draft,
      id: candidate.id,
      source: "external" as const,
      externalSource: candidate.externalSource,
      ssl: draft.ssl,
      tlsMode: draft.ssl ? (draft.tlsMode ?? candidate.tlsMode ?? "prefer") : "disable",
      writeEnabled: true,
    }).filter(([, value]) => value !== undefined),
  ) as DatabaseConnectionProfile
  completedProfiles.set(profile.id, profile)
  completedCredentials.set(profile.id, password)
  externalProfiles.set(profile.id, profile)
  externalCredentials.set(profile.id, password)
  externalCandidates = externalCandidates.filter((item) => item.id !== profile.id)
  return profile
}

export function resolvePgpassPassword(
  profile: Pick<DatabaseConnectionProfile, "host" | "port" | "database" | "username">,
  options: DiscoveryOptions = {},
) {
  const environment = options.environment ?? process.env
  const platform = options.platform ?? process.platform
  const path = externalDatabasePaths(options.home, platform, environment).pgpass
  const warnings: string[] = []
  const file = readExternalDatabaseFile(
    path,
    platform,
    options.effectiveUserId ?? process.geteuid?.(),
    warnings,
  )
  if (!file?.secretsAllowed) throw new Error("O arquivo pgpass não existe ou não está privado.")
  if (!profile.host || !profile.port || !profile.database || !profile.username) {
    throw new Error("Host, porta, banco e usuário são obrigatórios para usar pgpass.")
  }
  const password = matchingPgpassPassword(parsePgpass(file.source), {
    host: profile.host,
    port: profile.port,
    database: profile.database,
    username: profile.username,
  })
  if (password === undefined) throw new Error("Nenhuma entrada pgpass corresponde à conexão.")
  return password
}
