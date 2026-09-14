import { chmod, lstat, open, readFile, realpath, rename, unlink } from "node:fs/promises"
import { relative, resolve, sep } from "node:path"
import {
  environmentDirectoryLineage,
  httpEnvironmentsForRequest,
  type HttpEnvironment,
  type HttpEnvironmentCatalog,
} from "../model/environment-scope"

export {
  environmentVariableContext,
  httpBuiltInVariables,
  httpEnvironmentScopeDirectory,
  httpEnvironmentsForRequest,
} from "../model/environment-scope"
export type { HttpEnvironment, HttpEnvironmentCatalog } from "../model/environment-scope"

export const PRIVATE_HTTP_ENVIRONMENT_FILE = "http-client.private.env.json"
export const HTTP_SECRET_SERVICE = "dev.tuiminal.http"
const PRIVATE_ENVIRONMENT_LIMIT = 1_000_000
const KEYCHAIN_REFERENCE = /^\{\{(\$tuiminal\.keychain\.[\w-]+)\}\}$/u

type EnvironmentFile = Record<string, Record<string, unknown>>

export type CreatePrivateHttpEnvironmentInput = {
  environmentName: string
  variableName: string
  value: string
  addToGitignore: boolean
  storeInKeychain: boolean
}

export type CreatePrivateHttpEnvironmentResult = {
  environmentName: string
  variableName: string
  gitignoreUpdated: boolean
  gitignoreProtected: boolean
  keychainStored: boolean
}

export type HttpCredentialStore = {
  get: (options: { service: string; name: string }) => Promise<string | null>
  set: (options: { service: string; name: string; value: string }) => Promise<void>
  delete: (options: { service: string; name: string }) => Promise<boolean>
}

export class HttpEnvironmentConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "HttpEnvironmentConflictError"
  }
}

function missing(error: unknown) {
  return (error as NodeJS.ErrnoException | undefined)?.code === "ENOENT"
}

async function assertRegularOrMissing(path: string) {
  try {
    const info = await lstat(path)
    if (!info.isFile() || info.isSymbolicLink()) {
      throw new HttpEnvironmentConflictError(
        "O arquivo de ambiente precisa ser um arquivo regular.",
      )
    }
  } catch (error) {
    if (!missing(error)) throw error
  }
}

async function readEnvironmentFile(path: string): Promise<EnvironmentFile> {
  try {
    await assertRegularOrMissing(path)
    const parsed = JSON.parse(await readFile(path, "utf8"))
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {}
    return parsed as EnvironmentFile
  } catch {
    return {}
  }
}

async function readPrivateEnvironmentSource(directory: string) {
  const path = resolve(directory, PRIVATE_HTTP_ENVIRONMENT_FILE)
  await assertRegularOrMissing(path)
  try {
    const source = await readFile(path, "utf8")
    if (Buffer.byteLength(source) > PRIVATE_ENVIRONMENT_LIMIT) {
      throw new HttpEnvironmentConflictError("O arquivo de ambiente privado ultrapassa 1 MB.")
    }
    const parsed = JSON.parse(source) as unknown
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new HttpEnvironmentConflictError("O arquivo de ambiente privado contém JSON inválido.")
    }
    return { path, source, file: parsed as EnvironmentFile }
  } catch (error) {
    if (missing(error)) return { path, source: null, file: {} as EnvironmentFile }
    if (error instanceof SyntaxError) {
      throw new HttpEnvironmentConflictError("O arquivo de ambiente privado contém JSON inválido.")
    }
    throw error
  }
}

async function writeAtomic(path: string, content: string, mode: number, expected: string | null) {
  const temporary = `${path}.tuiminal-${process.pid}-${Date.now()}.tmp`
  const handle = await open(temporary, "wx", mode)
  try {
    await handle.writeFile(content, "utf8")
    await handle.sync()
    await handle.close()
    await assertRegularOrMissing(path)
    const current = await readFile(path, "utf8").catch((error) => {
      if (missing(error)) return null
      throw error
    })
    if (current !== expected) {
      throw new HttpEnvironmentConflictError("O arquivo mudou fora do Tuiminal; tente novamente.")
    }
    await rename(temporary, path)
    await chmod(path, mode)
  } catch (error) {
    await handle.close().catch(() => undefined)
    await unlink(temporary).catch(() => undefined)
    throw error
  }
}

function validatesEnvironmentName(value: string) {
  return (
    value.length <= 80 &&
    [...value].every((character) => {
      const codePoint = character.codePointAt(0) ?? 0
      return codePoint > 31 && codePoint !== 127
    })
  )
}

function validatesVariableName(value: string) {
  return /^[A-Za-z_$][\w$.-]*$/u.test(value) && value.length <= 120
}

function portablePath(path: string) {
  return path.split(sep).join("/")
}

function insideProject(root: string, candidate: string) {
  return candidate === root || candidate.startsWith(`${root}${sep}`)
}

async function gitIgnoresPrivateEnvironment(root: string, privatePath: string) {
  try {
    const source = await readFile(resolve(root, ".gitignore"), "utf8")
    if (
      source
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .some(
          (line) =>
            line === PRIVATE_HTTP_ENVIRONMENT_FILE ||
            line === `/${PRIVATE_HTTP_ENVIRONMENT_FILE}` ||
            line === privatePath ||
            line === `/${privatePath}`,
        )
    ) {
      return true
    }
  } catch {
    // Git can still report a rule inherited from another ignore file.
  }
  try {
    const child = Bun.spawn(["git", "check-ignore", "--quiet", "--no-index", privatePath], {
      cwd: root,
      stdout: "ignore",
      stderr: "ignore",
    })
    return (await child.exited) === 0
  } catch {
    return false
  }
}

async function addPrivateEnvironmentToGitignore(root: string, privatePath: string) {
  if (await gitIgnoresPrivateEnvironment(root, privatePath)) return false
  const path = resolve(root, ".gitignore")
  await assertRegularOrMissing(path)
  const source = await readFile(path, "utf8").catch((error) => {
    if (missing(error)) return null
    throw error
  })
  const current = source ?? ""
  const separator = current && !current.endsWith("\n") ? "\n" : ""
  const info = await lstat(path).catch((error) => {
    if (missing(error)) return null
    throw error
  })
  const mode = info ? info.mode & 0o777 : 0o644
  await writeAtomic(path, `${current}${separator}${PRIVATE_HTTP_ENVIRONMENT_FILE}\n`, mode, source)
  return true
}

export async function createPrivateHttpEnvironment(
  root: string,
  input: CreatePrivateHttpEnvironmentInput,
  credentialStore = runtimeCredentialStore(),
  scopeDirectory = "",
): Promise<CreatePrivateHttpEnvironmentResult> {
  const environmentName = input.environmentName.trim()
  const variableName = input.variableName.trim()
  if (!validatesEnvironmentName(environmentName) || !environmentName) {
    throw new HttpEnvironmentConflictError("Informe um nome de ambiente válido.")
  }
  if (!validatesVariableName(variableName)) {
    throw new HttpEnvironmentConflictError("Informe um nome de variável válido.")
  }
  if (!input.value) throw new HttpEnvironmentConflictError("Informe o valor privado.")
  if (input.storeInKeychain && !credentialStore) {
    throw new HttpEnvironmentConflictError("O gerenciador de credenciais não está disponível.")
  }
  const projectRoot = await realpath(root)
  const requestedScope = resolve(projectRoot, scopeDirectory)
  if (!insideProject(projectRoot, requestedScope)) {
    throw new HttpEnvironmentConflictError("O ambiente precisa permanecer dentro do projeto.")
  }
  const scope = await realpath(requestedScope).catch(() => {
    throw new HttpEnvironmentConflictError("O diretório do ambiente não existe.")
  })
  if (!insideProject(projectRoot, scope)) {
    throw new HttpEnvironmentConflictError("O ambiente precisa permanecer dentro do projeto.")
  }
  const privatePath = portablePath(
    relative(projectRoot, resolve(scope, PRIVATE_HTTP_ENVIRONMENT_FILE)),
  )
  const current = await readPrivateEnvironmentSource(scope)
  const values = current.file[environmentName]
  if (values && Object.hasOwn(values, variableName)) {
    throw new HttpEnvironmentConflictError(
      `A variável ${variableName} já existe no ambiente privado ${environmentName}.`,
    )
  }
  const reference = `$tuiminal.keychain.${crypto.randomUUID()}`
  const storedValue = input.storeInKeychain ? `{{${reference}}}` : input.value
  const next = {
    ...current.file,
    [environmentName]: { ...values, [variableName]: storedValue },
  }
  const gitignoreUpdated = input.addToGitignore
    ? await addPrivateEnvironmentToGitignore(projectRoot, privatePath)
    : false
  if (input.storeInKeychain) {
    await credentialStore?.set({
      service: HTTP_SECRET_SERVICE,
      name: reference,
      value: input.value,
    })
  }
  try {
    await writeAtomic(current.path, `${JSON.stringify(next, null, 2)}\n`, 0o600, current.source)
  } catch (error) {
    if (input.storeInKeychain) {
      await credentialStore
        ?.delete({ service: HTTP_SECRET_SERVICE, name: reference })
        .catch(() => false)
    }
    throw error
  }
  return {
    environmentName,
    variableName,
    gitignoreUpdated,
    gitignoreProtected: await gitIgnoresPrivateEnvironment(projectRoot, privatePath),
    keychainStored: input.storeInKeychain,
  }
}

function stringValues(source: Record<string, unknown> | undefined) {
  return Object.fromEntries(
    Object.entries(source ?? {}).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  )
}

function runtimeCredentialStore(): HttpCredentialStore | undefined {
  return (
    globalThis as typeof globalThis & {
      Bun?: { secrets?: HttpCredentialStore }
    }
  ).Bun?.secrets
}

async function resolveKeychainValues(
  file: EnvironmentFile,
  credentialStore: HttpCredentialStore | undefined,
) {
  const resolved: EnvironmentFile = {}
  for (const [environmentName, source] of Object.entries(file)) {
    const values: Record<string, unknown> = { ...source }
    await Promise.all(
      Object.entries(values).map(async ([variableName, value]) => {
        const reference = typeof value === "string" ? value.match(KEYCHAIN_REFERENCE)?.[1] : null
        if (!reference || !credentialStore) return
        try {
          const secret = await credentialStore.get({
            service: HTTP_SECRET_SERVICE,
            name: reference,
          })
          if (secret !== null) values[variableName] = secret
        } catch {
          // Keep the unresolved reference so preparation reports it without exposing a value.
        }
      }),
    )
    resolved[environmentName] = values
  }
  return resolved
}

async function environmentsInDirectory(
  root: string,
  directory: string,
  credentialStore: HttpCredentialStore | undefined,
) {
  const projectRoot = await realpath(root).catch(() => resolve(root))
  const candidate = resolve(projectRoot, directory)
  if (!insideProject(projectRoot, candidate)) return []
  const absoluteDirectory = await realpath(candidate).catch(() => null)
  if (!absoluteDirectory || !insideProject(projectRoot, absoluteDirectory)) return []
  const [publicFile, rawPrivateFile] = await Promise.all([
    readEnvironmentFile(resolve(absoluteDirectory, "http-client.env.json")),
    readEnvironmentFile(resolve(absoluteDirectory, "http-client.private.env.json")),
  ])
  const privateFile = await resolveKeychainValues(rawPrivateFile, credentialStore)
  const names = [...new Set([...Object.keys(publicFile), ...Object.keys(privateFile)])].sort()
  return names.map((name) => {
    const publicValues = stringValues(publicFile[name])
    const privateValues = stringValues(privateFile[name])
    return {
      name,
      values: { ...publicValues, ...privateValues },
      privateNames: new Set(Object.keys(privateValues)),
      production: /(^|[-_])(prod|production|produção)($|[-_])/i.test(name),
      directory,
    }
  })
}

export async function loadHttpEnvironmentCatalog(
  root: string,
  requestPaths: readonly string[],
  credentialStore = runtimeCredentialStore(),
): Promise<HttpEnvironmentCatalog> {
  const directories = new Set<string>([""])
  for (const requestPath of requestPaths) {
    for (const directory of environmentDirectoryLineage(requestPath)) directories.add(directory)
  }
  const scopes = await Promise.all(
    [...directories].map(async (directory) => ({
      directory,
      environments: await environmentsInDirectory(root, directory, credentialStore),
    })),
  )
  return { scopes }
}

export async function loadHttpEnvironments(
  root: string,
  credentialStore = runtimeCredentialStore(),
  requestPath?: string | null,
): Promise<HttpEnvironment[]> {
  const catalog = await loadHttpEnvironmentCatalog(
    root,
    requestPath ? [requestPath] : [],
    credentialStore,
  )
  return httpEnvironmentsForRequest(catalog, requestPath)
}
