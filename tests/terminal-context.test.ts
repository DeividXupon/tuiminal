import "./setup"
import { afterEach, expect, spyOn, test } from "bun:test"
import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  terminalContextTags,
  terminalContextTooltip,
} from "../packages/feature-terminal/src/rendering/terminal-context"
import { localRemoteLiveDiffHelperCommand } from "../packages/feature-terminal/src/services/remote-live-diff"
import { createRemoteTerminalContextSource } from "../packages/feature-terminal/src/services/remote-terminal-context"
import { readTerminalRepositoryContext } from "../packages/feature-terminal/src/services/terminal-repository-context"
import { readProcessWorkingDirectory } from "../packages/feature-terminal/src/services/terminal-working-directory"
import * as tmuxCommand from "../packages/feature-terminal/src/services/tmux-command"
import { readTmuxPaneWorkingDirectory } from "../packages/feature-terminal/src/services/tmux-pane-context"

const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0))
    rmSync(directory, { recursive: true, force: true })
})

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "tuiminal-terminal-context-"))
  temporaryDirectories.push(directory)
  return directory
}

function git(directory: string, ...args: string[]) {
  return execFileSync("git", ["-C", directory, ...args], {
    encoding: "utf8",
    env: { ...process.env, LC_ALL: "C" },
  }).trim()
}

function repository() {
  const directory = fixture()
  git(directory, "init", "-q")
  git(directory, "config", "user.name", "Tuiminal Test")
  git(directory, "config", "user.email", "tuiminal@example.test")
  writeFileSync(join(directory, "tracked.txt"), "initial\n")
  git(directory, "add", "tracked.txt")
  git(directory, "commit", "-qm", "initial")
  return directory
}

test("terminal repository context follows clean, tracked, staged, and untracked state", async () => {
  const directory = repository()
  const signal = new AbortController().signal
  const branch = git(directory, "branch", "--show-current")
  expect(await readTerminalRepositoryContext(directory, signal)).toMatchObject({
    directory,
    projectName: directory.split("/").at(-1),
    branch,
    state: "clean",
  })

  writeFileSync(join(directory, "tracked.txt"), "changed\n")
  expect((await readTerminalRepositoryContext(directory, signal)).state).toBe("dirty")
  git(directory, "add", "tracked.txt")
  expect((await readTerminalRepositoryContext(directory, signal)).state).toBe("dirty")
  git(directory, "commit", "-qm", "changed")
  writeFileSync(join(directory, "untracked.txt"), "new\n")
  expect((await readTerminalRepositoryContext(directory, signal)).state).toBe("dirty")
})

test("terminal repository context distinguishes no Git and detached HEAD", async () => {
  const plain = fixture()
  expect(await readTerminalRepositoryContext(plain, new AbortController().signal)).toMatchObject({
    directory: plain,
    state: "no-git",
  })

  const directory = repository()
  const hash = git(directory, "rev-parse", "--short", "HEAD")
  git(directory, "checkout", "-q", "--detach")
  expect(
    await readTerminalRepositoryContext(directory, new AbortController().signal),
  ).toMatchObject({
    branch: `HEAD@${hash}`,
    state: "clean",
  })

  const unborn = fixture()
  git(unborn, "init", "-q")
  expect(await readTerminalRepositoryContext(unborn, new AbortController().signal)).toMatchObject({
    branch: git(unborn, "branch", "--show-current"),
    state: "clean",
  })
})

test("terminal context tags retain state, then branch, then folder as width shrinks", () => {
  const context = {
    directory: "/workspace/project",
    projectName: "project\u001b[31m",
    branch: "feature/context",
    state: "dirty" as const,
  }
  expect(terminalContextTags(context, 80).map((tag) => tag.label)).toEqual([
    "project[31m",
    "feature/context",
    "Alterado",
  ])
  expect(terminalContextTags(context, 30).map((tag) => tag.kind)).toEqual(["branch", "state"])
  expect(terminalContextTags(context, 12).map((tag) => tag.kind)).toEqual(["state"])
  expect(terminalContextTags(context, 4)).toEqual([])
  expect(terminalContextTooltip("directory", context)).toBe("Pasta do projeto atual.")
  expect(terminalContextTooltip("branch", context)).toBe("Branch Git atual.")
  expect(terminalContextTooltip("state", context)).toBe("Repositório Git com alterações.")
  expect(terminalContextTooltip("state", { ...context, state: "no-git" })).toBe(
    "A pasta atual não é um repositório Git.",
  )
})

test("remote sync status has priority and uses the configured Master Key", () => {
  const context = {
    directory: "/workspace/project",
    projectName: "project",
    branch: "main",
    state: "clean" as const,
  }
  const unmapped = { kind: "unmapped" as const }
  expect(terminalContextTags(context, 80, unmapped, "Ctrl+G").at(-1)?.label).toBe(
    "Não sincronizado [Ctrl+G] > [R]",
  )
  expect(terminalContextTags(context, 34, unmapped, "Ctrl+G").map((tag) => tag.kind)).toEqual([
    "sync",
  ])
  expect(
    terminalContextTooltip("sync", context, {
      kind: "out-of-sync",
      localPath: "/local/project-sync",
      difference: "remote",
    }),
  ).toContain("projeto remoto mudou")
  expect(
    terminalContextTags(
      context,
      80,
      { kind: "synced", localPath: "/local/project-sync" },
      "Ctrl+G",
    ).at(-1)?.label,
  ).toBe("Sincronizado")
})

test("remote sync transient states use stable-width animation frames", () => {
  const checking = { kind: "checking" as const, localPath: "/local/project-sync" }
  const syncing = { kind: "syncing" as const, localPath: "/local/project-sync" }
  expect(terminalContextTags(undefined, 80, checking, "Ctrl+B", 0)[0]?.label).toBe(
    "◐ Verificando sync…",
  )
  expect(terminalContextTags(undefined, 80, checking, "Ctrl+B", 1)[0]?.label).toBe(
    "◓ Verificando sync…",
  )
  expect(terminalContextTags(undefined, 80, syncing, "Ctrl+B", 0)[0]?.label).toBe(
    "⠋ Sincronizando…",
  )
  expect(terminalContextTags(undefined, 80, syncing, "Ctrl+B", 1)[0]?.label).toBe(
    "⠙ Sincronizando…",
  )
  expect(
    terminalContextTags(
      undefined,
      80,
      { kind: "synced", localPath: "/local/project-sync" },
      "Ctrl+B",
      9,
    )[0]?.label,
  ).toBe("Sincronizado")
})

test("remote terminal context uses the bounded helper for branch and cleanliness", async () => {
  const directory = repository()
  const remote = {
    profile: { id: "fixture", name: "Fixture", host: "fixture" },
    workingDirectory: directory,
  }
  const source = createRemoteTerminalContextSource(remote, {
    command: localRemoteLiveDiffHelperCommand(directory),
  })
  try {
    expect(await source.read(new AbortController().signal)).toMatchObject({ state: "clean" })
    writeFileSync(join(directory, "remote.txt"), "new\n")
    expect(await source.read(new AbortController().signal)).toMatchObject({ state: "dirty" })
  } finally {
    source.close()
  }
})

test("terminal cwd readers follow the owned process and immutable tmux pane", async () => {
  if (process.platform === "linux" || process.platform === "darwin") {
    expect(await readProcessWorkingDirectory(process.pid)).toBe(process.cwd())
  }
  const runTmux = spyOn(tmuxCommand, "runTmux").mockResolvedValue("/srv/current project\n")
  try {
    const target = {
      socket: "/tmp/tmux.sock",
      sessionId: "$1",
      name: "fixture",
      paneId: "%2",
    }
    expect(await readTmuxPaneWorkingDirectory(target)).toBe("/srv/current project")
    expect(runTmux).toHaveBeenCalledWith(
      ["-S", target.socket, "display-message", "-p", "-t", target.paneId, "#{pane_current_path}"],
      undefined,
    )
  } finally {
    runTmux.mockRestore()
  }
})
