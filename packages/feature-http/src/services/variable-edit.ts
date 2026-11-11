import type { HttpRequestDefinition } from "../model/types"
import type { HttpVariableSuggestion } from "../model/variable-completion"
import type { useHttpProject } from "../hooks/use-http-project"
import type { LivePostmanSession } from "../postman/live-session"
import { httpEnvironmentEditor } from "./environment-editor"
import { postmanCollectionSettings } from "../postman/collection-settings"
import { localEnvironmentVariableEditor } from "../storage/environment-variable"
import { localCollectionVariableEditor } from "../storage/collection-variable"

export type HttpVariableSave = (value: string) => Promise<void>
export type HttpVariableEditContext = {
  project: ReturnType<typeof useHttpProject>
  session: LivePostmanSession | null
  request: HttpRequestDefinition
  onCollectionSave?: (path: string, beforeHash: string, sourceHash: string) => void
}
/** Capture the scope when the tooltip opens, never redirect an edit after a switch. */
export async function prepareHttpVariableEdit(
  { project, session, request, onCollectionSave }: HttpVariableEditContext,
  variable: HttpVariableSuggestion,
): Promise<HttpVariableSave> {
  if (variable.scope === "collection") {
    if (request.source.kind !== "file") throw Error("Variável não encontrada.")
    const path = request.source.path
    if (!session)
      return localCollectionVariableEditor(
        project.project.root,
        path,
        variable.name,
        project.refresh,
        onCollectionSave,
      )
    const collection = session.collection(path)
    const target = {
      id: collection.selected.id,
      path,
      name: collection.selected.name,
      kind: "file" as const,
    }
    const editor = postmanCollectionSettings(session)
    const data = await editor.read(target)
    return async (value) => {
      const variables = data.variables.map((row) =>
        row.name === variable.name ? { ...row, value } : row,
      )
      if (!data.variables.some((row) => row.name === variable.name))
        throw Error("Variável não encontrada.")
      await editor.save({
        ...data,
        variables,
        target,
        id: "variable-tooltip",
        tab: "variables",
        revision: 1,
        savedRevision: 0,
        loading: false,
      })
    }
  }
  if (variable.scope !== "environment" && variable.scope !== "global")
    throw Error("Variável somente leitura.")
  const key =
    variable.scope === "global"
      ? "@globals"
      : (session?.environmentId ?? project.activeEnvironmentName)
  if (!key) throw Error("Variável não encontrada.")
  if (!session)
    return localEnvironmentVariableEditor(project.project.root, key, variable.name, project.refresh)
  const editor = httpEnvironmentEditor(project, session)
  const data = await editor.read(key)
  return async (value) => {
    if (!data.rows.some((row) => row.name === variable.name))
      throw Error("Variável não encontrada.")
    const rows = data.rows.map((row) => (row.name === variable.name ? { ...row, value } : row))
    // A failed confirmation can be retried without replaying an accepted write.
    const current = await editor.read(key)
    const confirmed = current.rows.find((row) => row.name === variable.name)?.value === value
    if (!confirmed)
      await editor.save({
        ...data,
        rows,
        key,
        id: "variable-tooltip",
        scope: "inline",
        fresh: false,
        revision: 1,
        savedRevision: 0,
        loading: false,
      })
    const after = await editor.read(key)
    if (after.rows.find((row) => row.name === variable.name)?.value !== value)
      throw Error("O salvamento da variável não foi confirmado.")
    const values = after.rows.map((row) => ({ ...row.metadata, key: row.name, value: row.value }))
    if (key === "@globals") session.setGlobals(values)
    else if (session.environmentId === key) session.setEnvironment(key, after.name, values)
  }
}
