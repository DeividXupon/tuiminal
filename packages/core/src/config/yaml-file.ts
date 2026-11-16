import { readFileSync } from "node:fs"
import { isMap, parseDocument, type Document } from "yaml"
import { atomicWriteFileSync, fileContentHash } from "../storage/atomic-file"

export type ConfigurationWarning = { file: string; message: string }
export type ConfigurationData = Record<string, unknown>
export type ConfigurationValidator<T> = (data: unknown) => T
type KeyIdentity = (key: string, path: string[]) => string

function isRecord(value: unknown): value is ConfigurationData {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}

function addMissingDefaults(
  document: Document,
  current: ConfigurationData,
  defaults: ConfigurationData,
  path: string[] = [],
  keyIdentity: KeyIdentity = (key) => key,
): boolean {
  let changed = false
  for (const [key, value] of Object.entries(defaults)) {
    const location = [...path, key]
    const present = Object.keys(current).find(
      (candidate) => keyIdentity(candidate, path) === keyIdentity(key, path),
    )
    if (present === undefined) {
      document.setIn(location, value)
      changed = true
    } else if (isRecord(value) && isRecord(current[present])) {
      changed =
        addMissingDefaults(document, current[present], value, [...path, present], keyIdentity) ||
        changed
    }
  }
  return changed
}

function readSource(file: string): string | null {
  try {
    const source = readFileSync(file, "utf8")
    if (Buffer.byteLength(source) > 1024 * 1024) {
      throw new Error("Configuration exceeds the 1 MiB limit")
    }
    return source
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
    throw error
  }
}

function prepareDocument(
  source: string | null,
  defaults: ConfigurationData,
  keyIdentity: KeyIdentity,
) {
  const document: Document = parseDocument(source ?? "", { uniqueKeys: true })
  if (document.errors.length)
    throw new Error(document.errors.map((error) => error.message).join("; "))
  if (document.contents === null) document.contents = document.createNode({})
  if (!isMap(document.contents)) throw new Error("Configuration must be a YAML mapping")
  const current: unknown = document.toJS({ maxAliasCount: 100 })
  if (!isRecord(current)) throw new Error("Configuration must be a YAML mapping")
  const changed = addMissingDefaults(document, current, defaults, [], keyIdentity)
  return { document, changed: changed || source === null }
}

/** Validate before writing: even conflicts introduced by a new default preserve the original. */
export function loadYamlFile<T>(
  file: string,
  defaults: ConfigurationData,
  validate: ConfigurationValidator<T>,
  keyIdentity: KeyIdentity = (key) => key,
): { value: T; warnings: ConfigurationWarning[] } {
  let source: string | null
  let document: Document
  let changed: boolean
  let value: T
  try {
    source = readSource(file)
    const prepared = prepareDocument(source, defaults, keyIdentity)
    document = prepared.document
    changed = prepared.changed
    value = validate(document.toJS({ maxAliasCount: 100 }))
  } catch (error) {
    return {
      value: validate(structuredClone(defaults)),
      warnings: [{ file, message: error instanceof Error ? error.message : String(error) }],
    }
  }
  const warnings: ConfigurationWarning[] = []
  if (changed) {
    try {
      atomicWriteFileSync(file, document.toString(), {
        expectedHash: source === null ? null : fileContentHash(source),
        mode: 0o600,
      })
    } catch (error) {
      warnings.push({ file, message: error instanceof Error ? error.message : String(error) })
    }
  }
  return { value, warnings }
}
