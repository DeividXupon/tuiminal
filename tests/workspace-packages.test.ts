import { describe, expect, test } from "bun:test"
import {
  assertWorkspaceVersions,
  distributionManifest,
  internalWorkspaces,
  type WorkspaceManifest,
} from "../scripts/workspace-model"

const version = "1.2.3-pre-alpha.0"
const manifest: WorkspaceManifest = {
  name: "@xupon/tuiminal-feature-example",
  version,
  private: true,
  license: "Apache-2.0",
  repository: {
    type: "git",
    url: "git+https://github.com/DeividXupon/tuiminal.git",
    directory: "packages/feature-example",
  },
  exports: { ".": "./src/index.ts", "./view": "./src/View.tsx" },
  dependencies: { "@xupon/tuiminal-core": "workspace:*", yaml: "^2.9.0" },
  peerDependencies: { react: "^19.2.8", "@xupon/tuiminal-core": "workspace:*" },
  devDependencies: { typescript: "6.0.3" },
  scripts: { build: "development-only" },
}

describe("internal workspace packages", () => {
  test("distribution exports compiled code and types without publishing development hooks", () => {
    const output = distributionManifest(manifest)
    expect(output.exports["."]).toEqual({ types: "./dist/index.d.ts", default: "./dist/index.js" })
    expect(output.exports["./view"]).toEqual({
      types: "./dist/View.d.ts",
      default: "./dist/View.js",
    })
    expect(output.dependencies).toEqual({ "@xupon/tuiminal-core": version, yaml: "^2.9.0" })
    expect(output.peerDependencies).toEqual({ react: "^19.2.8", "@xupon/tuiminal-core": version })
    expect(output.repository).toEqual(manifest.repository)
    for (const key of ["private", "scripts", "devDependencies"])
      expect(output).not.toHaveProperty(key)
    expect(manifest.private).toBe(true)
    expect(manifest.dependencies?.["@xupon/tuiminal-core"]).toBe("workspace:*")
  })

  test("rejects version drift and loose internal compatibility ranges", () => {
    const core = { ...manifest, name: "@xupon/tuiminal-core", dependencies: {} }
    const coreWorkspace = { directory: "packages/core", manifest: core }
    const packages = [coreWorkspace, { directory: "packages/feature-example", manifest }]
    expect(() => assertWorkspaceVersions(packages, version)).not.toThrow()
    expect(() => assertWorkspaceVersions(packages, "1.2.4")).toThrow("version must match")
    for (const kind of ["dependencies", "peerDependencies", "devDependencies"] as const) {
      const invalid = { ...manifest, [kind]: { "@xupon/tuiminal-core": "^1.2.3" } }
      expect(() =>
        assertWorkspaceVersions(
          [coreWorkspace, { directory: "example", manifest: invalid }],
          version,
        ),
      ).toThrow("must use workspace:* or exact version")
    }
  })

  test("all internal source packages remain private and match the application version", () => {
    const workspaces = assertWorkspaceVersions()
    expect(workspaces).toHaveLength(7)
    expect(workspaces.every(({ manifest }) => manifest.private)).toBe(true)
    expect(internalWorkspaces().map(({ directory }) => directory)).toContain("apps/cli")
  })
})
