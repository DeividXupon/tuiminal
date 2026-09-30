import { discoverAgentGitProjects } from "../packages/feature-terminal/src/services/agent-git-projects"
import {
  completeDirectorySuggestion,
  directorySearchParts,
  directorySuggestions,
} from "../packages/feature-terminal/src/services/agent-directory-search"
import { codexResumeThreads } from "../packages/feature-terminal/src/services/codex-resume"
import { afterEach, expect, test } from "bun:test"
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import {
  readProjectDirectory,
  resolveProjectInput,
} from "../packages/feature-terminal/src/services/agent-project-directories"
import {
  agentProjectRecentsPath,
  loadRecentAgentProjects,
  mergeRecentProjects,
  recentProjectsForTarget,
  rememberAgentProject,
} from "../packages/feature-terminal/src/services/agent-project-recents"
import {
  parseProjectDirectoryOutput,
  projectDirectorySshCommand,
  readRemoteProjectDirectory,
} from "../packages/feature-terminal/src/services/agent-project-ssh"

const roots: string[] = []
const profile = { id: "test-alias", name: "Test", host: "test-alias" }
const signal = () => new AbortController().signal
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "tuiminal-projects-"))
  roots.push(root)
  return root
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

test("directory navigation lists folders and directory links without requiring Git", async () => {
  const root = fixture()
  for (const name of [".hidden", "ação com espaços", "a'$(no-command);[]"])
    mkdirSync(join(root, name))
  writeFileSync(join(root, "file.txt"), "fixture")
  if (process.platform !== "win32") {
    symlinkSync(join(root, ".hidden"), join(root, "linked"))
    symlinkSync(join(root, "missing"), join(root, "broken"))
  }
  const result = await readProjectDirectory({ kind: "local" }, root, root, signal())
  expect(result.directories.map((path) => path.split(/[\\/]/u).at(-1))).toEqual(
    process.platform === "win32"
      ? [".hidden", "a'$(no-command);[]", "ação com espaços"]
      : [".hidden", "a'$(no-command);[]", "ação com espaços", "linked"],
  )
  expect(result.truncated).toBe(false)
  await expect(readProjectDirectory({ kind: "local" }, "file.txt", root, signal())).rejects.toThrow(
    "pasta selecionada",
  )
  await expect(readProjectDirectory({ kind: "local" }, "missing", root, signal())).rejects.toThrow(
    "pasta selecionada",
  )
  const aborted = new AbortController()
  aborted.abort()
  await expect(
    readProjectDirectory({ kind: "local" }, root, root, aborted.signal),
  ).rejects.toThrow()
  expect(resolveProjectInput("~/work", root, root)).toBe(join(root, "work"))
  expect(resolveProjectInput("../sibling", root, root)).toBe(resolve(root, "../sibling"))
})

test("SSH directory script treats special paths as data and resolves links", async () => {
  if (process.platform === "win32") return
  const root = fixture()
  const name = "ação ' $(touch INJECTED); [x]"
  mkdirSync(join(root, name))
  mkdirSync(join(root, ".hidden"))
  symlinkSync(join(root, name), join(root, "link"))
  const command = projectDirectorySshCommand(profile, name, root, true)
  expect(command).toContain("BatchMode=yes")
  expect(command).toContain("test-alias")
  // Execute exactly the remote command through a local shell fixture; no SSH credentials.
  const result = await readRemoteProjectDirectory(profile, name, root, signal(), true, {
    command: ["sh", "-c", command.at(-1) ?? ""],
  })
  expect(result.path).toEndWith(name)
  expect(result.directories).toEqual([])
  const listCommand = projectDirectorySshCommand(profile, root, "/", true)
  const listed = await readRemoteProjectDirectory(profile, root, "/", signal(), true, {
    command: ["sh", "-c", listCommand.at(-1) ?? ""],
  })
  expect(listed.directories).toHaveLength(3)
  const homeCommand = projectDirectorySshCommand(profile, "~", "~", false)
  const home = await readRemoteProjectDirectory(profile, "~", "~", signal(), false, {
    command: ["sh", "-c", `HOME='${root}' ${homeCommand.at(-1)}`],
  })
  expect(home.path).toBe(listed.path)
})

test("remote folder queries reject malformed output, missing folders, timeout and cancellation", async () => {
  expect(() => parseProjectDirectoryOutput("shell banner\0/root\0END\0")).toThrow()
  expect(() => parseProjectDirectoryOutput("TUIMINAL_PROJECTS\0/root\0partial")).toThrow()
  expect(
    parseProjectDirectoryOutput("TUIMINAL_PROJECTS\0/root\0/root/a\0TRUNCATED\0").truncated,
  ).toBe(true)
  await expect(
    readRemoteProjectDirectory(profile, "/", "/", signal(), true, {
      command: [process.execPath, "-e", "process.exit(72)"],
    }),
  ).rejects.toThrow("pasta selecionada")
  await expect(
    readRemoteProjectDirectory(profile, "/", "/", signal(), true, {
      command: [process.execPath, "-e", "setInterval(() => {}, 1000)"],
      timeoutMs: 20,
    }),
  ).rejects.toThrow("tempo limite")
  const controller = new AbortController()
  const pending = readRemoteProjectDirectory(profile, "/", "/", controller.signal, true, {
    command: [process.execPath, "-e", "setInterval(() => {}, 1000)"],
  })
  controller.abort()
  await expect(pending).rejects.toThrow()
})

test("recent projects persist outside projects, deduplicate and remain scoped to origin", () => {
  const root = fixture()
  const environment = { XDG_DATA_HOME: root, TUIMINAL_TERMINAL_WORKSPACE_STATE: "1" }
  const local = { kind: "local" as const }
  const remote = { kind: "remote" as const, profile }
  rememberAgentProject("codex", local, root, environment)
  rememberAgentProject("codex", remote, "/srv/project", environment)
  rememberAgentProject("codex", local, root, environment)
  rememberAgentProject("opencode", local, join(root, "other"), environment)
  expect(loadRecentAgentProjects(environment)).toHaveLength(3)
  expect(
    recentProjectsForTarget("codex", local, loadRecentAgentProjects(environment), []).map(
      (item) => item.path,
    ),
  ).toEqual([root])
  expect(
    recentProjectsForTarget("codex", remote, loadRecentAgentProjects(environment), []).map(
      (item) => item.path,
    ),
  ).toEqual(["/srv/project"])
  expect(
    recentProjectsForTarget("opencode", local, loadRecentAgentProjects(environment), []).map(
      (item) => item.path,
    ),
  ).toEqual([join(root, "other")])
  expect(JSON.parse(readFileSync(agentProjectRecentsPath(environment), "utf8")).version).toBe(2)
  const many = Array.from({ length: 30 }, (_, i) => ({
    providerId: "codex" as const,
    source: "local",
    path: join(root, `${i}`),
    usedAt: i,
  }))
  expect(mergeRecentProjects(many)).toHaveLength(20)
  expect(mergeRecentProjects(many)[0]?.usedAt).toBe(29)
})

test("version 1 recent projects migrate to Codex on the next write", () => {
  const root = fixture()
  const environment = { XDG_DATA_HOME: root, TUIMINAL_TERMINAL_WORKSPACE_STATE: "1" }
  rememberAgentProject("codex", { kind: "local" }, root, environment)
  const file = agentProjectRecentsPath(environment)
  writeFileSync(
    file,
    `${JSON.stringify({
      version: 1,
      projects: [{ source: "local", path: root, usedAt: 1 }],
    })}\n`,
  )
  expect(loadRecentAgentProjects(environment)).toEqual([
    { providerId: "codex", source: "local", path: root, usedAt: 1 },
  ])
  rememberAgentProject("codex", { kind: "local" }, root, environment)
  expect(JSON.parse(readFileSync(file, "utf8")).version).toBe(2)
})

test("recent project suggestions retain exact conversation paths and merge timestamps", () => {
  const root = fixture()
  const path = join(root, "name  with spaces", "x".repeat(220), "y".repeat(220))
  const thread = {
    id: "thread",
    title: "Title",
    preview: "",
    lastResponse: "",
    cwd: path,
    projectName: "",
    gitBranch: "",
    updatedAt: 20,
    state: "idle" as const,
  }
  expect(codexResumeThreads({ result: { data: [thread] } })[0]?.cwd).toBe(path)
  const projects = recentProjectsForTarget(
    "codex",
    { kind: "local" },
    [{ providerId: "codex", source: "local", path, usedAt: 10_000 }],
    [thread, { ...thread, id: "remote", cwd: "/srv/remote", remoteProfileId: profile.id }],
  )
  expect(projects).toEqual([{ providerId: "codex", source: "local", path, usedAt: 20_000 }])
})

test("directory access rejects missing permissions and bounds very large listings", async () => {
  const root = fixture()
  const blocked = join(root, "blocked")
  mkdirSync(blocked)
  if (process.platform !== "win32" && process.getuid?.() !== 0) {
    chmodSync(blocked, 0o000)
    try {
      await expect(
        readProjectDirectory({ kind: "local" }, blocked, root, signal()),
      ).rejects.toThrow("pasta selecionada")
    } finally {
      chmodSync(blocked, 0o700)
    }
  }
  for (let index = 0; index < 2_001; index++) mkdirSync(join(root, `folder-${index}`))
  const result = await readProjectDirectory({ kind: "local" }, root, root, signal())
  expect(result.directories).toHaveLength(2_000)
  expect(result.truncated).toBe(true)
})

test("Git discovery finds repositories and worktrees, skips dependencies and does not follow symlinks", async () => {
  const root = fixture()
  mkdirSync(join(root, "Projects", "api", ".git"), { recursive: true })
  mkdirSync(join(root, "Projects", "worktree"), { recursive: true })
  writeFileSync(join(root, "Projects", "worktree", ".git"), "gitdir: /fixture/shared")
  mkdirSync(join(root, "node_modules", "ignored", ".git"), { recursive: true })
  mkdirSync(join(root, ".cache", "ignored", ".git"), { recursive: true })
  if (process.platform !== "win32") symlinkSync(root, join(root, "cycle"))
  const result = await discoverAgentGitProjects({ kind: "local" }, [], signal(), { roots: [root] })
  expect(result.paths.map((path) => path.split(/[\\/]/u).at(-1))).toEqual(["api", "worktree"])
  expect(result.truncated).toBe(false)
  const aborted = new AbortController()
  aborted.abort()
  await expect(
    discoverAgentGitProjects({ kind: "local" }, [], aborted.signal, { roots: [root] }),
  ).rejects.toThrow()
})

test("remote Git discovery uses a bounded read-only script and returns only remote paths", async () => {
  if (process.platform === "win32") return
  const root = fixture()
  mkdirSync(join(root, "Projects", "remote api ' []", ".git"), { recursive: true })
  mkdirSync(join(root, "build", "ignored", ".git"), { recursive: true })
  const result = await discoverAgentGitProjects(
    { kind: "remote", profile },
    ["/never/use/local/seed"],
    signal(),
    { remoteCommand: ["sh", "-s", "--", root] },
  )
  expect(result.paths).toHaveLength(1)
  expect(result.paths[0]).toEndWith("/Projects/remote api ' []")
  expect(result.truncated).toBe(false)
})

test("path autocomplete preserves tilde paths, Unicode, spaces and Windows separators", () => {
  expect(directorySearchParts("~/Proj", false)).toEqual({ parent: "~/", prefix: "Proj" })
  expect(directorySearchParts("~/Projects/", false)).toEqual({ parent: "~/Projects/", prefix: "" })
  const paths = ["/home/Projects", "/home/Próximo projeto", "/home/Documents", "/home/.hidden"]
  expect(directorySuggestions(paths, "~/Pr", false)).toEqual(paths.slice(0, 2))
  expect(directorySuggestions(paths, "~/", false)).not.toContain("/home/.hidden")
  expect(directorySuggestions(paths, "~/.", false)).toEqual(["/home/.hidden"])
  expect(completeDirectorySuggestion("~/Pr", "/home/Próximo projeto", false)).toBe(
    "~/Próximo projeto/",
  )
  expect(
    directorySuggestions(["C:\\Users\\Dev\\Projects"], "C:\\Users\\Dev\\pr", true),
  ).toHaveLength(1)
  expect(completeDirectorySuggestion("C:\\Users\\Dev\\pr", "C:\\Users\\Dev\\Projects", true)).toBe(
    "C:\\Users\\Dev\\Projects\\",
  )
})
