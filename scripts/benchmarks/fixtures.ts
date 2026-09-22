import { execFileSync } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

export function gitFixture(parent: string) {
  const root = join(parent, "git-project")
  mkdirSync(root)
  const git = (...args: string[]) =>
    execFileSync("git", ["-C", root, ...args], {
      env: {
        ...process.env,
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
        GIT_TERMINAL_PROMPT: "0",
      },
      stdio: "pipe",
    })
  git("init", "-q", "-b", "main")
  git("config", "user.name", "Benchmark")
  git("config", "user.email", "benchmark@example.test")
  for (let index = 0; index < 40; index += 1) {
    writeFileSync(join(root, `file-${index}.txt`), `old ${index}\n`)
  }
  git("add", ".")
  git("commit", "-qm", "Initial fixture")
  git("checkout", "-qb", "feature")
  writeFileSync(join(root, "comparison.txt"), "Compared branch\n")
  git("add", ".")
  git("commit", "-qm", "Comparison fixture")
  writeFileSync(join(root, "file-0.txt"), "old 0\nchanged\n")
  return root
}
