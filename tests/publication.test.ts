import { describe, expect, test } from "bun:test"
import {
  assertArchivePaths,
  assertPublishableCandidate,
  CANDIDATE_JOBS,
  findPublicationRelease,
  parseReleaseChecksums,
  publicationChannel,
  resolvePublicationRelease,
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

describe("release reconciliation", () => {
  const release = {
    id: 123,
    tag_name: "v0.2.0-alpha.0",
    target_commitish: sha,
    draft: true,
    prerelease: true,
    assets: [],
  }

  test("finds an existing draft after the tag endpoint returns 404", async () => {
    const paths: string[] = []
    const found = await findPublicationRelease(release.tag_name, async (path) => {
      paths.push(path)
      return path.startsWith("releases/tags/") ? null : [release]
    })
    expect(found).toBe(release)
    expect(paths).toEqual(["releases/tags/v0.2.0-alpha.0", "releases?per_page=100&page=1"])
  })

  test("uses the published release without listing unrelated releases", async () => {
    const published = { ...release, draft: false }
    let reads = 0
    expect(
      await findPublicationRelease(release.tag_name, async () => {
        reads++
        return published
      }),
    ).toBe(published)
    expect(reads).toBe(1)
  })

  test("checks later pages before treating a release as absent", async () => {
    const fullPage = Array.from({ length: 100 }, (_, index) => ({
      ...release,
      id: index,
      tag_name: `v1.0.${index}`,
    }))
    for (const lastPage of [[release], []]) {
      const paths: string[] = []
      const found = await findPublicationRelease(release.tag_name, async (path) => {
        paths.push(path)
        if (path.startsWith("releases/tags/")) return null
        return path.endsWith("page=1") ? fullPage : lastPage
      })
      expect(found).toBe(lastPage[0] ?? null)
      expect(paths.at(-1)).toBe("releases?per_page=100&page=2")
    }
  })

  test("failed lookups never imply that creating a release is safe", async () => {
    await expect(
      findPublicationRelease(release.tag_name, async () => {
        throw new Error("API unavailable")
      }),
    ).rejects.toThrow("API unavailable")
    await expect(findPublicationRelease(release.tag_name, async () => null)).rejects.toThrow(
      "Could not list existing releases",
    )
    await expect(
      findPublicationRelease(release.tag_name, async () => ({ ...release, tag_name: "wrong" })),
    ).rejects.toThrow("Unexpected release tag")
  })

  test("keeps the accepted creation response without a stale follow-up lookup", async () => {
    const calls: string[] = []
    const found = await resolvePublicationRelease(
      release.tag_name,
      async (path) => {
        calls.push(path)
        return path.startsWith("releases/tags/") ? null : []
      },
      async () => {
        calls.push("create")
        return release
      },
    )
    expect(found).toBe(release)
    expect(calls).toEqual([
      "releases/tags/v0.2.0-alpha.0",
      "releases?per_page=100&page=1",
      "create",
    ])
  })

  test("never creates over an existing draft or retries an uncertain creation", async () => {
    let writes = 0
    const create = async () => {
      writes++
      throw new Error("Connection lost after dispatch")
    }
    expect(
      await resolvePublicationRelease(
        release.tag_name,
        async (path) => (path.startsWith("releases/tags/") ? null : [release]),
        create,
      ),
    ).toBe(release)
    expect(writes).toBe(0)
    await expect(
      resolvePublicationRelease(
        release.tag_name,
        async (path) => (path.startsWith("releases/tags/") ? null : []),
        create,
      ),
    ).rejects.toThrow("Connection lost after dispatch")
    expect(writes).toBe(1)
  })
})
