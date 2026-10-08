import "./setup"
import { afterEach, expect, test } from "bun:test"
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { delimiter, join } from "node:path"
import type {
  AgentResumePage,
  AgentResumeThread,
} from "../packages/feature-terminal/src/model/agent-resume-thread"

const roots: string[] = []
const profile = { id: "work", name: "Work", host: "fixture-alias" }

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function remoteSession(id: string, directory: string, updated: number) {
  return { id, title: `Task ${id}`, location: { directory }, time: { updated } }
}

async function queryRemoteOpenCode(
  sessions: ReturnType<typeof remoteSession>[],
  limits: number[],
  cached: { sessions: ReturnType<typeof remoteSession>[]; remote: boolean }[] = [],
) {
  const root = mkdtempSync(join(tmpdir(), "tuiminal-opencode-resume-"))
  roots.push(root)
  const bin = join(root, "bin")
  const log = join(root, "commands.jsonl")
  mkdirSync(bin)
  writeFileSync(
    join(bin, "ssh"),
    `#!/bin/sh
export TUIMINAL_TEST_OPENCODE_REMOTE=1
printf 'Authorized fixture access only\\n'
for argument in "$@"; do command=$argument; done
exec /bin/sh -c "$command"
`,
    { mode: 0o755 },
  )
  writeFileSync(
    join(bin, "opencode"),
    `#!${process.execPath}
import { appendFileSync } from "node:fs"
const args = process.argv.slice(2)
appendFileSync(${JSON.stringify(log)}, JSON.stringify({ args, cwd: process.cwd() }) + "\\n")
// Listing works remotely even when the local TUI needs a version update.
if (args[0] === "--version") {
  console.log(process.env.TUIMINAL_TEST_OPENCODE_REMOTE ? "2.0.20" : "1.0.0")
  process.exit(0)
}
const sessions = ${JSON.stringify(sessions)}
if (args[0] === "session" && args[1] === "list") {
  console.log(JSON.stringify(sessions.filter(session => session.location.directory === process.cwd())))
  process.exit(0)
}
if (args[0] === "api" && args[1] === "GET") {
  const url = new URL(args[2], "http://fixture.invalid")
  if (url.pathname !== "/api/session" || url.searchParams.get("parentID") !== "null" ||
      url.searchParams.get("order") !== "desc" || url.searchParams.has("directory") ||
      url.searchParams.has("project")) process.exit(2)
  console.log(JSON.stringify({ data: sessions.slice(0, Number(url.searchParams.get("limit"))), cursor: {} }))
  process.exit(0)
}
process.exit(2)
`,
    { mode: 0o755 },
  )
  chmodSync(join(bin, "ssh"), 0o755)
  chmodSync(join(bin, "opencode"), 0o755)
  const services = new URL("../packages/feature-terminal/src/services/", import.meta.url)
  const model = new URL(
    "../packages/feature-terminal/src/model/opencode-resume-threads.ts",
    import.meta.url,
  )
  const runner = join(root, "query.ts")
  writeFileSync(
    runner,
    `
import { loadRemoteOpenCodeResumeThreadsPage } from ${JSON.stringify(new URL("opencode-server.ts", services).pathname)}
import { openCodeResumeThreads } from ${JSON.stringify(new URL("opencode-api.ts", services).pathname)}
import { openCodeResumeThreadsSnapshot, publishOpenCodeResumeThreads } from ${JSON.stringify(model.pathname)}
const profile = ${JSON.stringify(profile)}
for (const source of ${JSON.stringify(cached)}) {
  publishOpenCodeResumeThreads(openCodeResumeThreads(source.sessions, source.remote ? profile : undefined), source.remote ? profile.id : undefined)
}
const pages = []
for (const limit of ${JSON.stringify(limits)}) {
  const page = await loadRemoteOpenCodeResumeThreadsPage(profile, new AbortController().signal, limit)
  pages.push({ page, snapshot: openCodeResumeThreadsSnapshot() })
}
console.log(JSON.stringify(pages))
`,
  )
  const child = Bun.spawn([process.execPath, runner], {
    cwd: root,
    env: { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH ?? ""}` },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  })
  try {
    const [code, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ])
    expect({ code, stderr }).toEqual({ code: 0, stderr: "" })
    return {
      pages: JSON.parse(stdout) as { page: AgentResumePage; snapshot: AgentResumeThread[] }[],
      commands: readFileSync(log, "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as { args: string[]; cwd: string }),
    }
  } finally {
    if (child.exitCode === null) child.kill()
    await child.exited
  }
}

test.skipIf(process.platform === "win32")(
  "remote OpenCode recents include other projects when the cwd-scoped list is empty",
  async () => {
    const sessions = [
      remoteSession("ses_shared", "/srv/first", 1_800_000_003_000),
      remoteSession("ses_second", "/srv/second project", 1_800_000_002_000),
      remoteSession("ses_older", "/srv/third", 1_800_000_001_000),
    ]
    const { pages, commands } = await queryRemoteOpenCode(
      sessions,
      [2, 4],
      [
        {
          sessions: [remoteSession("ses_shared", "/local/project", 1_800_000_004_000)],
          remote: false,
        },
      ],
    )
    const first = pages[0]
    if (!first) throw new Error("Missing initial OpenCode page")
    const { page, snapshot } = first
    expect(page.hasMore).toBe(true)
    expect(page.threads).toMatchObject([
      { id: "ses_shared", cwd: "/srv/first", remoteProfileId: "work", remoteProfileName: "Work" },
      { id: "ses_second", cwd: "/srv/second project", remoteProfileId: "work" },
    ])
    expect(snapshot.filter((thread) => !thread.remoteProfileId)).toMatchObject([
      { id: "ses_shared", cwd: "/local/project" },
    ])
    expect(commands.filter(({ args }) => args[0] === "api")).toEqual([
      { args: ["api", "GET", "/api/session?parentID=null&limit=3&order=desc"], cwd: "/" },
      { args: ["api", "GET", "/api/session?parentID=null&limit=5&order=desc"], cwd: "/" },
    ])

    const next = pages[1]?.page
    if (!next) throw new Error("Missing expanded OpenCode page")
    expect(next.hasMore).toBe(false)
    expect(next.threads.map(({ id }) => id)).toEqual(sessions.map(({ id }) => id))
  },
)

test.skipIf(process.platform === "win32")(
  "remote OpenCode cached recents still discover sessions outside the root project",
  async () => {
    const rootSession = remoteSession("ses_root", "/", 1_800_000_001_000)
    const sessions = [remoteSession("ses_other", "/srv/other", 1_800_000_002_000), rootSession]
    const { pages } = await queryRemoteOpenCode(
      sessions,
      [12],
      [
        {
          sessions: [rootSession],
          remote: true,
        },
      ],
    )
    const first = pages[0]
    if (!first) throw new Error("Missing refreshed OpenCode page")
    const { page, snapshot } = first
    expect(page.threads.map(({ id }) => id)).toEqual(["ses_other", "ses_root"])
    expect(snapshot.map(({ id }) => id)).toEqual(["ses_other", "ses_root"])
  },
)
