import { chmod, lstat, mkdir, realpath, rm } from "node:fs/promises"
import { relative, resolve, sep } from "node:path"
import { importPostmanAccountCollection } from "../importing/postman"
import { record } from "../importing/shared"
import { ensureHttpWorkspaceDirectory } from "../services/context"
import { validatesVariableName, type HttpCredentialStore } from "../storage/environments"
import {
  createGlobalHttpEnvironment,
  deleteGlobalHttpEnvironment,
} from "../storage/global-environments"
import { serializeImportedHttpCollection, writeImportedHttpCollection } from "../storage/imports"
import type { PostmanApi, PostmanCollection, PostmanVariable } from "./api"
import { postmanDisplayName } from "./display"
import { writePostmanProvenance } from "./sync"

type PullApi = Pick<
  PostmanApi,
  "collections" | "collection" | "environment" | "environments" | "globals"
>

export type PostmanPullOptions = {
  workspaceId: string
  collectionId: string
  environmentId?: string
  collections?: readonly PostmanCollection[]
}

function variableEntries(source: unknown, label: string, warnings: string[]) {
  if (!Array.isArray(source)) return []
  return source.flatMap((raw): Array<[string, string]> => {
    const entry = record(raw) as PostmanVariable | null
    if (!entry || entry.enabled === false || !validatesVariableName(entry.key)) return []
    if (typeof entry.value !== "string") {
      warnings.push(`${label}: ${entry.key} não tem valor disponível pela API Postman.`)
      return []
    }
    return [[entry.key, entry.value]]
  })
}

function environmentName(collectionName: string, remoteEnvironmentName?: string) {
  const name = `Postman · ${collectionName}${remoteEnvironmentName ? ` · ${remoteEnvironmentName}` : ""}`
  return postmanDisplayName(name).slice(0, 72).trim()
}

export async function safeImportDirectory(root: string) {
  const directory = resolve(root, "postman")
  const entry = await lstat(directory).catch((error) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
    throw error
  })
  if (entry && (!entry.isDirectory() || entry.isSymbolicLink())) {
    throw new Error("A pasta Postman da biblioteca HTTP precisa ser um diretório real.")
  }
  if (!entry) await mkdir(directory, { mode: 0o700 })
  const canonical = await realpath(directory)
  if (!canonical.startsWith(`${root}${sep}`)) {
    throw new Error("A pasta Postman não pode sair da biblioteca HTTP.")
  }
  await chmod(canonical, 0o700)
  return canonical
}

async function workspaceVariables(api: PullApi, workspaceId: string, warnings: string[]) {
  try {
    return variableEntries(await api.globals(workspaceId), "Globals", warnings)
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("não tem acesso")) throw error
    warnings.push("Variáveis globais do workspace não estão disponíveis para esta conta.")
    return []
  }
}

async function selectedEnvironmentVariables(
  api: PullApi,
  options: PostmanPullOptions,
  warnings: string[],
) {
  if (!options.environmentId) return { name: undefined, entries: [] as Array<[string, string]> }
  const environments = await api.environments(options.workspaceId)
  const selected = environments.find(
    (item) => item.id === options.environmentId || item.uid === options.environmentId,
  )
  if (!selected) throw new Error("Ambiente não encontrado neste workspace Postman.")
  const environment = await api.environment(selected.uid ?? selected.id)
  return {
    name: environment.name,
    entries: variableEntries(environment.values, "Ambiente", warnings),
  }
}

async function saveVariables(
  root: string,
  collectionName: string,
  remoteEnvironmentName: string | undefined,
  variables: Map<string, string>,
  credentialStore?: HttpCredentialStore,
) {
  if (!variables.size) return null
  const baseName = environmentName(collectionName, remoteEnvironmentName)
  for (let index = 1; index <= 100; index += 1) {
    const name = index === 1 ? baseName : `${baseName.slice(0, 68)} ${index}`
    try {
      await createGlobalHttpEnvironment(
        root,
        {
          environmentName: name,
          variables: [...variables].map(([variableName, value]) => ({ name: variableName, value })),
        },
        credentialStore,
      )
      return name
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "O ambiente já existe.") throw error
    }
  }
  throw new Error("Não foi possível escolher um nome de ambiente livre.")
}

export async function pullPostmanCollection(
  root: string,
  api: PullApi,
  options: PostmanPullOptions,
  credentialStore?: HttpCredentialStore,
) {
  const collections = options.collections ?? (await api.collections(options.workspaceId))
  const selected = collections.find(
    (collection) =>
      collection.id === options.collectionId || collection.uid === options.collectionId,
  )
  if (!selected) throw new Error("Coleção não encontrada neste workspace Postman.")
  const document = await api.collection(selected.uid ?? selected.id)
  const { report, privateValues } = importPostmanAccountCollection(document)
  const serialized = serializeImportedHttpCollection(report)
  if (Buffer.byteLength(serialized) > 1_000_000) {
    throw new Error("A coleção convertida excede o limite de 1 MB por arquivo HTTP.")
  }
  const warnings = [
    ...report.warnings,
    ...report.ignored
      .filter((item) => item !== "Coleção: variáveis")
      .map((item) => `Não importado: ${item}`),
  ]
  const remoteEnvironment = await selectedEnvironmentVariables(api, options, warnings)
  const variables = new Map<string, string>([
    ...(await workspaceVariables(api, options.workspaceId, warnings)),
    ...variableEntries(document.variable, "Coleção", warnings),
    ...remoteEnvironment.entries,
  ])
  for (const [name, value] of privateValues) variables.set(name, value)

  await ensureHttpWorkspaceDirectory(root)
  const canonicalRoot = await realpath(root)
  const outputDirectory = await safeImportDirectory(canonicalRoot)
  const savedEnvironment = await saveVariables(
    canonicalRoot,
    selected.name,
    remoteEnvironment.name,
    variables,
    credentialStore,
  )
  try {
    const path = await writeImportedHttpCollection(outputDirectory, `${selected.name}.json`, report)
    let missingIds: number
    try {
      missingIds = await writePostmanProvenance(
        canonicalRoot,
        relative(canonicalRoot, path),
        selected.id,
        document,
        options.workspaceId,
      )
    } catch (error) {
      await rm(path, { force: true })
      await rm(`${path}.postman.json`, { force: true })
      throw error
    }
    if (missingIds) warnings.push(`${missingIds} requests sem ID Postman não podem ser enviadas.`)
    return {
      path: relative(canonicalRoot, path),
      environmentName: savedEnvironment,
      imported: report.requests.length,
      warnings,
    }
  } catch (error) {
    if (savedEnvironment) {
      await deleteGlobalHttpEnvironment(canonicalRoot, savedEnvironment, credentialStore).catch(
        () => {},
      )
    }
    throw error
  }
}
