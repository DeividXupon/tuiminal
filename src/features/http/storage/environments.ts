import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { createHttpVariableContext } from "../model/variables"

export type HttpEnvironment = {
  name: string
  values: Record<string, string>
  privateNames: Set<string>
  production: boolean
}

type EnvironmentFile = Record<string, Record<string, unknown>>

async function readEnvironmentFile(path: string): Promise<EnvironmentFile> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8"))
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {}
    return parsed as EnvironmentFile
  } catch {
    return {}
  }
}

function stringValues(source: Record<string, unknown> | undefined) {
  return Object.fromEntries(
    Object.entries(source ?? {}).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  )
}

export async function loadHttpEnvironments(root: string): Promise<HttpEnvironment[]> {
  const [publicFile, privateFile] = await Promise.all([
    readEnvironmentFile(resolve(root, "http-client.env.json")),
    readEnvironmentFile(resolve(root, "http-client.private.env.json")),
  ])
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
