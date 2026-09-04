import { afterAll, describe, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  DEFAULT_PULL_REQUEST_CONFIG,
  parsePullRequestConfig,
  pullRequestProfileForRoot,
} from "../src/features/git/model/pr/config"
import {
  addPullRequestProfileRepository,
  loadPullRequestConfig,
  resolvePullRequestProfileRoot,
  savePullRequestConfig,
  updatePullRequestProfile,
} from "../src/features/git/storage/pr/config"

const temporaryDirectory = mkdtempSync(join(tmpdir(), "tuiminal-git-pr-config-"))
const configPath = join(temporaryDirectory, "nested", "git-pr.yaml")

afterAll(() => rmSync(temporaryDirectory, { recursive: true, force: true }))

describe("Pull request configuration", () => {
  test("uses safe defaults for unknown schema versions", () => {
    expect(parsePullRequestConfig({ version: 99 })).toEqual(DEFAULT_PULL_REQUEST_CONFIG)
  })

  test("normalizes limits, duplicate repositories and invalid sections", () => {
    const config = parsePullRequestConfig({
      version: 1,
      defaults: {
        host: "github.enterprise.test",
        pageSize: 1000,
        refreshSeconds: 1,
        preview: { position: "bottom", widthRatio: 0.9, heightRatio: 0.1 },
      },
      profiles: {
        "/project/a": {
          repositories: ["team/api", "team/api", "invalid"],
          sections: [
            {
              id: "mine",
              title: "Mine",
              query: "is:open author:@me",
              columns: ["title", "ci", "title", "invalid"],
              sort: "number-asc",
              limit: 250,
            },
            { id: "mine", title: "Duplicate", query: "is:open" },
          ],
        },
      },
    })
    expect(config.defaults).toMatchObject({
      host: "github.enterprise.test",
      pageSize: 100,
      refreshSeconds: 30,
      preview: { position: "bottom", widthRatio: 0.7, heightRatio: 0.3 },
    })
    expect(config.profiles["/project/a"]?.repositories).toEqual(["team/api"])
    expect(config.profiles["/project/a"]?.sections).toHaveLength(1)
    expect(config.profiles["/project/a"]?.sections[0]).toMatchObject({
      columns: ["title", "ci"],
      sort: "number-asc",
      limit: 100,
    })
    expect(pullRequestProfileForRoot(config, "/project/b").repositories).toEqual([])
  })

  test("writes atomically with private permissions and reads the same profile", () => {
    const config = structuredClone(DEFAULT_PULL_REQUEST_CONFIG)
    config.profiles["/project/a"] = {
      host: "github.com",
      repositories: ["team/api"],
      sections: [{ id: "review", title: "Review", query: "is:open review-requested:@me" }],
    }
    savePullRequestConfig(config, configPath)
    expect(statSync(configPath).mode & 0o777).toBe(0o600)
    expect(loadPullRequestConfig(configPath)).toEqual({ config, error: null })
  })

  test("reports invalid YAML without rewriting the original file", () => {
    const invalidPath = join(temporaryDirectory, "invalid.yaml")
    const source = "version: [not closed"
    writeFileSync(invalidPath, source)
    const result = loadPullRequestConfig(invalidPath)
    expect(result.config).toEqual(DEFAULT_PULL_REQUEST_CONFIG)
    expect(result.error).toContain("Could not read")
    expect(readFileSync(invalidPath, "utf8")).toBe(source)
  })

  test("canonicalizes an existing profile root", () => {
    expect(resolvePullRequestProfileRoot(temporaryDirectory)).toBe(realpathSync(temporaryDirectory))
  })

  test("adds repositories only to the canonical project profile", () => {
    const isolatedPath = join(temporaryDirectory, "profile", "git-pr.yaml")
    addPullRequestProfileRepository({
      root: temporaryDirectory,
      host: "github.enterprise.test",
      repository: "team/api",
      path: isolatedPath,
    })
    addPullRequestProfileRepository({
      root: temporaryDirectory,
      host: "github.enterprise.test",
      repository: "team/api",
      path: isolatedPath,
    })
    addPullRequestProfileRepository({
      root: temporaryDirectory,
      host: "github.enterprise.test",
      repository: "team/web",
      path: isolatedPath,
    })

    const profile =
      loadPullRequestConfig(isolatedPath).config.profiles[realpathSync(temporaryDirectory)]
    expect(profile).toMatchObject({
      host: "github.enterprise.test",
      repositories: ["team/api", "team/web"],
    })
    expect(() =>
      addPullRequestProfileRepository({
        root: temporaryDirectory,
        host: "github.com",
        repository: "https://github.com/team/api",
        path: isolatedPath,
      }),
    ).toThrow("owner/repo")
  })

  test("stores preview placement independently for each project profile", () => {
    const isolatedPath = join(temporaryDirectory, "layouts", "git-pr.yaml")
    updatePullRequestProfile({
      root: "/project/a",
      path: isolatedPath,
      update: (profile) => ({ ...profile, previewPosition: "right" }),
    })
    updatePullRequestProfile({
      root: "/project/b",
      path: isolatedPath,
      update: (profile) => ({ ...profile, previewPosition: "bottom" }),
    })
    const profiles = loadPullRequestConfig(isolatedPath).config.profiles
    expect(profiles["/project/a"]?.previewPosition).toBe("right")
    expect(profiles["/project/b"]?.previewPosition).toBe("bottom")
  })
})
