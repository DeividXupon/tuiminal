export type ReleaseTarget = {
  id: string
  bunTarget: Bun.Build.CompileTarget
  npmPackage: string
  os: "darwin" | "linux" | "win32"
  cpu: "arm64" | "x64"
  executable: string
  helperExecutable: string
}

export const RELEASE_TARGETS: readonly ReleaseTarget[] = [
  {
    id: "darwin-arm64",
    bunTarget: "bun-darwin-arm64",
    npmPackage: "@xupon/tuiminal-darwin-arm64",
    os: "darwin",
    cpu: "arm64",
    executable: "tuiminal",
    helperExecutable: "tuiminal-sqlite-query",
  },
  {
    id: "darwin-x64",
    bunTarget: "bun-darwin-x64-baseline",
    npmPackage: "@xupon/tuiminal-darwin-x64",
    os: "darwin",
    cpu: "x64",
    executable: "tuiminal",
    helperExecutable: "tuiminal-sqlite-query",
  },
  {
    id: "linux-arm64",
    bunTarget: "bun-linux-arm64",
    npmPackage: "@xupon/tuiminal-linux-arm64",
    os: "linux",
    cpu: "arm64",
    executable: "tuiminal",
    helperExecutable: "tuiminal-sqlite-query",
  },
  {
    id: "linux-x64",
    bunTarget: "bun-linux-x64-baseline",
    npmPackage: "@xupon/tuiminal-linux-x64",
    os: "linux",
    cpu: "x64",
    executable: "tuiminal",
    helperExecutable: "tuiminal-sqlite-query",
  },
  {
    id: "win32-arm64",
    bunTarget: "bun-windows-arm64",
    npmPackage: "@xupon/tuiminal-win32-arm64",
    os: "win32",
    cpu: "arm64",
    executable: "tuiminal.exe",
    helperExecutable: "tuiminal-sqlite-query.exe",
  },
  {
    id: "win32-x64",
    bunTarget: "bun-windows-x64-baseline",
    npmPackage: "@xupon/tuiminal-win32-x64",
    os: "win32",
    cpu: "x64",
    executable: "tuiminal.exe",
    helperExecutable: "tuiminal-sqlite-query.exe",
  },
]

export function releaseTarget(id: string) {
  return RELEASE_TARGETS.find((target) => target.id === id) ?? null
}

export function platformPackageJson(target: ReleaseTarget, version: string) {
  return {
    name: target.npmPackage,
    version,
    description: "Tuiminal standalone executable for " + target.os + " " + target.cpu,
    license: "UNLICENSED",
    os: [target.os],
    cpu: [target.cpu],
    files: ["bin"],
    publishConfig: { access: "public" },
  }
}

export function mainPackageJson(version: string) {
  return {
    name: "tuiminal",
    version,
    description: "An integrated terminal workspace for databases, Git, processes, HTTP, and PTYs",
    license: "UNLICENSED",
    type: "module",
    bin: { tuiminal: "bin/tuiminal.js" },
    files: ["bin"],
    engines: { node: ">=18" },
    optionalDependencies: Object.fromEntries(
      RELEASE_TARGETS.map((target) => [target.npmPackage, version]),
    ),
    publishConfig: { access: "public" },
  }
}

export function npmLauncherSource() {
  const packages = Object.fromEntries(
    RELEASE_TARGETS.map((target) => [target.os + "-" + target.cpu, target.npmPackage]),
  )
  return [
    "#!/usr/bin/env node",
    'import { spawnSync } from "node:child_process"',
    'import { dirname, join } from "node:path"',
    'import { createRequire } from "node:module"',
    "",
    "const packages = " + JSON.stringify(packages, null, 2),
    'const key = process.platform + "-" + process.arch',
    "const packageName = packages[key]",
    "",
    "if (!packageName) {",
    '  console.error("Tuiminal does not provide a binary for " + process.platform + " " + process.arch + ".")',
    "  process.exit(1)",
    "}",
    "",
    "const require = createRequire(import.meta.url)",
    "let packagePath",
    "try {",
    '  packagePath = require.resolve(packageName + "/package.json")',
    "} catch {",
    '  console.error("The optional package " + packageName + " was not installed. Reinstall Tuiminal with optional dependencies enabled.")',
    "  process.exit(1)",
    "}",
    "",
    "const packageRoot = dirname(packagePath)",
    'const executable = join(packageRoot, "bin", process.platform === "win32" ? "tuiminal.exe" : "tuiminal")',
    'const result = spawnSync(executable, process.argv.slice(2), { stdio: "inherit" })',
    "",
    "if (result.error) {",
    '  console.error("Unable to start Tuiminal: " + result.error.message)',
    "  process.exit(1)",
    "}",
    "process.exit(result.status ?? 1)",
    "",
  ].join("\n")
}
