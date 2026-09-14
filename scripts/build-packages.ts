import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { basename, join } from "node:path"
import { assertWorkspaceVersions, distributionManifest, workspaceRoot } from "./workspace-model"

export async function buildWorkspacePackages() {
  const workspaces = assertWorkspaceVersions().filter(({ directory }) =>
    directory.startsWith("packages/"),
  )
  const emitted = join(workspaceRoot, "dist", "workspace-build")
  const output = join(workspaceRoot, "dist", "packages")
  rmSync(emitted, { recursive: true, force: true })
  rmSync(output, { recursive: true, force: true })
  const compiler = Bun.spawn(
    [process.execPath, "node_modules/typescript-native/bin/tsc", "-p", "tsconfig.packages.json"],
    { cwd: workspaceRoot, stdout: "inherit", stderr: "inherit" },
  )
  if ((await compiler.exited) !== 0) throw new Error("Workspace compilation failed")
  for (const { directory, manifest } of workspaces) {
    const destination = join(output, basename(directory))
    mkdirSync(destination, { recursive: true })
    cpSync(join(emitted, basename(directory), "src"), join(destination, "dist"), {
      recursive: true,
    })
    for (const file of ["LICENSE", "THIRD_PARTY_NOTICES.md"])
      cpSync(join(workspaceRoot, file), join(destination, file))
    writeFileSync(
      join(destination, "package.json"),
      `${JSON.stringify(distributionManifest(manifest), null, 2)}\n`,
    )
    writeFileSync(
      join(destination, "README.md"),
      [
        `# ${manifest.name}`,
        "",
        "Official internal component of Tuiminal. Requires the matching Tuiminal version and its Bun runtime.",
        "These exports are internal product contracts and may change with each Tuiminal release.",
        "",
        `Source: https://github.com/DeividXupon/tuiminal/tree/main/${directory}`,
        "",
      ].join("\n"),
    )
  }
  console.log(`Built ${workspaces.length} internal npm packages in dist/packages`)
  return workspaces
}

if (import.meta.main) await buildWorkspacePackages()
