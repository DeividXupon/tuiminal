import { afterEach, expect, spyOn, test } from "bun:test"
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  claudeResumeThreadsSnapshot,
  publishClaudeResumeThreads,
  resetClaudeResumeThreadsForTests,
} from "../packages/feature-terminal/src/model/claude-resume-threads"
import * as executable from "../packages/feature-terminal/src/services/claude-executable"
import {
  claudeLoadMoreTasks,
  initialSources,
} from "../packages/feature-terminal/src/services/agent-resume-pages"
import { loadLocalClaudeResumeThreadsPage } from "../packages/feature-terminal/src/services/claude-local-resume"

let root: string | undefined
let resolver: ReturnType<typeof spyOn> | undefined
afterEach(() => {
  resolver?.mockRestore()
  resolver = undefined
  resetClaudeResumeThreadsForTests()
  if (root) rmSync(root, { recursive: true, force: true })
  root = undefined
})

function fakeClaude(output: string, exitCode = 0) {
  root = mkdtempSync(join(tmpdir(), "tuiminal-claude-local-search-"))
  const path = join(root, "claude")
  writeFileSync(
    path,
    `#!${process.execPath}\n
if (JSON.stringify(process.argv.slice(2)) !== JSON.stringify(["agents", "--json", "--all"])) process.exit(9)
process.stdout.write(${JSON.stringify(output)})
process.exit(${exitCode})
`,
  )
  chmodSync(path, 0o700)
  resolver = spyOn(executable, "resolveClaudeExecutable").mockReturnValue(path)
}

const session = {
  kind: "background",
  id: "synthetic",
  sessionId: "00000000-0000-4000-8000-000000000001",
  cwd: "/synthetic/external",
  name: "External Claude session",
  startedAt: 100,
  state: "done",
}
const cached = {
  id: "00000000-0000-4000-8000-000000000002",
  title: "Known foreground session",
  cwd: "/synthetic/known",
  preview: "",
  lastResponse: "",
  projectName: "known",
  gitBranch: "",
  updatedAt: 1,
  state: "idle" as const,
}

test.skipIf(process.platform === "win32")(
  "explicit local Claude search keeps paging the official roster beyond the first twelve rows",
  async () => {
    fakeClaude(
      JSON.stringify(
        Array.from({ length: 25 }, (_, index) => ({
          ...session,
          id: `synthetic-${index}`,
          sessionId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
          startedAt: 100 + index,
        })),
      ),
    )
    const pages = initialSources()
    pages["claude:remote"].hasMore = false
    await Promise.all(
      claudeLoadMoreTasks(
        pages,
        undefined,
        new AbortController().signal,
        24,
        (key, page) => {
          pages[key] = { ...pages[key], ...page }
        },
        true,
      ),
    )
    expect(claudeResumeThreadsSnapshot()).toHaveLength(25)
    expect(pages["claude:local"].hasMore).toBe(true)
  },
)

test.skipIf(process.platform === "win32")(
  "local Claude queries its official CLI and merges sessions missing from Tuiminal's index",
  async () => {
    publishClaudeResumeThreads([cached, { ...cached, remoteProfileId: "synthetic-remote" }])
    fakeClaude(JSON.stringify([session]))
    const page = await loadLocalClaudeResumeThreadsPage(new AbortController().signal)
    expect(page.threads.map((thread) => thread.id)).toEqual([session.sessionId, cached.id])
    expect(page.threads[0]).toMatchObject({ title: session.name, cwd: session.cwd })
    expect(page.threads.every((thread) => thread.remoteProfileId === undefined)).toBe(true)
    expect(
      claudeResumeThreadsSnapshot().some((thread) => thread.remoteProfileId === "synthetic-remote"),
    ).toBe(true)
  },
)

test.skipIf(process.platform === "win32")(
  "local Claude reports failure without replacing cached sessions",
  async () => {
    publishClaudeResumeThreads([cached])
    fakeClaude("unavailable", 1)
    await expect(loadLocalClaudeResumeThreadsPage(new AbortController().signal)).rejects.toThrow()
    expect(claudeResumeThreadsSnapshot()).toEqual([cached])
  },
)

test.skipIf(process.platform === "win32")(
  "malformed official roster is a failure, not an empty successful search",
  async () => {
    publishClaudeResumeThreads([cached])
    fakeClaude("{}")
    await expect(loadLocalClaudeResumeThreadsPage(new AbortController().signal)).rejects.toThrow()
    expect(claudeResumeThreadsSnapshot()).toEqual([cached])
  },
)

test("cancelled local Claude search cannot publish over cached sessions", async () => {
  publishClaudeResumeThreads([cached])
  resolver = spyOn(executable, "resolveClaudeExecutable").mockReturnValue("synthetic-must-not-run")
  await expect(loadLocalClaudeResumeThreadsPage(AbortSignal.abort())).rejects.toThrow()
  expect(claudeResumeThreadsSnapshot()).toEqual([cached])
})
