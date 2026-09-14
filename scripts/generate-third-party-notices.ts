import { createHash } from "node:crypto"
import {
  existsSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { dirname, join, resolve } from "node:path"

type PackageManifest = {
  name?: string
  version?: string
  license?: string | { type?: string }
  author?: string | { name?: string }
  repository?: string | { url?: string }
  dependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
}

type InstalledPackage = {
  key: string
  name: string
  version: string
  license: string
  author: string
  repository: string
  root: string
}

const projectRoot = resolve(import.meta.dir, "..")
const applicationRoot = join(projectRoot, "apps", "cli")
const packagePath = join(applicationRoot, "package.json")
const noticePath = join(projectRoot, "THIRD_PARTY_NOTICES.md")
const bunLicensePath = join(projectRoot, "docs", "licenses", "BUN-1.3.14.md")

function readManifest(path: string): PackageManifest {
  return JSON.parse(readFileSync(path, "utf8")) as PackageManifest
}

function resolveInstalledPackage(name: string, from: string) {
  let directory = from
  while (true) {
    const candidate = join(directory, "node_modules", name, "package.json")
    if (existsSync(candidate)) return candidate
    const parent = dirname(directory)
    if (parent === directory) return null
    directory = parent
  }
}

function repositoryUrl(repository: PackageManifest["repository"]) {
  const value = typeof repository === "string" ? repository : repository?.url
  return String(value ?? "").replace(/^git\+/, "")
}

function licenseName(license: PackageManifest["license"]) {
  return typeof license === "string" ? license : (license?.type ?? "UNKNOWN")
}

function authorName(author: PackageManifest["author"]) {
  return typeof author === "string" ? author : (author?.name ?? "")
}

function packageDependencies(manifest: PackageManifest) {
  return new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.optionalDependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
  ])
}

function installedRuntimePackages() {
  const rootManifest = readManifest(packagePath)
  const packages = new Map<string, InstalledPackage>()
  const queue = [...Object.keys(rootManifest.dependencies ?? {})].map((name) => ({
    name,
    from: applicationRoot,
    required: true,
  }))
  while (queue.length) {
    const next = queue.shift()
    if (!next) continue
    const manifestPath = resolveInstalledPackage(next.name, next.from)
    if (!manifestPath) {
      if (next.required) throw new Error(`Runtime dependency is not installed: ${next.name}`)
      continue
    }
    const manifest = readManifest(manifestPath)
    const root = dirname(realpathSync(manifestPath))
    const name = manifest.name ?? next.name
    const version = manifest.version ?? "unknown"
    const key = `${name}@${version}`
    if (packages.has(key)) continue
    packages.set(key, {
      key,
      name,
      version,
      license: licenseName(manifest.license),
      author: authorName(manifest.author),
      repository: repositoryUrl(manifest.repository),
      root,
    })
    for (const dependency of packageDependencies(manifest)) {
      queue.push({ name: dependency, from: root, required: false })
    }
  }
  return [...packages.values()]
    .filter(
      (item) =>
        !item.name.startsWith("@opentui/core-") && !item.name.startsWith("@xupon/tuiminal-"),
    )
    .sort((left, right) =>
      `${left.name}@${left.version}`.localeCompare(`${right.name}@${right.version}`),
    )
}

function licenseDocuments(item: InstalledPackage) {
  const documents = readdirSync(item.root)
    .filter((name) => /^(?:licen[cs]e|copying|notice)(?:[._-]|$)/i.test(name))
    .flatMap((name) => {
      const path = join(item.root, name)
      return statSync(path).isFile() ? [{ name, text: readFileSync(path, "utf8").trim() }] : []
    })
  if (documents.length || !/^MIT$/i.test(item.license)) return documents
  const owner = item.author || `contributors to ${item.name}`
  return [
    {
      name: "declared MIT license fallback",
      text:
        `Copyright (c) ${owner}\n\n` +
        "Permission is hereby granted, free of charge, to any person obtaining a copy " +
        'of this software and associated documentation files (the "Software"), to deal ' +
        "in the Software without restriction, including without limitation the rights " +
        "to use, copy, modify, merge, publish, distribute, sublicense, and/or sell " +
        "copies of the Software, and to permit persons to whom the Software is " +
        "furnished to do so, subject to the following conditions:\n\n" +
        "The above copyright notice and this permission notice shall be included in all " +
        "copies or substantial portions of the Software.\n\n" +
        'THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR ' +
        "IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, " +
        "FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE " +
        "AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER " +
        "LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, " +
        "OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE " +
        "SOFTWARE.",
    },
  ]
}

function safeCell(value: string) {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ") || "—"
}

export function thirdPartyNotices() {
  const packages = installedRuntimePackages()
  const documents = new Map<string, { packages: string[]; name: string; text: string }>()
  const missing: string[] = []
  for (const item of packages) {
    const licenses = licenseDocuments(item)
    if (!licenses.length) missing.push(`${item.name}@${item.version}`)
    for (const license of licenses) {
      const hash = createHash("sha256").update(license.text).digest("hex")
      const current = documents.get(hash)
      if (current) current.packages.push(`${item.name}@${item.version}`)
      else {
        documents.set(hash, {
          packages: [`${item.name}@${item.version}`],
          name: license.name,
          text: license.text,
        })
      }
    }
  }
  const lines = [
    "# Third-party notices",
    "",
    "Generated from the installed production dependency graph. The standalone executables also embed Bun 1.3.14; its upstream notice is reproduced below.",
    "The @opentui/core entry covers its same-version platform-specific native packages selected for each release target.",
    "",
    "| Package | Version | Declared license | Repository |",
    "| --- | --- | --- | --- |",
    ...packages.map(
      (item) =>
        `| ${safeCell(item.name)} | ${safeCell(item.version)} | ${safeCell(item.license)} | ${safeCell(item.repository)} |`,
    ),
    "",
    ...(missing.length
      ? [
          `No local license document was found for: ${missing.join(", ")}. Their declared license metadata remains listed above.`,
          "",
        ]
      : []),
    "## Bun 1.3.14 runtime notice",
    "",
    readFileSync(bunLicensePath, "utf8").trim(),
    "",
    "## Installed package license texts",
    "",
    ...[...documents.values()].flatMap((document) => [
      `### ${document.packages.sort().join(", ")} — ${document.name}`,
      "",
      "```text",
      document.text.replaceAll("```", "` ` `"),
      "```",
      "",
    ]),
  ]
  return `${lines.join("\n")}\n`
}

if (import.meta.main) {
  const generated = thirdPartyNotices()
  if (process.argv.includes("--check")) {
    if (!existsSync(noticePath) || readFileSync(noticePath, "utf8") !== generated) {
      console.error("THIRD_PARTY_NOTICES.md is stale. Run bun run docs:licenses.")
      process.exit(1)
    }
  } else {
    writeFileSync(noticePath, generated)
    console.log(`Wrote ${noticePath}`)
  }
}
