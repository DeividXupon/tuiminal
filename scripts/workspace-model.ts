import { readFileSync, readdirSync } from "node:fs"
import { join, resolve } from "node:path"

export const workspaceRoot = resolve(import.meta.dir, "..")
export type WorkspaceManifest = {
  name: string
  version: string
  private?: boolean
  license: string
  repository: { type: string; url: string; directory: string }
  exports?: Record<string, string>
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  files?: string[]
  scripts?: Record<string, string>
}

export function readWorkspaceManifest(directory: string): WorkspaceManifest {
  return JSON.parse(readFileSync(join(directory, "package.json"), "utf8")) as WorkspaceManifest
}

export function internalWorkspaces() {
  return [
    "apps/cli",
    ...readdirSync(join(workspaceRoot, "packages"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => `packages/${entry.name}`),
  ]
    .sort()
    .map((directory) => ({
      directory,
      manifest: readWorkspaceManifest(join(workspaceRoot, directory)),
    }))
}

export function assertWorkspaceVersions(
  workspaces = internalWorkspaces(),
  version = readWorkspaceManifest(workspaceRoot).version,
) {
  const versions = new Map(workspaces.map(({ manifest }) => [manifest.name, manifest.version]))
  for (const { directory, manifest } of workspaces) {
    if (manifest.version !== version) throw new Error(`${directory}: version must match ${version}`)
    for (const dependencies of [
      manifest.dependencies,
      manifest.devDependencies,
      manifest.peerDependencies,
    ]) {
      for (const [name, range] of Object.entries(dependencies ?? {})) {
        if (!versions.has(name)) continue
        if (range !== "workspace:*" && range !== version) {
          throw new Error(`${directory}: ${name} must use workspace:* or exact version ${version}`)
        }
      }
    }
  }
  return workspaces
}

export function distributionManifest(manifest: WorkspaceManifest) {
  const {
    private: _private,
    devDependencies: _development,
    scripts: _scripts,
    ...published
  } = manifest
  const resolveVersions = (dependencies: Record<string, string> = {}) =>
    Object.fromEntries(
      Object.entries(dependencies).map(([name, range]) => [
        name,
        range === "workspace:*" ? manifest.version : range,
      ]),
    )
  return {
    ...published,
    exports: Object.fromEntries(
      Object.entries(manifest.exports ?? {}).map(([name, source]) => {
        const output = source.replace(/^\.\/src\//, "./dist/").replace(/\.tsx?$/, ".js")
        return [name, { types: output.replace(/\.js$/, ".d.ts"), default: output }]
      }),
    ),
    dependencies: resolveVersions(manifest.dependencies),
    peerDependencies: resolveVersions(manifest.peerDependencies),
  }
}
