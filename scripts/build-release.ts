import { releaseFeatures } from "./release-features"
import { createHash } from "node:crypto"
import {
  chmodSync,
  copyFileSync,
  createReadStream,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { join, resolve } from "node:path"
import { assertWorkspaceVersions } from "./workspace-model"
import {
  mainPackageJson,
  npmLauncherSource,
  platformPackageJson,
  RELEASE_TARGETS,
  type ReleaseTarget,
  releaseTarget,
} from "./release-model"

const root = resolve(import.meta.dir, "..")
assertWorkspaceVersions()
const packageMetadata = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  version: string
}
const licensePath = join(root, "LICENSE")
const noticesPath = join(root, "THIRD_PARTY_NOTICES.md")
const requestedTarget = process.argv[2] ?? "all"
const selectedTarget = releaseTarget(requestedTarget)
const targets: readonly ReleaseTarget[] =
  requestedTarget === "all" ? RELEASE_TARGETS : selectedTarget ? [selectedTarget] : []

if (!targets.length) {
  console.error(`Unknown release target: ${requestedTarget}`)
  console.error(`Available targets: ${RELEASE_TARGETS.map((target) => target.id).join(", ")}`)
  process.exit(1)
}

const distRoot = join(root, "dist")
if (requestedTarget === "all") rmSync(join(distRoot, "npm"), { recursive: true, force: true })
mkdirSync(distRoot, { recursive: true })

function writeJson(path: string, value: unknown) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

async function sha256(path: string) {
  const hash = createHash("sha256")
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest("hex")
}

async function installTargetDependencies(target: ReleaseTarget) {
  const install = Bun.spawn(
    [
      process.execPath,
      "install",
      "--frozen-lockfile",
      "--ignore-scripts",
      `--os=${target.os}`,
      `--cpu=${target.cpu}`,
    ],
    { cwd: root, stdin: "ignore", stdout: "inherit", stderr: "inherit" },
  )
  if ((await install.exited) !== 0) {
    throw new Error(`Failed to install ${target.os}/${target.cpu} build dependencies`)
  }
}

const { catalog } = await releaseFeatures(packageMetadata.version)

async function compile(entrypoint: string, outfile: string, target: ReleaseTarget) {
  const result = await Bun.build({
    entrypoints: [entrypoint],
    compile: {
      target: target.bunTarget,
      outfile,
      autoloadDotenv: false,
      autoloadBunfig: false,
    },
    plugins: [
      {
        name: "official-features-only",
        setup(build) {
          build.onLoad({ filter: /[/\\]features[/\\]release-catalog\.ts$/ }, () => ({
            contents: `export const RELEASE_FEATURE_CATALOG = ${JSON.stringify(catalog)}`,
            loader: "ts",
          }))
          build.onLoad({ filter: /[/\\]features[/\\]source-loader\.ts$/ }, () => ({
            contents:
              'export function loadSourceFeature() { throw new Error("Source features are unavailable in a release") }; export const sourceHttpCommand = loadSourceFeature; export const sourceTerminalSidebar = loadSourceFeature;',
            loader: "ts",
          }))
          build.onLoad({ filter: /[/\\]packages[/\\]feature-[^/\\]+[/\\]src[/\\]/ }, (args) => {
            throw new Error(`Feature implementation entered the minimal binary: ${args.path}`)
          })
        },
      },
    ],
    define: {
      TUIMINAL_MINIMAL_BUILD: "true",
      "process.env.NODE_ENV": JSON.stringify("production"),
      ...(target.os === "linux" ? { "process.env.OPENTUI_LIBC": JSON.stringify("glibc") } : {}),
    },
    minify: true,
  })
  if (!result.success) {
    for (const log of result.logs) console.error(log)
    throw new Error(`Failed to compile ${outfile}`)
  }
  chmodSync(outfile, 0o755)
}

for (const target of targets) {
  await installTargetDependencies(target)
  const packageRoot = join(distRoot, "npm", target.id)
  const binRoot = join(packageRoot, "bin")
  rmSync(packageRoot, { recursive: true, force: true })
  mkdirSync(binRoot, { recursive: true })
  console.log(`Building ${target.id}...`)
  await compile(
    join(root, "apps", "cli", "bin", "tuiminal.ts"),
    join(binRoot, target.executable),
    target,
  )
  writeJson(join(packageRoot, "package.json"), platformPackageJson(target, packageMetadata.version))
  copyFileSync(licensePath, join(packageRoot, "LICENSE"))
  copyFileSync(noticesPath, join(packageRoot, "THIRD_PARTY_NOTICES.md"))
  writeFileSync(
    join(packageRoot, "README.md"),
    `# ${target.npmPackage}\n\nPlatform executable used by the \`tuiminal\` npm package.\n`,
  )
}

const mainRoot = join(distRoot, "npm", "tuiminal")
const mainBinRoot = join(mainRoot, "bin")
rmSync(mainRoot, { recursive: true, force: true })
mkdirSync(mainBinRoot, { recursive: true })
writeJson(join(mainRoot, "package.json"), mainPackageJson(packageMetadata.version))
copyFileSync(licensePath, join(mainRoot, "LICENSE"))
copyFileSync(noticesPath, join(mainRoot, "THIRD_PARTY_NOTICES.md"))
writeFileSync(join(mainBinRoot, "tuiminal.js"), npmLauncherSource())
chmodSync(join(mainBinRoot, "tuiminal.js"), 0o755)
writeFileSync(
  join(mainRoot, "README.md"),
  [
    "# Tuiminal",
    "",
    "Install the alpha without installing Bun:",
    "",
    "```sh",
    "npm install --global tuiminal@alpha",
    "tuiminal",
    "```",
    "",
  ].join("\n"),
)

const checksumFiles = [
  ...targets.flatMap((target) => [
    `${target.id}/bin/${target.executable}`,
    `${target.id}/package.json`,
  ]),
  "tuiminal/bin/tuiminal.js",
  "tuiminal/package.json",
].sort()
const checksums = []
for (const relativePath of checksumFiles) {
  checksums.push(`${await sha256(join(distRoot, "npm", relativePath))}  ${relativePath}`)
}
writeFileSync(join(distRoot, "npm", "SHA256SUMS"), `${checksums.join("\n")}\n`)
console.log(`Release packages created in ${join(distRoot, "npm")}`)
