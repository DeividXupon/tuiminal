import { mkdir, realpath } from "node:fs/promises"
import {
  HTTP_SECRET_SERVICE,
  HttpEnvironmentConflictError,
  readHttpEnvironmentSource,
  runtimeCredentialStore,
  validatesEnvironmentName,
  validatesVariableName,
  writeAtomic,
  type HttpCredentialStore,
} from "./environments"
import { GLOBAL_HTTP_ENVIRONMENT_NAME } from "../model/environment-scope"

export type CreateGlobalHttpEnvironmentInput = {
  environmentName: string
  variables: Array<{ name: string; value: string }>
}

type WriteMode = "create" | "replace" | "globals"
const KEYCHAIN_REFERENCE = /^\{\{(\$tuiminal\.keychain\.[\w-]+)\}\}$/u

function keychainReferences(values: Record<string, unknown> | undefined) {
  return Object.values(values ?? {}).flatMap((value) => {
    const reference = typeof value === "string" ? value.match(KEYCHAIN_REFERENCE)?.[1] : null
    return reference ? [reference] : []
  })
}

async function deleteReferences(
  references: readonly string[],
  store: HttpCredentialStore | undefined,
) {
  await Promise.all(
    references.map((name) =>
      store?.delete({ service: HTTP_SECRET_SERVICE, name }).catch(() => false),
    ),
  )
}

function validatedVariables(input: CreateGlobalHttpEnvironmentInput) {
  if (input.variables.length > 100) {
    throw new HttpEnvironmentConflictError("O ambiente excede o limite de 100 variáveis.")
  }
  const variables = input.variables.map(({ name, value }) => ({ name: name.trim(), value }))
  const names = new Set<string>()
  for (const variable of variables) {
    if (!validatesVariableName(variable.name)) {
      throw new HttpEnvironmentConflictError("Informe um nome de variável válido.")
    }
    if (KEYCHAIN_REFERENCE.test(variable.value)) {
      throw new HttpEnvironmentConflictError(
        "Não foi possível carregar uma variável do gerenciador de credenciais; reabra após recuperar o acesso.",
      )
    }
    if (names.has(variable.name)) {
      throw new HttpEnvironmentConflictError("Há variáveis duplicadas no ambiente.")
    }
    names.add(variable.name)
  }
  return variables
}

async function writeGlobalHttpEnvironment(
  root: string,
  input: CreateGlobalHttpEnvironmentInput,
  mode: WriteMode,
  credentialStore: HttpCredentialStore | undefined,
  originalName = input.environmentName,
) {
  const environmentName = input.environmentName.trim()
  if (!validatesEnvironmentName(environmentName) || !environmentName) {
    throw new HttpEnvironmentConflictError("Informe um nome de ambiente válido.")
  }
  if (
    mode === "globals"
      ? environmentName !== GLOBAL_HTTP_ENVIRONMENT_NAME
      : environmentName.toLowerCase() === GLOBAL_HTTP_ENVIRONMENT_NAME.toLowerCase()
  ) {
    throw new HttpEnvironmentConflictError("Globals é um ambiente reservado.")
  }
  const variables = validatedVariables(input)
  if (!credentialStore) {
    throw new HttpEnvironmentConflictError("O gerenciador de credenciais não está disponível.")
  }
  await mkdir(root, { recursive: true, mode: 0o700 })
  const directory = await realpath(root)
  const [publicSource, privateSource] = await Promise.all([
    readHttpEnvironmentSource(directory, "http-client.env.json"),
    readHttpEnvironmentSource(directory),
  ])
  const exists =
    Object.hasOwn(publicSource.file, originalName) ||
    Object.hasOwn(privateSource.file, originalName)
  const targetExists =
    Object.hasOwn(publicSource.file, environmentName) ||
    Object.hasOwn(privateSource.file, environmentName)
  if (mode === "create" && targetExists) {
    throw new HttpEnvironmentConflictError("O ambiente já existe.")
  }
  if (mode === "replace" && !exists) {
    throw new HttpEnvironmentConflictError("O ambiente não existe mais.")
  }
  if (mode === "replace" && originalName !== environmentName && targetExists) {
    throw new HttpEnvironmentConflictError("O ambiente já existe.")
  }
  const oldReferences = keychainReferences(privateSource.file[originalName])
  const references: string[] = []
  const values: Record<string, string> = {}
  let privateWritten = false
  try {
    await fillEnvironmentValues(variables, values, references, credentialStore)
    const { [originalName]: _previous, ...remainingPrivate } = privateSource.file
    const content = `${JSON.stringify({ ...remainingPrivate, [environmentName]: values }, null, 2)}\n`
    if (Buffer.byteLength(content) > 1_000_000) {
      throw new HttpEnvironmentConflictError("O arquivo de ambiente ultrapassa 1 MB.")
    }
    await writeAtomic(privateSource.path, content, 0o600, privateSource.source)
    privateWritten = true
    if (Object.hasOwn(publicSource.file, originalName)) {
      const { [originalName]: _removed, ...remaining } = publicSource.file
      await writeAtomic(
        publicSource.path,
        `${JSON.stringify(remaining, null, 2)}\n`,
        0o600,
        publicSource.source,
      )
    }
  } catch (error) {
    if (!privateWritten) await deleteReferences(references, credentialStore)
    throw error
  }
  await deleteReferences(oldReferences, credentialStore)
  return { environmentName }
}

export function createGlobalHttpEnvironment(
  root: string,
  input: CreateGlobalHttpEnvironmentInput,
  credentialStore = runtimeCredentialStore(),
) {
  return writeGlobalHttpEnvironment(root, input, "create", credentialStore)
}

export function replaceGlobalHttpEnvironment(
  root: string,
  originalName: string,
  input: CreateGlobalHttpEnvironmentInput,
  credentialStore = runtimeCredentialStore(),
) {
  return writeGlobalHttpEnvironment(root, input, "replace", credentialStore, originalName)
}

export function saveGlobalHttpVariables(
  root: string,
  variables: CreateGlobalHttpEnvironmentInput["variables"],
  credentialStore = runtimeCredentialStore(),
) {
  return writeGlobalHttpEnvironment(
    root,
    { environmentName: GLOBAL_HTTP_ENVIRONMENT_NAME, variables },
    "globals",
    credentialStore,
  )
}

export async function deleteGlobalHttpEnvironment(
  root: string,
  environmentName: string,
  credentialStore = runtimeCredentialStore(),
) {
  if (environmentName.toLowerCase() === GLOBAL_HTTP_ENVIRONMENT_NAME.toLowerCase()) {
    throw new HttpEnvironmentConflictError("Globals não pode ser excluído.")
  }
  const directory = await realpath(root)
  const [publicSource, privateSource] = await Promise.all([
    readHttpEnvironmentSource(directory, "http-client.env.json"),
    readHttpEnvironmentSource(directory),
  ])
  const publicExists = Object.hasOwn(publicSource.file, environmentName)
  const privateExists = Object.hasOwn(privateSource.file, environmentName)
  if (!publicExists && !privateExists) {
    throw new HttpEnvironmentConflictError("O ambiente não existe mais.")
  }
  if (publicExists) {
    const { [environmentName]: _removed, ...remaining } = publicSource.file
    await writeAtomic(
      publicSource.path,
      `${JSON.stringify(remaining, null, 2)}\n`,
      0o600,
      publicSource.source,
    )
  }
  if (privateExists) {
    const { [environmentName]: _removed, ...remaining } = privateSource.file
    await writeAtomic(
      privateSource.path,
      `${JSON.stringify(remaining, null, 2)}\n`,
      0o600,
      privateSource.source,
    )
  }
  await deleteReferences(keychainReferences(privateSource.file[environmentName]), credentialStore)
  return { environmentName }
}

async function fillEnvironmentValues(
  variables: Array<{ name: string; value: string }>,
  values: Record<string, string>,
  references: string[],
  credentialStore: HttpCredentialStore,
) {
  for (const variable of variables) {
    const reference = `$tuiminal.keychain.${crypto.randomUUID()}`
    await credentialStore.set({
      service: HTTP_SECRET_SERVICE,
      name: reference,
      value: variable.value,
    })
    references.push(reference)
    values[variable.name] = `{{${reference}}}`
  }
}
