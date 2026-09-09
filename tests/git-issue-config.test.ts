import { afterAll, describe, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  DEFAULT_ISSUE_CONFIG,
  DEFAULT_ISSUE_SECTIONS,
  issueProfileForRoot,
  parseIssueConfig,
} from "../src/features/git/model/issue/config"
import {
  addIssueClonePath,
  addIssueProfileRepository,
  loadIssueConfig,
  resolveIssueProfileRoot,
  saveIssueConfig,
  updateIssueProfile,
} from "../src/features/git/storage/issue/config"

const temporaryDirectory = mkdtempSync(join(tmpdir(), "tuiminal-git-issue-config-"))
const configPath = join(temporaryDirectory, "nested", "git-issues.yaml")

afterAll(() => rmSync(temporaryDirectory, { recursive: true, force: true }))

describe("Issue configuration", () => {
  test("starts new profiles with only the English My Issues selector", () => {
    expect(issueProfileForRoot(DEFAULT_ISSUE_CONFIG, "/project/new").sections).toEqual([
      ...DEFAULT_ISSUE_SECTIONS,
    ])
    expect(DEFAULT_ISSUE_SECTIONS).toEqual([
      { id: "mine", title: "My Issues", query: "is:open author:@me" },
    ])
  })

  test("migrates only the untouched legacy selector set", () => {
    const legacy = parseIssueConfig({
      version: 1,
      profiles: {
        "/project/legacy": {
          repositories: [],
          sections: [
            { id: "created", title: "Criadas por mim", query: "is:open author:@me" },
            { id: "assigned", title: "Atribuídas a mim", query: "is:open assignee:@me" },
            { id: "involved", title: "Estou envolvido", query: "is:open involves:@me" },
            { id: "mentioned", title: "Mencionaram-me", query: "is:open mentions:@me" },
          ],
        },
      },
    })
    expect(legacy.profiles["/project/legacy"]?.sections).toEqual([...DEFAULT_ISSUE_SECTIONS])

    const customized = parseIssueConfig({
      version: 1,
      profiles: {
        "/project/custom": {
          repositories: [],
          sections: [
            { id: "created", title: "Created by me", query: "is:open author:@me" },
            { id: "assigned", title: "Atribuídas a mim", query: "is:open assignee:@me" },
            { id: "involved", title: "Estou envolvido", query: "is:open involves:@me" },
            { id: "mentioned", title: "Mencionaram-me", query: "is:open mentions:@me" },
          ],
        },
      },
    })
    expect(customized.profiles["/project/custom"]?.sections).toHaveLength(4)
  })

  test("uses safe defaults for unknown schema versions", () => {
    expect(parseIssueConfig({ version: 99 })).toEqual(DEFAULT_ISSUE_CONFIG)
  })

  test("normalizes section options, limits and repository filters", () => {
    const config = parseIssueConfig({
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
              id: "created",
              title: "Created",
              query: "is:open author:@me",
              columns: ["title", "comments", "title", "invalid"],
              sort: "number-asc",
              limit: 250,
            },
            { id: "created", title: "Duplicate", query: "is:open" },
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
    expect(config.profiles["/project/a"]?.sections).toEqual([
      {
        id: "created",
        title: "Created",
        query: "is:open author:@me",
        columns: ["title", "comments"],
        sort: "number-asc",
        limit: 100,
      },
    ])
    expect(issueProfileForRoot(config, "/project/b").repositories).toEqual([])
  })

  test("writes atomically with private permissions and preserves the profile", () => {
    const config = structuredClone(DEFAULT_ISSUE_CONFIG)
    config.profiles["/project/a"] = {
      host: "github.com",
      repositories: ["team/api"],
      sections: [{ id: "created", title: "Created", query: "is:open author:@me" }],
    }
    saveIssueConfig(config, configPath)
    expect(statSync(configPath).mode & 0o777).toBe(0o600)
    expect(loadIssueConfig(configPath)).toEqual({ config, error: null })
  })

  test("reports invalid YAML without rewriting the original", () => {
    const invalidPath = join(temporaryDirectory, "invalid.yaml")
    const source = "version: [not closed"
    writeFileSync(invalidPath, source)
    const result = loadIssueConfig(invalidPath)
    expect(result.config).toEqual(DEFAULT_ISSUE_CONFIG)
    expect(result.error).toContain("Could not read")
    expect(readFileSync(invalidPath, "utf8")).toBe(source)
  })

  test("canonicalizes roots and scopes settings to each launch project", () => {
    expect(resolveIssueProfileRoot(temporaryDirectory)).toBe(realpathSync(temporaryDirectory))
    const isolatedPath = join(temporaryDirectory, "profiles", "git-issues.yaml")
    addIssueProfileRepository({
      root: temporaryDirectory,
      host: "github.enterprise.test",
      repository: "team/api",
      path: isolatedPath,
    })
    addIssueProfileRepository({
      root: temporaryDirectory,
      host: "github.enterprise.test",
      repository: "team/api",
      path: isolatedPath,
    })
    updateIssueProfile({
      root: "/project/b",
      path: isolatedPath,
      update: (profile) => ({ ...profile, previewPosition: "right" }),
    })
    const profiles = loadIssueConfig(isolatedPath).config.profiles
    expect(profiles[realpathSync(temporaryDirectory)]?.repositories).toEqual(["team/api"])
    expect(profiles["/project/b"]?.previewPosition).toBe("right")
  })

  test("stores canonical checkout clones by host and repository", () => {
    const isolatedPath = join(temporaryDirectory, "clones", "git-issues.yaml")
    addIssueClonePath({
      host: "github.com",
      repository: "team/api",
      clonePath: temporaryDirectory,
      path: isolatedPath,
    })
    expect(loadIssueConfig(isolatedPath).config.repoPaths["github.com/team/api"]).toEqual([
      realpathSync(temporaryDirectory),
    ])
  })
})
