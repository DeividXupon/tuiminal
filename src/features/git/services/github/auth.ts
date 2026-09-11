import type { PullRequestAuthContext } from "../../model/pr/types"
import { type GhTransportOptions, GitHubTransportError, runGhCommand, runGhJson } from "./transport"

export const MINIMUM_GH_VERSION = "2.40.0"

export type GhCapabilities = {
  available: boolean
  version: string | null
  supported: boolean
  reason: "ready" | "missing" | "invalid-version" | "outdated"
}

export class GitHubAuthenticationRequiredError extends GitHubTransportError {
  constructor(
    readonly host: string,
    message: string,
  ) {
    super("not-authenticated", message)
    this.name = "GitHubAuthenticationRequiredError"
  }
}

function versionParts(version: string) {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)/)
  return match ? match.slice(1).map(Number) : null
}

export function ghVersionIsSupported(version: string, minimum = MINIMUM_GH_VERSION) {
  const current = versionParts(version)
  const required = versionParts(minimum)
  if (!current || !required) return false
  for (let index = 0; index < 3; index += 1) {
    if ((current[index] ?? 0) > (required[index] ?? 0)) return true
    if ((current[index] ?? 0) < (required[index] ?? 0)) return false
  }
  return true
}

export function parseGhVersion(output: string) {
  return output.match(/gh version (\d+\.\d+\.\d+)/i)?.[1] ?? null
}

export async function detectGhCapabilities(
  options: GhTransportOptions = {},
): Promise<GhCapabilities> {
  try {
    const result = await runGhCommand({ args: ["--version"] }, options)
    const version = parseGhVersion(result.stdout)
    if (!version)
      return { available: true, version: null, supported: false, reason: "invalid-version" }
    const supported = ghVersionIsSupported(version)
    return { available: true, version, supported, reason: supported ? "ready" : "outdated" }
  } catch (error) {
    if (error instanceof GitHubTransportError && error.kind === "not-found") {
      return { available: false, version: null, supported: false, reason: "missing" }
    }
    throw error
  }
}

function isViewer(value: unknown): value is { login: string; node_id: string } {
  if (!value || typeof value !== "object") return false
  const viewer = value as Record<string, unknown>
  return typeof viewer.login === "string" && typeof viewer.node_id === "string"
}

export async function loadGhAuthContext({
  host,
  generation,
  options = {},
}: {
  host: string
  generation: number
  options?: GhTransportOptions
}): Promise<PullRequestAuthContext> {
  let viewer: { login: string; node_id: string }
  try {
    viewer = await runGhJson(
      { args: ["api", "--hostname", host, "user"] },
      { ...options, host, validate: isViewer },
    )
  } catch (error) {
    if (error instanceof GitHubTransportError && error.kind === "not-authenticated") {
      throw new GitHubAuthenticationRequiredError(host, error.message)
    }
    throw error
  }
  return {
    host,
    viewerId: viewer.node_id,
    viewerLogin: viewer.login,
    generation,
  }
}
