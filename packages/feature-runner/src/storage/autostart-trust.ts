import { createHash } from "node:crypto"
import { lstatSync, readFileSync, realpathSync } from "node:fs"
import { homedir } from "node:os"
import { join, resolve } from "node:path"
import type { RunnerEnvironmentProfile } from "../model/config"
import { createRunnerPlan, type RunnerFlow } from "../model/plan"
import type { RunnerCommand } from "../model/types"
import { atomicWriteFileSync, fileContentHash } from "@xupon/tuiminal-core/storage/atomic-file"

export const RUNNER_AUTOSTART_TRUST_PATH = join(
  process.env.XDG_CONFIG_HOME?.trim() || join(homedir(), ".config"),
  "tuiminal",
  "runner-autostart-trust.json",
)

type RunnerAutostartTrustFile = {
  version: 1
  approvals: Record<string, string>
}

export type RunnerAutostartReview = {
  root: string
  fingerprint: string
  flows: RunnerFlow[]
  commands: Array<{
    id: string
    label: string
    command: string
    cwd: string
    environmentNames: string[]
    environmentFile: string | null
    interactive: boolean
    policy: string
    profile: string | null
    profileEnvironmentFile: string | null
  }>
  profile: {
    id: string
    label: string
    environmentNames: string[]
    environmentFile: string | null
  } | null
}

function canonicalRoot(root: string) {
  try {
    return realpathSync(root)
  } catch {
    return resolve(root)
  }
}

function sortedEnvironment(environment: Record<string, string> | undefined) {
  return Object.fromEntries(
    Object.entries(environment ?? {}).sort(([left], [right]) => left.localeCompare(right)),
  )
}

function environmentFileFingerprint(path: string | undefined) {
  if (!path) return null
  try {
    return fileContentHash(readFileSync(path, "utf8"))
  } catch {
    return "unreadable"
  }
}
function reviewedEnvironmentProfile(profile: RunnerEnvironmentProfile | undefined) {
  return profile
    ? { ...profile, environmentFileFingerprint: environmentFileFingerprint(profile.envFile) }
    : null
}

export function createRunnerAutostartReview(
  root: string,
  commands: RunnerCommand[],
  profile?: RunnerEnvironmentProfile,
  flows: RunnerFlow[] = [],
  profiles: RunnerEnvironmentProfile[] = [],
): RunnerAutostartReview | null {
  const canonical = canonicalRoot(root)
  const autoFlows = flows.filter((flow) => flow.autostart)
  const nodes = new Map(
    createRunnerPlan(
      commands,
      commands.filter((command) => command.autostart).map((command) => command.id),
    ).map((node) => [node.command.id, node]),
  )
  for (const flow of autoFlows)
    for (const node of createRunnerPlan(commands, [], flow)) nodes.set(node.command.id, node)
  const reviewedCommands = [...nodes.values()]
    .map((node) => node.command)
    .map((command) => ({
      id: command.id,
      label: command.label,
      command: command.displayCommand,
      program: command.program,
      args: command.args,
      dependsOn: nodes.get(command.id)!.dependencies,
      profile: reviewedEnvironmentProfile(profiles.find((item) => item.id === command.profile)),
      cwd: command.workingDirectory ?? canonical,
      environment: sortedEnvironment(command.env),
      environmentFile: command.envFile ?? null,
      environmentFileFingerprint: environmentFileFingerprint(command.envFile),
      interactive: Boolean(command.interactive),
      restartPolicy: command.restartPolicy ?? "never",
      restartDelayMs: command.restartDelayMs ?? 1_000,
      maxRestarts: command.maxRestarts ?? 5,
      persistLogs: Boolean(command.persistLogs),
      healthCheck: command.healthCheck ?? null,
    }))
    .sort((left, right) => left.id.localeCompare(right.id))
  if (!reviewedCommands.length) return null
  const reviewedProfile = profile
    ? {
        id: profile.id,
        label: profile.label,
        environment: sortedEnvironment(profile.env),
        environmentFile: profile.envFile ?? null,
        environmentFileFingerprint: environmentFileFingerprint(profile.envFile),
      }
    : null
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        version: 1,
        root: canonical,
        commands: reviewedCommands,
        profile: reviewedProfile,
        flows: autoFlows,
      }),
    )
    .digest("hex")
  return {
    root: canonical,
    fingerprint,
    flows: autoFlows,
    commands: reviewedCommands.map((command) => ({
      id: command.id,
      label: command.label,
      command: command.command,
      cwd: command.cwd,
      environmentNames: [
        ...new Set([
          ...Object.keys(command.profile?.env ?? {}),
          ...Object.keys(command.environment),
        ]),
      ],
      environmentFile: command.environmentFile,
      interactive: command.interactive,
      profile: command.profile?.label ?? null,
      profileEnvironmentFile: command.profile?.envFile ?? null,
      policy: JSON.stringify({
        restart: command.restartPolicy,
        delay: command.restartDelayMs,
        maxRestarts: command.maxRestarts,
        health: command.healthCheck,
        dependsOn: command.dependsOn,
      }),
    })),
    profile: reviewedProfile
      ? {
          id: reviewedProfile.id,
          label: reviewedProfile.label,
          environmentNames: Object.keys(reviewedProfile.environment),
          environmentFile: reviewedProfile.environmentFile,
        }
      : null,
  }
}

function emptyTrust(): RunnerAutostartTrustFile {
  return { version: 1, approvals: {} }
}

function readTrust(path: string, preserveInvalid = false) {
  try {
    const info = lstatSync(path)
    if (!info.isFile() || info.isSymbolicLink()) {
      throw new Error("O arquivo local de confiança do Runner não é seguro.")
    }
    const source = readFileSync(path, "utf8")
    const parsed = JSON.parse(source) as unknown
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("O arquivo local de confiança do Runner é inválido.")
    }
    const approvals = (parsed as { approvals?: unknown }).approvals
    if (!approvals || typeof approvals !== "object" || Array.isArray(approvals)) {
      throw new Error("O arquivo local de confiança do Runner é inválido.")
    }
    const trust: RunnerAutostartTrustFile = {
      version: 1,
      approvals: Object.fromEntries(
        Object.entries(approvals).filter(
          (entry): entry is [string, string] =>
            typeof entry[1] === "string" && /^[a-f0-9]{64}$/u.test(entry[1]),
        ),
      ),
    }
    return { trust, sourceHash: fileContentHash(source) }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { trust: emptyTrust(), sourceHash: null }
    }
    if (preserveInvalid) throw error
    return { trust: emptyTrust(), sourceHash: null }
  }
}

function writeTrust(path: string, trust: RunnerAutostartTrustFile, expectedHash: string | null) {
  atomicWriteFileSync(path, `${JSON.stringify(trust, null, 2)}\n`, {
    expectedHash,
    mode: 0o600,
    backup: true,
  })
}

export function isRunnerAutostartTrusted(
  review: RunnerAutostartReview,
  path = RUNNER_AUTOSTART_TRUST_PATH,
) {
  return readTrust(path).trust.approvals[review.root] === review.fingerprint
}

export function approveRunnerAutostart(
  review: RunnerAutostartReview,
  path = RUNNER_AUTOSTART_TRUST_PATH,
) {
  const snapshot = readTrust(path, true)
  const trust = snapshot.trust
  trust.approvals[review.root] = review.fingerprint
  writeTrust(path, trust, snapshot.sourceHash)
}
