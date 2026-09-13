import "./setup"
import { afterEach, expect, spyOn, test } from "bun:test"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act, useState } from "react"
import { DEFAULT_ISSUE_CONFIG } from "../../src/features/git/model/issue/config"
import { DEFAULT_GIT_DIFFS_CONFIG } from "../../src/features/git/model/local-target"
import { DEFAULT_PULL_REQUEST_CONFIG } from "../../src/features/git/model/pr/config"
import * as git from "../../src/features/git/services/git"
import * as auth from "../../src/features/git/services/github/auth"
import * as catalog from "../../src/features/git/services/github/repository-catalog"
import * as local from "../../src/features/git/services/local-target"
import * as issues from "../../src/features/git/storage/issue/config"
import * as diffs from "../../src/features/git/storage/local/config"
import * as prs from "../../src/features/git/storage/pr/config"
import { useGitConfiguration } from "../../src/features/git/ui/config/useGitConfiguration"

let tui: TestRendererSetup | undefined
const cleanups: Array<() => void> = []
afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  for (const cleanup of cleanups.splice(0).reverse()) cleanup()
})

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

const supported: auth.GhCapabilities = {
  available: true,
  supported: true,
  version: "2.50.0",
  reason: "ready",
}
const target: local.LocalGitTarget = {
  root: "/fixture",
  name: "fixture",
  displayPath: "/fixture",
  isRepository: true,
  branch: "development",
  branches: ["development"],
}

function fixture(
  initialContext = Promise.resolve<git.GitProjectContext>({
    root: target.root,
    launchDirectory: target.root,
    isRepository: true,
    remote: null,
  }),
) {
  const versions: Array<
    ReturnType<typeof deferred<auth.GhCapabilities>> & { signal?: AbortSignal }
  > = []
  const catalogs: Array<
    ReturnType<typeof deferred<Awaited<ReturnType<typeof catalog.loadGitHubRepositoryCatalog>>>> & {
      signal?: AbortSignal
    }
  > = []
  const projects: Array<ReturnType<typeof deferred<local.LocalGitProject[]>>> = []
  const spies = [
    spyOn(git, "resolveGitProjectContext").mockImplementation(() => initialContext),
    spyOn(prs, "loadPullRequestConfig").mockReturnValue({
      config: structuredClone(DEFAULT_PULL_REQUEST_CONFIG),
      error: null,
    }),
    spyOn(issues, "loadIssueConfig").mockReturnValue({
      config: structuredClone(DEFAULT_ISSUE_CONFIG),
      error: null,
    }),
    spyOn(diffs, "loadGitDiffsConfig").mockReturnValue({
      config: structuredClone(DEFAULT_GIT_DIFFS_CONFIG),
      error: null,
    }),
    spyOn(local, "loadLocalGitTarget").mockResolvedValue(target),
    spyOn(auth, "detectGhCapabilities").mockImplementation((options) => {
      const read = {
        ...deferred<auth.GhCapabilities>(),
        ...(options?.signal ? { signal: options.signal } : {}),
      }
      versions.push(read)
      return read.promise
    }),
    spyOn(catalog, "loadGitHubRepositoryCatalog").mockImplementation(({ options }) => {
      const read = {
        ...deferred<Awaited<ReturnType<typeof catalog.loadGitHubRepositoryCatalog>>>(),
        ...(options?.signal ? { signal: options.signal } : {}),
      }
      catalogs.push(read)
      return read.promise
    }),
    spyOn(local, "discoverLocalGitProjects").mockImplementation(() => {
      const read = deferred<local.LocalGitProject[]>()
      projects.push(read)
      return read.promise
    }),
  ]
  cleanups.push(() => {
    for (const spy of spies) spy.mockRestore()
  })
  let current: ReturnType<typeof useGitConfiguration> | undefined
  let setOpen: ((open: boolean) => void) | undefined
  function Harness() {
    const [open, update] = useState(true)
    setOpen = update
    current = useGitConfiguration(open, () => {})
    return <text content={JSON.stringify(current.state)} />
  }
  return {
    Harness,
    versions,
    catalogs,
    projects,
    targetReader: spies[4],
    get current() {
      if (!current) throw new Error("Missing hook")
      return current
    },
    get ready() {
      if (current?.state.status !== "ready") throw new Error("Configuration not ready")
      return current.state
    },
    toggle: (open: boolean) => act(() => setOpen?.(open)),
  }
}

async function mount(h: ReturnType<typeof fixture>) {
  tui = await testRender(<h.Harness />, { width: 100, height: 10 })
  await act(async () => {})
  expect(h.versions).toHaveLength(1)
  expect(h.projects).toHaveLength(1)
}

test("local projects become usable before the remote catalog finishes", async () => {
  const h = fixture()
  await mount(h)
  const project = { root: "/second", name: "second", displayPath: "/second" }
  await act(async () => h.projects[0]?.resolve([project]))
  expect(h.ready.localProjectsLoading).toBe(false)
  expect(h.ready.availableLocalProjects).toContainEqual(project)
  expect(h.ready.repositoriesLoading).toBe(true)
})

test("the remote catalog becomes usable before local discovery finishes", async () => {
  const h = fixture()
  await mount(h)
  await act(async () => h.versions[0]?.resolve(supported))
  await act(async () => h.catalogs[0]?.resolve({ repositories: ["team/repo"], partial: true }))
  expect(h.ready.repositoriesLoading).toBe(false)
  expect(h.ready.availableRepositories).toEqual(["team/repo"])
  expect(h.ready.partial).toBe(true)
  expect(h.ready.localProjectsLoading).toBe(true)
})

test.each(["local", "remote"] as const)(
  "%s failure is reported without waiting for the other reader",
  async (kind) => {
    const h = fixture()
    await mount(h)
    await act(async () =>
      (kind === "local" ? h.projects[0] : h.versions[0])?.reject(new Error("fixture error")),
    )
    expect(kind === "local" ? h.ready.localProjectError : h.ready.repositoryError).toBe(
      "fixture error",
    )
    expect(kind === "local" ? h.ready.localProjectsLoading : h.ready.repositoriesLoading).toBe(
      false,
    )
    expect(kind === "local" ? h.ready.repositoriesLoading : h.ready.localProjectsLoading).toBe(true)
  },
)

test.each(["close", "unmount"] as const)(
  "%s cancels version detection and cannot start a later catalog request",
  async (mode) => {
    const h = fixture()
    await mount(h)
    if (mode === "close") h.toggle(false)
    else {
      act(() => tui?.renderer.destroy())
      tui = undefined
    }
    expect(h.versions[0]?.signal?.aborted).toBe(true)
    await act(async () => h.versions[0]?.resolve(supported))
    expect(h.catalogs).toHaveLength(0)
  },
)

test("reload cancels its old catalog and ignores old successes and errors", async () => {
  const h = fixture()
  await mount(h)
  await act(async () => h.versions[0]?.resolve(supported))
  expect(h.catalogs).toHaveLength(1)
  await act(async () => {
    void h.current.reload()
  })
  expect(h.catalogs[0]?.signal?.aborted).toBe(true)
  expect(h.versions).toHaveLength(2)
  await act(async () => h.versions[1]?.resolve(supported))
  await act(async () => h.catalogs[1]?.resolve({ repositories: ["team/new"], partial: false }))
  await act(async () => h.projects[1]?.resolve([target]))
  await act(async () => h.catalogs[0]?.resolve({ repositories: ["team/old"], partial: true }))
  await act(async () => h.projects[0]?.reject(new Error("obsolete failure")))
  expect(h.ready.availableRepositories).toEqual(["team/new"])
  expect(h.ready.localProjectError).toBe("")
  expect(h.ready.partial).toBe(false)
  expect(h.ready.localProjectsLoading || h.ready.repositoriesLoading).toBe(false)
})

test("closing during initial context resolution does not start further reads", async () => {
  const context = deferred<git.GitProjectContext>()
  const h = fixture(context.promise)
  tui = await testRender(<h.Harness />, { width: 100, height: 10 })
  h.toggle(false)
  await act(async () =>
    context.resolve({
      root: target.root,
      launchDirectory: target.root,
      isRepository: true,
      remote: null,
    }),
  )
  expect(h.targetReader).not.toHaveBeenCalled()
  expect(h.versions).toHaveLength(0)
  expect(h.projects).toHaveLength(0)
})

test("initial failures surface without starting background reads", async () => {
  const context = deferred<git.GitProjectContext>()
  const h = fixture(context.promise)
  tui = await testRender(<h.Harness />, { width: 100, height: 10 })
  await act(async () => context.reject(new Error("fixture initial failure")))
  expect(h.current.state).toEqual({ status: "error", error: "fixture initial failure" })
  expect(h.versions).toHaveLength(0)
  expect(h.projects).toHaveLength(0)
})
