import { afterAll, describe, expect, test } from "bun:test"
import { execFileSync } from "node:child_process"
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  gitComparePickerKeyboardAction,
  gitComparisonKeyboardAction,
} from "../src/features/git/model/branch-comparison"
import {
  gitConfigurationAction,
  repositorySelectionLabel,
  toggleRepositorySelection,
  unifiedRepositorySelection,
} from "../src/features/git/model/git-configuration"
import { DEFAULT_ISSUE_CONFIG, issueProfileForRoot } from "../src/features/git/model/issue/config"
import { gitDiffsTargetForScope, parseGitDiffsConfig } from "../src/features/git/model/local-target"
import {
  DEFAULT_PULL_REQUEST_CONFIG,
  pullRequestProfileForRoot,
} from "../src/features/git/model/pr/config"
import { parseGitHubRemote } from "../src/features/git/model/repository"
import { createPathTreeOptions } from "../src/features/git/rendering/file-tree"
import {
  loadGitBranchComparison,
  loadGitComparisonContext,
} from "../src/features/git/services/branch-comparison"
import { resolveGitProjectContext } from "../src/features/git/services/git"
import { loadGitHubRepositoryCatalog } from "../src/features/git/services/github/repository-catalog"
import {
  discoverLocalGitProjects,
  loadLocalGitTarget,
  switchLocalGitBranch,
} from "../src/features/git/services/local-target"
import { loadGitDiffsConfig, updateGitDiffsTarget } from "../src/features/git/storage/local/config"
import { comparisonSelectorArrangement } from "../src/features/git/ui/base/GitComparisonSelector"

const temporaryDirectory = mkdtempSync(join(tmpdir(), "tuiminal-git-configuration-"))

afterAll(() => rmSync(temporaryDirectory, { recursive: true, force: true }))

describe("Git configuration scope", () => {
  test("parses common GitHub remotes", () => {
    expect(parseGitHubRemote("git@github.com:team/tuiminal.git\n")).toEqual({
      host: "github.com",
      repository: "team/tuiminal",
    })
    expect(parseGitHubRemote("https://github.example.com/team/api.git")).toEqual({
      host: "github.example.com",
      repository: "team/api",
    })
    expect(parseGitHubRemote("file:///tmp/repository")).toBeNull()
  })

  test("defaults to the launch repository and to ALL outside Git", async () => {
    const repository = join(temporaryDirectory, "current-repository")
    const nested = join(repository, "packages", "app")
    mkdirSync(nested, { recursive: true })
    execFileSync("git", ["init", "--quiet", repository])
    execFileSync("git", [
      "-C",
      repository,
      "remote",
      "add",
      "origin",
      "git@github.com:team/current.git",
    ])

    const context = await resolveGitProjectContext(nested)
    expect(context).toMatchObject({
      root: realpathSync(repository),
      isRepository: true,
      remote: { host: "github.com", repository: "team/current" },
    })
    expect(
      pullRequestProfileForRoot(DEFAULT_PULL_REQUEST_CONFIG, context.root, context.remote)
        .repositories,
    ).toEqual(["team/current"])
    expect(
      issueProfileForRoot(DEFAULT_ISSUE_CONFIG, context.root, context.remote).repositories,
    ).toEqual(["team/current"])

    const outside = join(temporaryDirectory, "outside")
    mkdirSync(outside)
    const outsideContext = await resolveGitProjectContext(outside)
    expect(outsideContext.isRepository).toBe(false)
    expect(
      pullRequestProfileForRoot(DEFAULT_PULL_REQUEST_CONFIG, outsideContext.root).repositories,
    ).toEqual([])
    expect(issueProfileForRoot(DEFAULT_ISSUE_CONFIG, outsideContext.root).repositories).toEqual([])
  })

  test("keeps ALL explicit and synchronizes a repository selection", () => {
    expect(
      unifiedRepositorySelection({
        pullRequests: [],
        issues: ["team/issues"],
        pullRequestsExplicit: true,
        issuesExplicit: true,
      }),
    ).toEqual({ repositories: [], mismatch: true })
    expect(
      unifiedRepositorySelection({
        pullRequests: [],
        issues: ["team/current"],
        pullRequestsExplicit: true,
        issuesExplicit: false,
      }).mismatch,
    ).toBe(true)
    expect(toggleRepositorySelection([], "team/current")).toEqual(["team/current"])
    expect(toggleRepositorySelection(["team/current"], "team/current")).toEqual([])
    expect(toggleRepositorySelection(["team/current"], null)).toEqual([])
    expect(repositorySelectionLabel(["team/current"], "REPOSITÓRIOS")).toBe("team/current")
    expect(repositorySelectionLabel(["team/api", "team/web"], "REPOSITÓRIOS")).toBe(
      "2 REPOSITÓRIOS",
    )
  })

  test("maps the unified modal keyboard without restoring local dashboard shortcuts", () => {
    expect(
      gitConfigurationAction({
        key: { name: "4" },
        tab: "pull-requests",
        hasSelection: true,
      }),
    ).toEqual({ type: "select-tab", tab: "repositories" })
    expect(
      gitConfigurationAction({
        key: { name: "1" },
        tab: "pull-requests",
        hasSelection: true,
      }),
    ).toEqual({ type: "select-tab", tab: "diffs" })
    expect(
      gitConfigurationAction({
        key: { name: "enter" },
        tab: "diffs",
        hasSelection: false,
        selectedIndex: 1,
      }),
    ).toEqual({ type: "configure-local", target: "branch" })
    expect(
      gitConfigurationAction({
        key: { name: "enter" },
        tab: "repositories",
        hasSelection: true,
      }),
    ).toEqual({ type: "toggle-repository" })
    expect(
      gitConfigurationAction({
        key: { name: "down", option: true },
        tab: "issues",
        hasSelection: true,
      }),
    ).toEqual({ type: "mutate", mutation: "down" })
  })
})

describe("local Diffs target", () => {
  test("lays out completed comparison selectors in one wide row and a narrow column", () => {
    expect(comparisonSelectorArrangement(140, true)).toBe("row")
    expect(comparisonSelectorArrangement(90, true)).toBe("column")
    expect(comparisonSelectorArrangement(90, false)).toBe("setup")
    expect(comparisonSelectorArrangement(64, false)).toBe("column")
  })

  test("groups compared paths in a collapsible file tree", () => {
    const expanded = createPathTreeOptions(["README.md", "src/api/client.ts"], new Set())
    expect(expanded.map((option) => option.name)).toEqual(["▾ src/", "  client.ts", "README.md"])
    expect(expanded[0]?.folderChain).toEqual(["src", "api"])
    expect(
      createPathTreeOptions(["README.md", "src/api/client.ts"], new Set(["src/api"])).map(
        (option) => option.name,
      ),
    ).toEqual(["▸ src/", "README.md"])
  })

  test("maps comparison and picker shortcuts without stealing search input keys", () => {
    expect(gitComparisonKeyboardAction("c", false)).toBe("exit")
    expect(gitComparisonKeyboardAction("b", false)).toBe("pick-base")
    expect(gitComparisonKeyboardAction("t", false)).toBe("pick-compared")
    expect(gitComparisonKeyboardAction("v", false)).toBeNull()
    expect(gitComparisonKeyboardAction("v", true)).toBe("change-layout")
    expect(gitComparePickerKeyboardAction("escape", true)).toBe("blur-search")
    expect(gitComparePickerKeyboardAction("escape", false)).toBe("close")
    expect(gitComparePickerKeyboardAction("j", false)).toBe("down")
    expect(gitComparePickerKeyboardAction("j", true)).toBeNull()
  })

  test("persists a local project separately and switches only between its local branches", async () => {
    const repository = join(temporaryDirectory, "diffs-repository")
    const configPath = join(temporaryDirectory, "git-diffs.json")
    mkdirSync(repository)
    execFileSync("git", ["init", "--quiet", "--initial-branch=main", repository])
    writeFileSync(join(repository, "README.md"), "fixture\n")
    execFileSync("git", ["-C", repository, "add", "README.md"])
    execFileSync("git", [
      "-C",
      repository,
      "-c",
      "user.name=Tuiminal Test",
      "-c",
      "user.email=tuiminal@example.test",
      "commit",
      "--quiet",
      "-m",
      "fixture",
    ])
    execFileSync("git", ["-C", repository, "branch", "development"])

    const initial = await loadLocalGitTarget(repository)
    expect(initial).toMatchObject({ isRepository: true, branch: "main" })
    expect(initial.branches).toEqual(["development", "main"])
    const switched = await switchLocalGitBranch(repository, "development")
    expect(switched.branch).toBe("development")

    updateGitDiffsTarget({ scope: "/launch/project", repositoryRoot: repository, path: configPath })
    const loaded = loadGitDiffsConfig(configPath)
    expect(loaded.error).toBeNull()
    expect(gitDiffsTargetForScope(loaded.config, "/launch/project", "/fallback")).toBe(
      realpathSync(repository),
    )
    expect(statSync(configPath).mode & 0o777).toBe(0o600)
  })

  test("discovers local Git projects without accepting arbitrary folders", async () => {
    const scanRoot = join(temporaryDirectory, "local-project-scan")
    const repository = join(scanRoot, "team", "api")
    const plainFolder = join(scanRoot, "notes")
    mkdirSync(repository, { recursive: true })
    mkdirSync(plainFolder)
    execFileSync("git", ["init", "--quiet", repository])
    const previousRoots = process.env.TUIMINAL_PROJECT_ROOTS
    process.env.TUIMINAL_PROJECT_ROOTS = scanRoot
    try {
      const projects = await discoverLocalGitProjects(scanRoot)
      expect(projects.map((project) => project.root)).toContain(repository)
      expect(projects.map((project) => project.root)).not.toContain(plainFolder)
    } finally {
      if (previousRoots === undefined) delete process.env.TUIMINAL_PROJECT_ROOTS
      else process.env.TUIMINAL_PROJECT_ROOTS = previousRoots
    }
  })

  test("normalizes malformed local target configuration", () => {
    expect(
      parseGitDiffsConfig({
        version: 99,
        profiles: { "/launch": { repositoryRoot: "/project" }, invalid: {} },
      }),
    ).toEqual({
      version: 1,
      profiles: { "/launch": { repositoryRoot: "/project" } },
    })
  })

  test("compares local and known remote branch refs without checkout", async () => {
    const repository = join(temporaryDirectory, "branch-comparison-repository")
    mkdirSync(repository)
    execFileSync("git", ["init", "--quiet", "--initial-branch=main", repository])
    writeFileSync(join(repository, "README.md"), "base\n")
    execFileSync("git", ["-C", repository, "add", "README.md"])
    execFileSync("git", [
      "-C",
      repository,
      "-c",
      "user.name=Tuiminal Test",
      "-c",
      "user.email=tuiminal@example.test",
      "commit",
      "--quiet",
      "-m",
      "base",
    ])
    const mainHash = execFileSync("git", ["-C", repository, "rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim()
    execFileSync("git", ["-C", repository, "update-ref", "refs/remotes/origin/main", mainHash])
    execFileSync("git", ["-C", repository, "switch", "--quiet", "-c", "feature"])
    writeFileSync(join(repository, "feature.ts"), "export const ready = true\n")
    execFileSync("git", ["-C", repository, "add", "feature.ts"])
    execFileSync("git", [
      "-C",
      repository,
      "-c",
      "user.name=Tuiminal Test",
      "-c",
      "user.email=tuiminal@example.test",
      "commit",
      "--quiet",
      "-m",
      "feature",
    ])

    const context = await loadGitComparisonContext(repository)
    expect(context.currentBranch).toBe("feature")
    expect(context.refs.map((reference) => reference.ref)).toContain("refs/heads/main")
    expect(context.refs.map((reference) => reference.ref)).toContain("refs/heads/feature")
    expect(context.refs.map((reference) => reference.ref)).toContain("refs/remotes/origin/main")

    const comparison = await loadGitBranchComparison({
      root: repository,
      baseRef: "refs/heads/main",
      comparedRef: "refs/heads/feature",
    })
    expect(comparison).toMatchObject({ fileCount: 1, additions: 1, deletions: 0 })
    expect(comparison.patch).toContain("diff --git a/feature.ts b/feature.ts")
    expect((await loadLocalGitTarget(repository)).branch).toBe("feature")
  })
})

describe("GitHub repository catalog", () => {
  test("loads every page of owned, organization, and collaborator repositories", async () => {
    const executable = join(temporaryDirectory, "fake-gh")
    writeFileSync(
      executable,
      `#!/usr/bin/env bun
const body = JSON.parse(await Bun.stdin.text())
const second = Boolean(body.variables.after)
console.log(JSON.stringify({ data: { viewer: { repositories: {
  pageInfo: { hasNextPage: !second, endCursor: second ? null : "next" },
  nodes: second
    ? [{ nameWithOwner: "external/tool" }, { nameWithOwner: "team/api" }]
    : [{ nameWithOwner: "team/api" }, { nameWithOwner: "org/web" }, { nameWithOwner: "invalid" }]
} } } }))
`,
    )
    chmodSync(executable, 0o755)

    expect(
      await loadGitHubRepositoryCatalog({
        host: "github.com",
        options: { executable },
      }),
    ).toEqual({
      repositories: ["external/tool", "org/web", "team/api"],
      partial: false,
    })
  })
})
