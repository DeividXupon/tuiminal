import { fileURLToPath } from "node:url"
import { featureEnvironment, FEATURE_VERSION } from "./environment"
import { MINIMAL_BUILD, sourceFeaturesEnabled } from "./mode"
import {
  FeatureInstallError,
  parseFeatureArtifact,
  type FeatureArtifact,
  type FeatureId,
} from "./model"
import { loadedFeature, registerFeature, type FeatureModules } from "./registry"

export async function importVerifiedFeature(bytes: Uint8Array): Promise<Record<string, unknown>> {
  // Import the verified snapshot, not a path that could change after verification.
  const url = URL.createObjectURL(new Blob([Buffer.from(bytes)], { type: "text/javascript" }))
  try {
    return await import(url)
  } finally {
    URL.revokeObjectURL(url)
  }
}

function sqliteWorkerCommand() {
  return MINIMAL_BUILD
    ? [process.execPath, "--internal-sqlite-worker"]
    : [
        process.execPath,
        fileURLToPath(new URL("../../bin/tuiminal.ts", import.meta.url)),
        "--internal-sqlite-worker",
      ]
}

function terminalSidebarCommand(args: string[]) {
  return MINIMAL_BUILD
    ? [process.execPath, "--internal-terminal-sidebar", ...args]
    : [
        process.execPath,
        fileURLToPath(new URL("../../bin/tuiminal.ts", import.meta.url)),
        "--internal-terminal-sidebar",
        ...args,
      ]
}

// Helpers run the payload snapshot the host loaded, even after a dev catalog rebuild.
const loadedArtifacts = new Map<FeatureId, FeatureArtifact>()

function pinnedArtifactArguments(id: FeatureId) {
  const artifact = loadedArtifacts.get(id)
  return artifact ? [JSON.stringify(artifact)] : []
}

function terminalProjectSyncWorkerCommand() {
  return MINIMAL_BUILD
    ? [
        process.execPath,
        "--internal-terminal-project-sync-worker",
        ...pinnedArtifactArguments("terminal"),
      ]
    : [
        process.execPath,
        fileURLToPath(new URL("../../bin/tuiminal.ts", import.meta.url)),
        "--internal-terminal-project-sync-worker",
        ...pinnedArtifactArguments("terminal"),
      ]
}

async function prepareHost() {
  const { prepareFeatureHost } = await import("./host-modules")
  prepareFeatureHost(
    FEATURE_VERSION,
    sqliteWorkerCommand,
    terminalSidebarCommand,
    terminalProjectSyncWorkerCommand,
  )
}

function entryArtifact(
  catalogArtifact: FeatureArtifact | undefined,
  pinned: FeatureArtifact | undefined,
) {
  if (!pinned || pinned.sha256 === catalogArtifact?.sha256) return catalogArtifact
  // Release catalogs are embedded, so only a local dev rebuild can diverge from the host.
  if (MINIMAL_BUILD)
    throw new FeatureInstallError("catalog", "Pinned feature is not in the catalog")
  return pinned
}

async function loadEntry(id: FeatureId, name: string, withHost = true, pinned?: FeatureArtifact) {
  const environment = await featureEnvironment()
  const artifact = entryArtifact(
    environment.catalog.artifacts.find((entry) => entry.id === id),
    pinned,
  )
  if (!artifact) throw new FeatureInstallError("catalog", "Official feature is not in the catalog")
  let files: Map<string, Buffer>
  try {
    files = await environment.store.read(artifact)
  } catch {
    throw new FeatureInstallError(
      "missing",
      `Feature ${id} is not installed. Run: tuiminal features install ${id}`,
    )
  }
  if (withHost) {
    await prepareHost()
  }
  const bytes = files.get(name)
  if (!bytes) throw new FeatureInstallError("integrity", "Official feature entry is missing")
  const module = await importVerifiedFeature(bytes)
  if (name === "index.mjs") loadedArtifacts.set(id, artifact)
  return module
}
const pending = new Map<FeatureId, Promise<void>>()
export async function loadFeature(id: FeatureId) {
  if (loadedFeature(id)) return
  const current = pending.get(id)
  if (current) return current
  const load = (async () => {
    if (sourceFeaturesEnabled()) {
      await prepareHost()
      return (await import("./source-loader")).loadSourceFeature(id)
    }
    const module = await loadEntry(id, "index.mjs")
    registerFeature(id, module as FeatureModules[typeof id])
  })()
  pending.set(id, load)
  try {
    await load
  } finally {
    if (pending.get(id) === load) pending.delete(id)
  }
}
export async function runInstalledHttp(command: "run" | "import" | "postman", args: string[]) {
  if (sourceFeaturesEnabled())
    return (await import("./source-loader")).sourceHttpCommand(command, args)
  const module = await loadEntry("http", `http-${command}.mjs`)
  const run = module[
    command === "run"
      ? "runHttpHeadless"
      : command === "import"
        ? "importHttpCollectionCli"
        : "postmanCli"
  ] as (args: string[]) => Promise<number>
  return run(args)
}
export async function runInstalledSqliteWorker() {
  if (typeof process.send !== "function") throw new Error("SQLite worker requires an IPC channel")
  await loadEntry("database", "sqlite-worker.mjs", false)
}

export async function runInstalledTerminalSidebar(args: string[]) {
  if (sourceFeaturesEnabled()) return (await import("./source-loader")).sourceTerminalSidebar(args)
  const module = await loadEntry("terminal", "terminal-sidebar.mjs")
  return (module.runTerminalSidebarCli as (args: string[]) => Promise<number>)(args)
}

function parsePinnedArtifact(id: FeatureId, value: string | undefined) {
  if (value === undefined) return undefined
  const artifact = parseFeatureArtifact(JSON.parse(value), FEATURE_VERSION)
  if (artifact.id !== id) throw new FeatureInstallError("catalog", "Invalid pinned feature")
  return artifact
}

export async function runInstalledTerminalProjectSyncWorker(args: string[] = []) {
  if (typeof process.send !== "function")
    throw new Error("Terminal project sync worker requires an IPC channel")
  if (sourceFeaturesEnabled())
    return (await import("./source-loader")).sourceTerminalProjectSyncWorker()
  await loadEntry(
    "terminal",
    "project-sync-worker.mjs",
    true,
    parsePinnedArtifact("terminal", args[0]),
  )
}
