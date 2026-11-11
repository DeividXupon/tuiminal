import type {
  HttpEnvironmentDocument,
  HttpEnvironmentVariable,
} from "../model/environment-documents"
import type { HttpEnvironment } from "../storage/environments"
import type { useHttpProject } from "../hooks/use-http-project"
import type { LivePostmanSession } from "../postman/live-session"
import type { PostmanVariable } from "../postman/api"
import { saveHttpLastWorkspace } from "../storage/last-workspace"

export type HttpEnvironmentEntry = { key: string; name: string }
export type HttpEnvironmentData = {
  name: string
  rows: HttpEnvironmentVariable[]
  baseline: string
}
export function environmentData(
  name: string,
  rows: HttpEnvironmentVariable[],
): HttpEnvironmentData {
  return {
    name,
    rows,
    baseline: JSON.stringify(
      [
        name,
        rows.map(({ name, value, metadata }) => [
          name,
          value,
          metadata ? { ...metadata, enabled: metadata.enabled !== false } : undefined,
        ]),
      ],
      // API object-field order is not a change; retain every metadata value.
      (_key, value) =>
        value && typeof value === "object" && !Array.isArray(value)
          ? Object.fromEntries(
              Object.entries(value).sort(([left], [right]) => left.localeCompare(right)),
            )
          : value,
    ),
  }
}
function localData(environment: HttpEnvironment | undefined, name: string) {
  return environmentData(
    name,
    Object.entries(environment?.values ?? {}).map(([key, variable], index) => ({
      id: String(index),
      name: key,
      value: variable,
    })),
  )
}
function remoteData(name: string, values: PostmanVariable[]) {
  return environmentData(
    name,
    values.map((variable, index) => ({
      id: String(index),
      name: variable.key,
      value: variable.value ?? "",
      metadata: { ...variable },
    })),
  )
}
function variables(document: Pick<HttpEnvironmentDocument, "rows">): PostmanVariable[] {
  return document.rows
    .filter((row) => row.name.trim() || row.value)
    .map((row) => ({
      ...row.metadata,
      key: row.name.trim(),
      value: row.value,
      enabled: row.metadata?.enabled !== false,
    }))
}

/** A workspace-bound adapter; values never leave memory except an explicit save. */
export function httpEnvironmentEditor(
  project: ReturnType<typeof useHttpProject>,
  session: LivePostmanSession | null,
) {
  async function list(): Promise<HttpEnvironmentEntry[]> {
    if (!session)
      return project.environments.map((entry) => ({ key: entry.name, name: entry.name }))
    const entries = await session.api.environments(session.workspaceId)
    session.assertActive()
    return entries.map((entry) => ({ key: entry.uid ?? entry.id, name: entry.name }))
  }
  async function read(key: string): Promise<HttpEnvironmentData> {
    if (!session)
      return localData(
        key === "@globals"
          ? project.globals
          : project.environments.find((entry) => entry.name === key),
        key === "@globals" ? "Global" : key,
      )
    session.assertActive()
    if (key === "@globals")
      return remoteData("Global", await session.api.globals(session.workspaceId))
    if (!(await list()).some((entry) => entry.key === key))
      throw new Error("Ambiente não encontrado neste workspace Postman.")
    const remote = await session.api.environment(key)
    session.assertActive()
    return remoteData(remote.name, remote.values)
  }
  async function save(document: HttpEnvironmentDocument) {
    const values = variables(document)
    if (!document.name.trim()) throw new Error("Informe um nome de ambiente válido.")
    if (values.some((item) => !item.key)) throw new Error("Informe um nome de variável válido.")
    if (new Set(values.map((item) => item.key)).size !== values.length)
      throw new Error("Há variáveis duplicadas no ambiente.")
    if (!session) {
      const input = {
        environmentName: document.name,
        variables: values.map((item) => ({ name: item.key, value: item.value ?? "" })),
      }
      if (document.key === "@globals") await project.saveGlobals(input)
      else if (document.fresh) await project.createEnvironment(input)
      else await project.replaceEnvironment(document.key, input)
      return document.key === "@globals" ? "@globals" : document.name.trim()
    }
    return session.mutate(async () => {
      if (!document.fresh && (await read(document.key)).baseline !== document.baseline)
        throw new Error(
          "O ambiente mudou. Feche a aba e abra novamente para carregar a versão atual.",
        )
      session.assertActive()
      let key = document.key
      if (key === "@globals" && session.api.saveGlobals) {
        await session.api.saveGlobals(session.workspaceId, values)
        session.setGlobals(values)
      } else if (document.fresh && session.api.createEnvironment) {
        key = await session.api.createEnvironment(session.workspaceId, document.name.trim(), values)
      } else if (session.api.saveEnvironment) {
        await session.api.saveEnvironment(key, document.name.trim(), values)
        if (session.environmentId === key) session.setEnvironment(key, document.name.trim(), values)
      } else throw new Error("Operação de ambiente indisponível.")
      session.assertActive()
      return key
    })
  }
  async function select(key: string | null) {
    if (!session) return project.selectEnvironment(key)
    const data = key ? await read(key) : null
    session.setEnvironment(
      key ?? undefined,
      data?.name ?? null,
      data ? variables({ rows: data.rows }) : [],
    )
    saveHttpLastWorkspace({
      source: "postman",
      workspaceId: session.workspaceId,
      ...(key ? { environmentId: key } : {}),
    })
  }
  async function remove(document: HttpEnvironmentDocument) {
    if (document.key === "@globals") return
    if (!session) {
      await project.deleteEnvironment(document.key)
      return
    }
    await session.mutate(async () => {
      if ((await read(document.key)).baseline !== document.baseline)
        throw new Error(
          "O ambiente mudou. Feche a aba e abra novamente para carregar a versão atual.",
        )
      if (!session.api.deleteEnvironment) throw new Error("Operação de ambiente indisponível.")
      session.assertActive()
      await session.api.deleteEnvironment(document.key)
      if (session.environmentId === document.key) await select(null)
    })
  }
  return { list, read, save, select, remove }
}
