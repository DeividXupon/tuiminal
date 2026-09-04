import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { httpHeaderSensitivity } from "../model/key-value"
import type { HttpRequestDefinition } from "../model/types"

export type HttpWorkspaceConfig = {
  version: 1
  defaultEnvironment?: string
  headers: Record<string, string>
  options: { timeoutMs?: number; followRedirects?: boolean }
  history: { persistMetadata: boolean; persistBodies: boolean }
}

export const DEFAULT_HTTP_WORKSPACE_CONFIG: HttpWorkspaceConfig = {
  version: 1,
  headers: {},
  options: {},
  history: { persistMetadata: false, persistBodies: false },
}

export function parseHttpWorkspaceConfig(value: unknown): HttpWorkspaceConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return DEFAULT_HTTP_WORKSPACE_CONFIG
  }
  const input = value as Record<string, unknown>
  if (input.version !== 1) return DEFAULT_HTTP_WORKSPACE_CONFIG
  const rawHeaders =
    input.headers && typeof input.headers === "object" && !Array.isArray(input.headers)
      ? (input.headers as Record<string, unknown>)
      : {}
  const headers = Object.fromEntries(
    Object.entries(rawHeaders).filter(
      (entry): entry is [string, string] =>
        typeof entry[1] === "string" && httpHeaderSensitivity(entry[0]) === "normal",
    ),
  )
  const rawOptions =
    input.options && typeof input.options === "object" && !Array.isArray(input.options)
      ? (input.options as Record<string, unknown>)
      : {}
  const rawHistory =
    input.history && typeof input.history === "object" && !Array.isArray(input.history)
      ? (input.history as Record<string, unknown>)
      : {}
  return {
    version: 1,
    ...(typeof input.defaultEnvironment === "string"
      ? { defaultEnvironment: input.defaultEnvironment }
      : {}),
    headers,
    options: {
      ...(typeof rawOptions.timeoutMs === "number" ? { timeoutMs: rawOptions.timeoutMs } : {}),
      ...(typeof rawOptions.followRedirects === "boolean"
        ? { followRedirects: rawOptions.followRedirects }
        : {}),
    },
    history: {
      persistMetadata: rawHistory.persistMetadata === true,
      persistBodies: rawHistory.persistBodies === true,
    },
  }
}

export async function loadHttpWorkspaceConfig(root: string) {
  try {
    return parseHttpWorkspaceConfig(
      JSON.parse(await readFile(resolve(root, ".tuiminal/http/config.json"), "utf8")),
    )
  } catch {
    return DEFAULT_HTTP_WORKSPACE_CONFIG
  }
}

export function applyHttpWorkspaceConfig(
  request: HttpRequestDefinition,
  config: HttpWorkspaceConfig,
): HttpRequestDefinition {
  const explicitNames = new Set(request.headers.map((header) => header.name.toLowerCase()))
  const inherited = Object.entries(config.headers)
    .filter(([name]) => !explicitNames.has(name.toLowerCase()))
    .map(([name, value], index) => ({
      id: `${request.id}-workspace-header-${index}`,
      enabled: true,
      name,
      value,
      sensitivity: "normal" as const,
    }))
  return {
    ...request,
    headers: [...request.headers, ...inherited],
    options: {
      timeoutMs: config.options.timeoutMs ?? request.options.timeoutMs,
      followRedirects: config.options.followRedirects ?? request.options.followRedirects,
    },
  }
}
