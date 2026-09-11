import { afterAll, describe, expect, test } from "bun:test"
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import {
  discardGitFiles,
  loadGitDiff,
  loadGitSnapshot,
  stageGitFiles,
  toggleGitFile,
} from "../src/features/git/services/git"

const temporaryDirectory = mkdtempSync(join(tmpdir(), "tuiminal-git-file-paths-"))
afterAll(() => rmSync(temporaryDirectory, { recursive: true, force: true }))

function git(root: string, ...args: string[]) {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" })
}

function write(root: string, path: string, content: string) {
  mkdirSync(dirname(join(root, path)), { recursive: true })
  writeFileSync(join(root, path), content)
}

function repository(selected: string, neighbor: string, committed: boolean) {
  const root = mkdtempSync(join(temporaryDirectory, "repository-"))
  git(root, "init", "--quiet")
  git(root, "config", "user.name", "Git path fixture")
  git(root, "config", "user.email", "git-path-fixture@example.invalid")
  git(root, "config", "commit.gpgSign", "false")
  git(root, "config", "core.hooksPath", join(temporaryDirectory, "no-hooks"))
  write(root, selected, "selected base\n")
  write(root, neighbor, "neighbor base\n")
  if (committed) {
    git(root, "add", "--all")
    git(root, "commit", "--quiet", "-m", "Fixture")
  }
  return root
}

async function selectedFile(root: string, path: string) {
  const file = (await loadGitSnapshot(root)).files.find((entry) => entry.path === path)
  if (!file) throw new Error(`Missing fixture path: ${path}`)
  return file
}

function stagedPaths(root: string) {
  return git(root, "diff", "--cached", "--name-only", "-z").split("\0").filter(Boolean)
}

const paths = [
  ["*.txt", "neighbor.txt"],
  ["file?.txt", "file1.txt"],
  ["nested/[ab].txt", "nested/a.txt"],
  [":(glob)*.txt", "neighbor.txt"],
  [":(exclude)neighbor.txt", "neighbor.txt"],
  ["-space 日本語.txt", "neighbor.txt"],
] as const

describe.each(paths)("Git single-file operations for %s", (selected, neighbor) => {
  test("stages only the selected untracked file", async () => {
    const root = repository(selected, neighbor, false)

    await toggleGitFile(root, await selectedFile(root, selected))

    expect(stagedPaths(root)).toEqual([selected])
    expect(await selectedFile(root, neighbor)).toMatchObject({ untracked: true })
  })

  test("stages only the selected tracked modification", async () => {
    const root = repository(selected, neighbor, true)
    write(root, selected, "selected change\n")
    write(root, neighbor, "neighbor change\n")

    await toggleGitFile(root, await selectedFile(root, selected))

    expect(stagedPaths(root)).toEqual([selected])
    expect(await selectedFile(root, neighbor)).toMatchObject({ staged: false, unstaged: true })
  })

  test("previews only the selected staged and unstaged changes", async () => {
    const root = repository(selected, neighbor, true)
    write(root, selected, "selected staged\n")
    write(root, neighbor, "neighbor staged\n")
    git(root, "add", "--all")
    write(root, selected, "selected worktree\n")
    write(root, neighbor, "neighbor worktree\n")

    const diff = await loadGitDiff(root, await selectedFile(root, selected))

    expect(diff).toContain("── STAGED ──")
    expect(diff).toContain("+selected staged")
    expect(diff).toContain("── WORKTREE ──")
    expect(diff).toContain("+selected worktree")
    expect(diff).not.toContain("+neighbor staged")
    expect(diff).not.toContain("+neighbor worktree")
  })

  for (const committed of [true, false]) {
    test(`unstages only the selected file ${committed ? "after" : "before"} the first commit`, async () => {
      const root = repository(selected, neighbor, committed)
      write(root, selected, "selected change\n")
      write(root, neighbor, "neighbor change\n")
      git(root, "add", "--all")

      await toggleGitFile(root, await selectedFile(root, selected))

      expect(stagedPaths(root)).toEqual([neighbor])
      expect(await selectedFile(root, selected)).toMatchObject({ staged: false, unstaged: true })
      expect(readFileSync(join(root, selected), "utf8")).toBe("selected change\n")
      expect(readFileSync(join(root, neighbor), "utf8")).toBe("neighbor change\n")
    })
  }

  test("discards only the selected tracked file", async () => {
    const root = repository(selected, neighbor, true)
    write(root, selected, "selected change\n")
    write(root, neighbor, "neighbor change\n")
    await discardGitFiles(root, [await selectedFile(root, selected)])
    expect(readFileSync(join(root, selected), "utf8")).toBe("selected base\n")
    expect(readFileSync(join(root, neighbor), "utf8")).toBe("neighbor change\n")
  })

  test("removes only the selected untracked file", async () => {
    const root = repository(selected, neighbor, false)
    await discardGitFiles(root, [await selectedFile(root, selected)])
    expect(existsSync(join(root, selected))).toBe(false)
    expect(readFileSync(join(root, neighbor), "utf8")).toBe("neighbor base\n")
  })
})

test("folder actions cascade only through files inside the selected folder", async () => {
  const root = repository("src/a.txt", "src/nested/b.txt", true)
  write(root, "src/a.txt", "a changed\n")
  write(root, "src/nested/b.txt", "b changed\n")
  write(root, "outside.txt", "outside new\n")
  const snapshot = await loadGitSnapshot(root)
  const folderFiles = snapshot.files.filter((file) => file.path.startsWith("src/"))
  const commands: string[][] = []
  await stageGitFiles(root, folderFiles, (args) => commands.push([...args]))
  expect(stagedPaths(root)).toEqual(["src/a.txt", "src/nested/b.txt"])
  expect(commands.flat().join(" ")).toContain("src/a.txt")

  await discardGitFiles(
    root,
    (await loadGitSnapshot(root)).files.filter((file) => file.path.startsWith("src/")),
  )
  expect(readFileSync(join(root, "src/a.txt"), "utf8")).toBe("selected base\n")
  expect(readFileSync(join(root, "src/nested/b.txt"), "utf8")).toBe("neighbor base\n")
  expect(readFileSync(join(root, "outside.txt"), "utf8")).toBe("outside new\n")
})
