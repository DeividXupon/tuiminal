import { createHash } from "node:crypto"
import { createReadStream, readdirSync } from "node:fs"
import { join, resolve } from "node:path"
import { parseFeatureCatalog } from "../apps/cli/src/features/model"
import { decodeFeaturePayload } from "../apps/cli/src/features/download"
import {
  findPublicationRelease,
  PUBLICATION_REPOSITORY,
  publicationChannel,
} from "./publication-model"
import { RELEASE_TARGETS } from "./release-model"
import { version } from "../package.json"

const sha = process.env.GITHUB_SHA ?? ""
if (
  process.env.GITHUB_REPOSITORY !== PUBLICATION_REPOSITORY ||
  process.env.GITHUB_REF !== "refs/heads/main" ||
  !/^[a-f0-9]{40}$/.test(sha)
)
  throw new Error("Publication is restricted to the protected main workflow")
const channel = publicationChannel(version)
const tag = `v${version}`
const directory = resolve("dist/publication")
const plan = (await Bun.file(join(directory, "publication.json")).json()) as {
  version: string
  channel: string
  sha: string
  packages: Array<{
    name: string
    version: string
    filename: string
    integrity: string
    sha256: string
  }>
}
const names = [...RELEASE_TARGETS.map((target) => target.npmPackage), "tuiminal"]
if (
  plan.version !== version ||
  plan.channel !== channel ||
  plan.sha !== sha ||
  JSON.stringify(plan.packages.map((entry) => entry.name)) !== JSON.stringify(names)
)
  throw new Error("Publication plan does not match this commit")

async function command(args: string[]) {
  const child = Bun.spawn(args, { stdin: "ignore", stdout: "inherit", stderr: "inherit" })
  if ((await child.exited) !== 0)
    throw new Error(`${args[0]} ${args[1]} failed; reconcile remote state before continuing`)
}
async function checksum(path: string) {
  const hash = createHash("sha256")
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest("hex")
}
async function registry(name: string, suffix: string) {
  const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}/${suffix}`, {
    cache: "no-store",
  })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`npm lookup failed for ${name}: ${response.status}`)
  return response.json()
}
async function github(path: string) {
  const response = await fetch(`https://api.github.com/repos/${PUBLICATION_REPOSITORY}/${path}`, {
    headers: {
      Authorization: `Bearer ${process.env.GH_TOKEN}`,
      Accept: "application/vnd.github+json",
    },
  })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`GitHub lookup failed: ${response.status}`)
  return response.json()
}

const existing = new Set<string>()
const latestTags = new Map<string, string | undefined>()
// Reconcile all seven identities before the first write. Existing identical
// versions are never published again; different bytes stop the whole sequence.
for (const entry of plan.packages) {
  if (
    entry.version !== version ||
    !/^[a-zA-Z0-9.-]+\.tgz$/.test(entry.filename) ||
    (await checksum(join(directory, entry.filename))) !== entry.sha256
  )
    throw new Error(`Invalid staged package: ${entry.name}`)
  const manifest = await registry(entry.name, version)
  const tags = await registry(entry.name, "latest")
  latestTags.set(entry.name, tags?.version)
  if (manifest) {
    if (manifest.dist?.integrity !== entry.integrity)
      throw new Error(`npm already has different bytes for ${entry.name}@${version}`)
    existing.add(entry.name)
  }
}

const assets = readdirSync(directory).sort()
let release = await findPublicationRelease(tag, github)
if (!release) {
  await command([
    "gh",
    "release",
    "create",
    tag,
    "--repo",
    PUBLICATION_REPOSITORY,
    "--target",
    sha,
    "--title",
    `Tuiminal ${version}`,
    "--draft",
    "--prerelease",
    "--notes-file",
    `docs/releases/${version}.md`,
  ])
  release = await findPublicationRelease(tag, github)
}
if (!release || release.target_commitish !== sha || !release.prerelease)
  throw new Error("The existing release does not identify this candidate")
for (const name of assets) {
  const asset = release.assets.find((entry: { name: string }) => entry.name === name)
  if (asset) {
    if (asset.digest !== `sha256:${await checksum(join(directory, name))}`)
      throw new Error(`Existing release asset differs: ${name}`)
  } else {
    if (!release.draft)
      throw new Error(`Published release is missing ${name}; never change a published version`)
    await command([
      "gh",
      "release",
      "upload",
      tag,
      join(directory, name),
      "--repo",
      PUBLICATION_REPOSITORY,
    ])
  }
}
release = await github(`releases/${release.id}`)
if (!release || release.assets.length !== assets.length)
  throw new Error("Unexpected assets in the release")
for (const name of assets) {
  const asset = release.assets.find((entry: { name: string }) => entry.name === name)
  if (asset?.digest !== `sha256:${await checksum(join(directory, name))}`)
    throw new Error(`Uploaded asset was not verified: ${name}`)
}
if (release.draft)
  await command([
    "gh",
    "release",
    "edit",
    tag,
    "--draft=false",
    "--prerelease",
    "--repo",
    PUBLICATION_REPOSITORY,
  ])
const remoteTag = await github(`git/ref/tags/${tag}`)
if (remoteTag?.object?.sha !== sha)
  throw new Error("The release tag does not identify the qualified commit")
const catalog = parseFeatureCatalog(await Bun.file(join(directory, "catalog.json")).json(), version)
for (const artifact of catalog.artifacts) {
  const response = await fetch(
    `https://github.com/${PUBLICATION_REPOSITORY}/releases/download/${tag}/${artifact.filename}`,
  )
  if (!response.ok)
    throw new Error(`Public feature download failed: ${artifact.id} (${response.status})`)
  decodeFeaturePayload(new Uint8Array(await response.arrayBuffer()), artifact)
}

for (const entry of plan.packages) {
  if (!existing.has(entry.name))
    await command([
      "npm",
      "publish",
      join(directory, entry.filename),
      "--tag",
      channel,
      "--access",
      "public",
      "--provenance",
      "--ignore-scripts",
    ])
  const manifest = await registry(entry.name, version)
  const alpha = await registry(entry.name, channel)
  const latest = await registry(entry.name, "latest")
  if (
    manifest?.dist?.integrity !== entry.integrity ||
    alpha?.version !== version ||
    latest?.version !== latestTags.get(entry.name)
  )
    throw new Error(`Registry confirmation failed for ${entry.name}; inspect before continuing`)
  console.log(`Confirmed ${entry.name}@${version} (${channel})`)
}
