import { chmodSync, copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import {
  mainPackageJson,
  npmLauncherSource,
  platformPackageJson,
  RELEASE_TARGETS,
  type ReleaseTarget,
  releaseTarget,
} from "./release-model"

const root = resolve(import.meta.dir, "..")
const packageMetadata = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  version: string
}
const licensePath = join(root, "LICENSE")
const requestedTarget = process.argv[2] ?? "all"
const selectedTarget = releaseTarget(requestedTarget)
const targets: readonly ReleaseTarget[] =
  requestedTarget === "all" ? RELEASE_TARGETS : selectedTarget ? [selectedTarget] : []

if (!targets.length) {
  console.error("Unknown release target: " + requestedTarget)
  console.error("Available targets: " + RELEASE_TARGETS.map((target) => target.id).join(", "))
  process.exit(1)
}

const distRoot = join(root, "dist")
if (requestedTarget === "all") rmSync(distRoot, { recursive: true, force: true })
mkdirSync(distRoot, { recursive: true })

function writeJson(path: string, value: unknown) {
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n")
}

async function compile(entrypoint: string, outfile: string, target: ReleaseTarget) {
  const result = await Bun.build({
    entrypoints: [entrypoint],
    compile: {
      target: target.bunTarget,
      outfile,
      autoloadDotenv: false,
      autoloadBunfig: false,
    },
    define: {
      "process.env.NODE_ENV": JSON.stringify("production"),
      ...(target.os === "linux" ? { "process.env.OPENTUI_LIBC": JSON.stringify("glibc") } : {}),
    },
    minify: true,
  })
  if (!result.success) {
    for (const log of result.logs) console.error(log)
    throw new Error("Failed to compile " + outfile)
  }
  chmodSync(outfile, 0o755)
}

for (const target of targets) {
  const packageRoot = join(distRoot, "npm", target.id)
  const binRoot = join(packageRoot, "bin")
  rmSync(packageRoot, { recursive: true, force: true })
  mkdirSync(binRoot, { recursive: true })
  console.log("Building " + target.id + "...")
  await compile(join(root, "bin", "tuiminal.ts"), join(binRoot, target.executable), target)
  await compile(
    join(root, "src", "features", "database", "drivers", "sqlite-query-process.ts"),
    join(binRoot, target.helperExecutable),
    target,
  )
  writeJson(join(packageRoot, "package.json"), platformPackageJson(target, packageMetadata.version))
  copyFileSync(licensePath, join(packageRoot, "LICENSE"))
  writeFileSync(
    join(packageRoot, "README.md"),
    "# " + target.npmPackage + "\n\nPlatform executable used by the `tuiminal` npm package.\n",
  )
}

const mainRoot = join(distRoot, "npm", "tuiminal")
const mainBinRoot = join(mainRoot, "bin")
rmSync(mainRoot, { recursive: true, force: true })
mkdirSync(mainBinRoot, { recursive: true })
writeJson(join(mainRoot, "package.json"), mainPackageJson(packageMetadata.version))
copyFileSync(licensePath, join(mainRoot, "LICENSE"))
writeFileSync(join(mainBinRoot, "tuiminal.js"), npmLauncherSource())
chmodSync(join(mainBinRoot, "tuiminal.js"), 0o755)
writeFileSync(
  join(mainRoot, "README.md"),
  [
    "# Tuiminal",
    "",
    "Install the pre-alpha without installing Bun:",
    "",
    "```sh",
    "npm install --global tuiminal@pre-alpha",
    "tuiminal",
    "```",
    "",
  ].join("\n"),
)
console.log("Release packages created in " + join(distRoot, "npm"))
