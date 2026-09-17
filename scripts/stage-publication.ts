import { createHash } from "node:crypto"
import {
  createReadStream,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { parseFeatureCatalog } from "../apps/cli/src/features/model"
import { decodeFeaturePayload } from "../apps/cli/src/features/download"
import { mainPackageJson, platformPackageJson, RELEASE_TARGETS } from "./release-model"
import { assertArchivePaths, parseReleaseChecksums, publicationChannel } from "./publication-model"
import { version } from "../package.json"
import { parseNpmPackResult } from "./npm-pack-model"

publicationChannel(version)
const input = resolve(process.argv[2] ?? "candidate-artifacts")
const output = resolve("dist/publication")
// Never merge a new publication with stale output from a previous candidate.
if (await Bun.file(join(output, "publication.json")).exists())
  throw new Error("Publication is already staged; inspect it before staging again")
mkdirSync(output, { recursive: true })
const temporary = mkdtempSync(join(tmpdir(), "tuiminal-publication-"))

async function command(args: string[], cwd = temporary) {
  const child = Bun.spawn(args, { cwd, stdout: "pipe", stderr: "pipe", stdin: "ignore" })
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  if (code !== 0) throw new Error(`${args[0]} ${args[1]} failed: ${stderr || stdout}`)
  return stdout
}

async function sha256(path: string) {
  const hash = createHash("sha256")
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest("hex")
}

function checkManifest(directory: string, expected: unknown) {
  const manifest = JSON.parse(readFileSync(join(directory, "package.json"), "utf8"))
  if (JSON.stringify(manifest) !== JSON.stringify(expected))
    throw new Error(`Unexpected manifest: ${directory}`)
}

async function pack(directory: string, name: string) {
  const entry = parseNpmPackResult(
    await command(
      ["npm", "pack", "--json", "--ignore-scripts", "--pack-destination", output],
      directory,
    ),
    { name, version },
  )
  return {
    name: entry.name,
    version,
    filename: entry.filename,
    integrity: entry.integrity,
    sha256: await sha256(join(output, entry.filename)),
  }
}

try {
  const features = join(input, "official-features")
  const catalog = parseFeatureCatalog(
    JSON.parse(readFileSync(join(features, "catalog.json"), "utf8")),
    version,
  )
  for (const artifact of catalog.artifacts) {
    const source = join(features, artifact.filename)
    decodeFeaturePayload(readFileSync(source), artifact)
    cpSync(source, join(output, artifact.filename))
  }
  cpSync(join(features, "catalog.json"), join(output, "catalog.json"))
  const packages = []
  let launcher: string | undefined
  for (const target of RELEASE_TARGETS) {
    const archive = join(input, `npm-${target.id}`, `npm-${target.id}.tar.gz`)
    const paths = (await command(["tar", "-tzf", archive])).trim().split("\n")
    assertArchivePaths(paths, target.id)
    const extracted = join(temporary, target.id)
    mkdirSync(extracted)
    await command(["tar", "-xzf", archive, "-C", extracted, "--no-same-owner"])
    const entries = parseReleaseChecksums(readFileSync(join(extracted, "SHA256SUMS"), "utf8"), [
      `${target.id}/bin/${target.executable}`,
      `${target.id}/package.json`,
      "tuiminal/bin/tuiminal.js",
      "tuiminal/package.json",
    ])
    for (const entry of entries)
      if ((await sha256(join(extracted, entry.path))) !== entry.hash)
        throw new Error(`Checksum mismatch: ${target.id}/${entry.path}`)
    const platform = join(extracted, target.id)
    checkManifest(platform, platformPackageJson(target, version))
    checkManifest(join(extracted, "tuiminal"), mainPackageJson(version))
    for (const directory of [platform, join(extracted, "tuiminal")]) {
      for (const name of ["LICENSE", "THIRD_PARTY_NOTICES.md"]) {
        if ((await sha256(join(directory, name))) !== (await sha256(resolve(name))))
          throw new Error(`Stale ${name} in ${target.id}`)
      }
    }
    if (launcher) {
      for (const file of [
        "package.json",
        "bin/tuiminal.js",
        "README.md",
        "LICENSE",
        "THIRD_PARTY_NOTICES.md",
      ])
        if (
          (await sha256(join(launcher, file))) !== (await sha256(join(extracted, "tuiminal", file)))
        )
          throw new Error(`Launcher differs across native artifacts: ${file}`)
    } else launcher = join(extracted, "tuiminal")
    packages.push(await pack(platform, target.npmPackage))
  }
  if (!launcher) throw new Error("Missing launcher")
  packages.push(await pack(launcher, "tuiminal"))
  writeFileSync(
    join(output, "publication.json"),
    `${JSON.stringify({ version, channel: "alpha", sha: process.env.GITHUB_SHA, packages }, null, 2)}\n`,
  )
  const checksums = []
  for (const name of readdirSync(output).sort())
    checksums.push(`${await sha256(join(output, name))}  ${name}`)
  writeFileSync(join(output, "SHA256SUMS"), `${checksums.join("\n")}\n`)
  console.log(
    `Staged ${packages.length} npm packages and ${catalog.artifacts.length} official payloads in ${output}`,
  )
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
