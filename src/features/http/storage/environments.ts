import { chmod, lstat, open, readFile, rename, unlink } from "node:fs/promises"
import { resolve } from "node:path"
import { createHttpVariableContext } from "../model/variables"

export const PRIVATE_HTTP_ENVIRONMENT_FILE = "http-client.private.env.json"
export const HTTP_SECRET_SERVICE = "dev.tuiminal.http"
const PRIVATE_ENVIRONMENT_LIMIT = 1_000_000
const KEYCHAIN_REFERENCE = /^\{\{(\$tuiminal\.keychain\.[\w-]+)\}\}$/u

export type HttpEnvironment = {
  name: string
  values: Record<string, string>
  privateNames: Set<string>
  production: boolean
}

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

async function readPrivateEnvironmentSource(root: string) {
  const path = resolve(root, PRIVATE_HTTP_ENVIRONMENT_FILE)
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

async function gitIgnoresPrivateEnvironment(root: string) {
  try {
    const source = await readFile(resolve(root, ".gitignore"), "utf8")
    if (
      source
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .some(
          (line) =>
            line === PRIVATE_HTTP_ENVIRONMENT_FILE || line === `/${PRIVATE_HTTP_ENVIRONMENT_FILE}`,
        )
    ) {
      return true
    }
  } catch {
    // Git can still report a rule inherited from another ignore file.
  }
  try {
    const child = Bun.spawn(
      ["git", "check-ignore", "--quiet", "--no-index", PRIVATE_HTTP_ENVIRONMENT_FILE],
      { cwd: root, stdout: "ignore", stderr: "ignore" },
    )
    return (await child.exited) === 0
  } catch {
    return false
  }
}

async function addPrivateEnvironmentToGitignore(root: string) {
  if (await gitIgnoresPrivateEnvironment(root)) return false
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
  const current = await readPrivateEnvironmentSource(root)
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
    ? await addPrivateEnvironmentToGitignore(root)
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
    gitignoreProtected: await gitIgnoresPrivateEnvironment(root),
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

export async function loadHttpEnvironments(
  root: string,
  credentialStore = runtimeCredentialStore(),
): Promise<HttpEnvironment[]> {
  const [publicFile, rawPrivateFile] = await Promise.all([
    readEnvironmentFile(resolve(root, "http-client.env.json")),
    readEnvironmentFile(resolve(root, "http-client.private.env.json")),
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
    }
  })
}

export function httpBuiltInVariables(now = new Date(), uuid = crypto.randomUUID()) {
  return {
    $timestamp: String(Math.floor(now.getTime() / 1_000)),
    $isoTimestamp: now.toISOString(),
    "$random.uuid": uuid,
  }
}

export function environmentVariableContext(
  environment: HttpEnvironment | undefined,
  fileValues: Readonly<Record<string, string>> = {},
  requestValues: Readonly<Record<string, string>> = {},
) {
  const privateValues: Record<string, string> = {}
  const publicValues: Record<string, string> = {}
  for (const [name, value] of Object.entries(environment?.values ?? {})) {
    if (environment?.privateNames.has(name)) privateValues[name] = value
    else publicValues[name] = value
  }
  return createHttpVariableContext([
    { origin: "request", values: requestValues },
    { origin: "file", values: fileValues },
    { origin: "private", values: privateValues, secret: true },
    { origin: "public", values: publicValues },
    { origin: "built-in", values: httpBuiltInVariables() },
  ])
}
