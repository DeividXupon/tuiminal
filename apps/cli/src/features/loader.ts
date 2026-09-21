import { fileURLToPath } from "node:url"
import { featureEnvironment, FEATURE_VERSION } from "./environment"
import { MINIMAL_BUILD, sourceFeaturesEnabled } from "./mode"
import { FeatureInstallError, type FeatureId } from "./model"
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

async function prepareHost() {
  const { prepareFeatureHost } = await import("./host-modules")
  prepareFeatureHost(FEATURE_VERSION, sqliteWorkerCommand, terminalSidebarCommand)
}

async function loadEntry(id: FeatureId, name: string, withHost = true) {
  const environment = await featureEnvironment()
  const artifact = environment.catalog.artifacts.find((entry) => entry.id === id)
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
  return importVerifiedFeature(bytes)
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
