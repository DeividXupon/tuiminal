import { RELEASE_TARGETS } from "./release-model"

export const PUBLICATION_REPOSITORY = "DeividXupon/tuiminal"
export const CANDIDATE_JOBS = [
  "Canonical official features",
  "Native database drivers",
  ...RELEASE_TARGETS.map((target) => target.id),
]

export function assertPublishableCandidate(
  run: {
    head_sha: string
    head_branch: string
    conclusion: string | null
    path: string
    event: string
  },
  jobs: Array<{ name: string; conclusion: string | null }>,
  sha: string,
) {
  if (
    !/^[a-f0-9]{40}$/.test(sha) ||
    run.head_sha !== sha ||
    run.head_branch !== "main" ||
    run.conclusion !== "success" ||
    run.path !== ".github/workflows/release-candidate.yml" ||
    !["push", "workflow_dispatch"].includes(run.event)
  )
    throw new Error("Publication requires a successful candidate for this exact main commit")
  if (
    jobs.length !== CANDIDATE_JOBS.length ||
    CANDIDATE_JOBS.some(
      (name) =>
        jobs.filter((job) => job.name === name && job.conclusion === "success").length !== 1,
    )
  )
    throw new Error("Every native platform, canonical payload and database job must pass")
}

export function publicationChannel(version: string) {
  if (!/^\d+\.\d+\.\d+-alpha\.\d+$/.test(version))
    throw new Error("This workflow publishes alpha versions only")
  return "alpha"
}

export function parseReleaseChecksums(source: string, expectedPaths: readonly string[]) {
  const entries = source
    .trim()
    .split("\n")
    .map((line) => {
      const match = line.match(/^([a-f0-9]{64}) {2}([^\r\n]+)$/)
      if (!match) throw new Error("Invalid release checksum line")
      return { hash: match[1]!, path: match[2]! }
    })
  if (
    JSON.stringify(entries.map((entry) => entry.path).sort()) !==
    JSON.stringify([...expectedPaths].sort())
  )
    throw new Error("Release checksums must cover exactly the expected files")
  return entries
}

export function assertArchivePaths(paths: string[], target: string) {
  const executable = target.startsWith("win32") ? "tuiminal.exe" : "tuiminal"
  const allowed = new Set([
    ".",
    target,
    `${target}/bin`,
    "tuiminal",
    "tuiminal/bin",
    "SHA256SUMS",
    ...[target, "tuiminal"].flatMap((directory) =>
      ["LICENSE", "README.md", "THIRD_PARTY_NOTICES.md", "package.json"].map(
        (file) => `${directory}/${file}`,
      ),
    ),
    `${target}/bin/${executable}`,
    "tuiminal/bin/tuiminal.js",
  ])
  const normalized = paths.map((path) => path.replace(/^\.\//, "").replace(/\/$/, "") || ".")
  if (
    normalized.length !== allowed.size ||
    new Set(normalized).size !== allowed.size ||
    normalized.some((path) => !allowed.has(path))
  )
    throw new Error(`Unexpected files in ${target} candidate archive`)
}
