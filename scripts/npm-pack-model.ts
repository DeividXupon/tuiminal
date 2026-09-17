export interface NpmPackResult {
  name: string
  version: string
  filename: string
  integrity: string
  files: Array<{ path: string }>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function parseNpmPackResult(
  source: string,
  expected: { name: string; version: string },
): NpmPackResult {
  const result: unknown = JSON.parse(source)
  // npm 12 keys results by package name; earlier npm versions return an array.
  const entries = Array.isArray(result)
    ? result
    : isRecord(result) && Object.keys(result).length === 1 && Object.hasOwn(result, expected.name)
      ? [result[expected.name]]
      : []
  const entry: unknown = entries[0]
  const filename = `${expected.name.replace(/^@/, "").replace("/", "-")}-${expected.version}.tgz`
  if (
    entries.length !== 1 ||
    !isRecord(entry) ||
    entry.name !== expected.name ||
    entry.version !== expected.version ||
    entry.filename !== filename ||
    !/^[a-zA-Z0-9.-]+\.tgz$/.test(filename) ||
    typeof entry.integrity !== "string" ||
    !/^sha512-[A-Za-z0-9+/]{86}==$/.test(entry.integrity) ||
    !Array.isArray(entry.files) ||
    entry.files.length === 0 ||
    entry.files.some((file) => !isRecord(file) || typeof file.path !== "string")
  )
    throw new Error(`Unexpected npm pack result for ${expected.name}@${expected.version}`)
  return entry as unknown as NpmPackResult
}
