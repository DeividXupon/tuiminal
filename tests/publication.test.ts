import { describe, expect, test } from "bun:test"
import {
  assertArchivePaths,
  assertPublishableCandidate,
  CANDIDATE_JOBS,
  parseReleaseChecksums,
  publicationChannel,
} from "../scripts/publication-model"

const sha = "a".repeat(40)
const candidate = {
  head_sha: sha,
  head_branch: "main",
  conclusion: "success",
  path: ".github/workflows/release-candidate.yml",
  event: "push",
}
const jobs = CANDIDATE_JOBS.map((name) => ({ name, conclusion: "success" }))

describe("publication gates", () => {
  test("requires the exact main commit and every successful native job", () => {
    expect(() => assertPublishableCandidate(candidate, jobs, sha)).not.toThrow()
    for (const patch of [
      { head_sha: "b".repeat(40) },
      { head_branch: "development" },
      { conclusion: "failure" },
      { event: "pull_request" },
      { path: ".github/workflows/check.yml" },
    ])
      expect(() => assertPublishableCandidate({ ...candidate, ...patch }, jobs, sha)).toThrow()
    for (let index = 0; index < jobs.length; index++) {
      expect(() =>
        assertPublishableCandidate(
          candidate,
          jobs.filter((_, i) => i !== index),
          sha,
        ),
      ).toThrow()
      expect(() =>
        assertPublishableCandidate(
          candidate,
          jobs.map((job, i) => (i === index ? { ...job, conclusion: "skipped" } : job)),
          sha,
        ),
      ).toThrow()
    }
  })
  test("never publishes a stable or different prerelease channel", () => {
    expect(publicationChannel("0.2.0-alpha.0")).toBe("alpha")
    for (const version of [
      "0.2.0",
      "0.2.0-beta.0",
      "latest",
      "0.2.0-alpha.0;echo",
      "0.2.0-pre-alpha.0",
    ])
      expect(() => publicationChannel(version)).toThrow()
  })
  test("rejects incomplete, duplicate and escaping checksum entries", () => {
    const line = `${"a".repeat(64)}  tuiminal/package.json`
    expect(parseReleaseChecksums(`${line}\n`, ["tuiminal/package.json"])).toHaveLength(1)
    for (const source of [line, `${line}\n${line}`, `${"a".repeat(64)}  ../package.json`])
      expect(() =>
        parseReleaseChecksums(source, ["tuiminal/package.json", "linux-x64/package.json"]),
      ).toThrow()
  })
  test("rejects unexpected archive paths before extraction", () => {
    const paths = [
      "./",
      "./linux-x64/",
      "./linux-x64/bin/",
      "./tuiminal/",
      "./tuiminal/bin/",
      "./SHA256SUMS",
      ...["linux-x64", "tuiminal"].flatMap((dir) =>
        ["LICENSE", "README.md", "THIRD_PARTY_NOTICES.md", "package.json"].map(
          (file) => `./${dir}/${file}`,
        ),
      ),
      "./linux-x64/bin/tuiminal",
      "./tuiminal/bin/tuiminal.js",
    ]
    expect(() => assertArchivePaths(paths, "linux-x64")).not.toThrow()
    for (const bad of [
      "../../file",
      "/tmp/file",
      "./linux-x64/../file",
      "./other-package/bin/tuiminal",
    ])
      expect(() => assertArchivePaths([...paths, bad], "linux-x64")).toThrow()
  })
})
