import { postmanAuth } from "../importing/postman"
import { postmanScripts } from "../importing/postman-scripts"
import { record } from "../importing/shared"
import type {
  HttpCollectionSettingsData,
  HttpCollectionSettingsDocument,
  HttpCollectionSettingsTarget,
} from "../model/collection-settings"
import { remoteAuth } from "./sync"
import { livePostmanCollection } from "./live-view"
import type { LivePostmanSession } from "./live-session"

type Json = Record<string, unknown>
export const COLLECTION_SETTINGS_CONFLICT =
  "As configurações mudaram no Postman. Suas alterações continuam abertas."
export const COLLECTION_SETTINGS_UNCONFIRMED =
  "O Postman não confirmou as configurações. Suas alterações continuam abertas."

export function postmanSettingsNode(collection: Json, folderId?: string): Json {
  if (!folderId) return collection
  const visit = (items: unknown): Json | undefined => {
    if (!Array.isArray(items)) return
    for (const raw of items) {
      const item = record(raw)
      if (!item || !Array.isArray(item.item)) continue
      if (item.id === folderId) return item
      const nested = visit(item.item)
      if (nested) return nested
    }
    return undefined
  }
  const node = visit(collection.item)
  if (!node) throw new Error("A pasta não existe mais no Postman.")
  return node
}

export function postmanSettingsData(node: Json, folder: boolean): HttpCollectionSettingsData {
  const warnings: string[] = []
  const auth = postmanAuth(node.auth, warnings, "")
  return {
    auth:
      !node.auth && folder
        ? { kind: "inherit" }
        : warnings.length
          ? { kind: "unsupported", type: String(record(node.auth)?.type ?? "") }
          : auth,
    scripts: postmanScripts(node, {}),
    variables: (Array.isArray(node.variable) ? node.variable : []).map((value, index) => {
      const variable = record(value) ?? {}
      return {
        id: String(index),
        name: String(variable.key ?? ""),
        value: String(variable.value ?? ""),
        enabled: variable.disabled !== true && variable.enabled !== false,
        metadata: variable,
      }
    }),
  }
}

function settingsBaseline(node: Json) {
  return JSON.stringify({
    auth: node.auth ?? null,
    event: node.event ?? [],
    variable: node.variable ?? [],
  })
}
function data(node: Json, folder: boolean) {
  return { ...postmanSettingsData(node, folder), baseline: settingsBaseline(node) }
}

function updatedEvents(
  node: Json,
  before: HttpCollectionSettingsData,
  desired: HttpCollectionSettingsData,
) {
  let events = (Array.isArray(node.event) ? structuredClone(node.event) : []) as Json[]
  for (const [phase, listen] of [
    ["preRequest", "prerequest"],
    ["postResponse", "test"],
  ] as const) {
    if (before.scripts[phase] === desired.scripts[phase]) continue
    const original = events.find((event) => event.listen === listen && event.disabled !== true)
    // Preserve disabled events and all unrelated event/script metadata.
    events = events.filter((event) => event.listen !== listen || event.disabled === true)
    events.push({
      ...original,
      listen,
      script: {
        ...record(original?.script),
        type: "text/javascript",
        exec: desired.scripts[phase].split("\n"),
      },
    })
  }
  return events
}

function settingsChanges(doc: HttpCollectionSettingsDocument) {
  const baseline = JSON.parse(doc.baseline) as Json
  const before = postmanSettingsData(baseline, Boolean(doc.target.folderId))
  const changes: Json = {}
  if (JSON.stringify(before.auth) !== JSON.stringify(doc.auth)) {
    if (doc.auth.kind === "unsupported") throw new Error("Autenticação não suportada.")
    changes.auth =
      doc.auth.kind === "inherit"
        ? null
        : doc.auth.kind === "none"
          ? { type: "noauth" }
          : remoteAuth(doc.auth)
  }
  if (JSON.stringify(before.scripts) !== JSON.stringify(doc.scripts))
    changes.event = updatedEvents(baseline, before, doc)
  const values = doc.variables.map(settingsVariable)
  if (!doc.target.folderId && JSON.stringify(values) !== JSON.stringify(baseline.variable)) {
    if (values.some((row) => !row.key.trim()))
      throw new Error("Informe um nome de variável válido.")
    changes.variable = values
  }
  return { baseline, changes }
}

/** Reads and writes only the owned API session; no local collection copies. */
export function postmanCollectionSettings(session: LivePostmanSession) {
  async function read(target: HttpCollectionSettingsTarget) {
    const current = session.collection(target.path)
    const collection = await session.fetchCollection(current.selected)
    session.assertActive()
    return data(postmanSettingsNode(collection.document, target.folderId), Boolean(target.folderId))
  }
  async function save(doc: HttpCollectionSettingsDocument) {
    return session.mutate(async () => {
      if (!session.api.replaceCollection) throw new Error("Salvamento da coleção indisponível.")
      const selected = session.collection(doc.target.path).selected
      const id = selected.uid ?? selected.id
      const latest = await session.api.collection(id)
      session.assertActive()
      const node = postmanSettingsNode(latest, doc.target.folderId)
      const { baseline, changes } = settingsChanges(doc)
      const current = JSON.parse(settingsBaseline(node)) as Json
      const edited = Object.keys(changes)
      const desired = { ...baseline, ...changes }
      const folder = Boolean(doc.target.folderId)
      assertSettingsUnchanged(current, baseline, changes, folder)
      // A retry after an accepted but unconfirmed write only confirms it.
      if (edited.some((key) => !settingsFieldEqual(current, desired, key, folder))) {
        Object.assign(node, changes)
        session.assertActive()
        await session.api.replaceCollection(id, latest)
      }
      const confirmed = await session.api.collection(id)
      session.assertActive()
      const result = data(
        postmanSettingsNode(confirmed, doc.target.folderId),
        Boolean(doc.target.folderId),
      )
      assertSettingsConfirmed(
        baseline,
        changes,
        postmanSettingsNode(confirmed, doc.target.folderId),
        Boolean(doc.target.folderId),
      )
      session.install(livePostmanCollection(selected, confirmed))
      return result
    })
  }
  return { read, save }
}

function settingsVariable(row: HttpCollectionSettingsData["variables"][number]) {
  const original = row.metadata ?? {}
  return {
    ...original,
    key: row.name,
    value: String(original.value ?? "") === row.value ? (original.value ?? "") : row.value,
    ...(row.enabled === (original.disabled !== true && original.enabled !== false)
      ? {}
      : {
          disabled: !row.enabled,
          ...(Object.hasOwn(original, "enabled") ? { enabled: row.enabled } : {}),
        }),
  }
}

function assertSettingsUnchanged(current: Json, baseline: Json, changes: Json, folder: boolean) {
  const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
  const edited = Object.keys(changes)
  for (const key of edited) {
    if (
      !equal(current[key], baseline[key]) &&
      !settingsFieldEqual(current, { ...baseline, ...changes }, key, folder)
    )
      throw new Error(COLLECTION_SETTINGS_CONFLICT)
  }
}

function settingsFieldEqual(left: Json, right: Json, key: string, folder: boolean) {
  const field = key === "event" ? "scripts" : key === "variable" ? "variables" : "auth"
  const normalize = (node: Json) => {
    const decoded = postmanSettingsData(node, folder)
    return field === "variables"
      ? decoded.variables.map(({ name, value, enabled }) => ({ name, value, enabled }))
      : decoded[field]
  }
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right))
}
function assertSettingsConfirmed(baseline: Json, changes: Json, confirmed: Json, folder: boolean) {
  const expected = { ...baseline, ...changes }
  if (Object.keys(changes).some((key) => !settingsFieldEqual(confirmed, expected, key, folder)))
    throw new Error(COLLECTION_SETTINGS_UNCONFIRMED)
}
