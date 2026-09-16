import { afterAll, beforeAll, expect, test } from "bun:test"
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { validateGitHubCreateDraft } from "../packages/feature-git/src/model/create-item"
import { issueWorkspaceAction } from "../packages/feature-git/src/model/issue/navigation"
import { pullRequestWorkspaceAction } from "../packages/feature-git/src/model/pr/navigation"
import { createGitHubItem } from "../packages/feature-git/src/services/github/create-item"

const directory = mkdtempSync(join(tmpdir(), "tuiminal-git-create-"))
const executable = join(directory, "gh")
const logPath = join(directory, "commands.jsonl")
const auth = {
  host: "github.com",
  viewerId: "viewer-node",
  viewerLogin: "deivid",
  generation: 1,
}

beforeAll(() => {
  writeFileSync(
    executable,
    `#!/usr/bin/env bun
import { appendFileSync } from "node:fs"
const args = process.argv.slice(2)
const stdin = await Bun.stdin.text()
appendFileSync(process.env.FAKE_LOG, JSON.stringify({ args, stdin }) + "\\n")
const endpoint = args.find((part) => part.startsWith("repos/")) ?? ""
if (args.at(-1) === "user") {
  console.log(JSON.stringify({ login: "deivid", node_id: process.env.FAKE_OTHER_VIEWER === "1" ? "other" : "viewer-node" }))
} else if (endpoint === "repos/team/api" && !args.includes("POST")) {
  console.log(JSON.stringify({ full_name: "team/api", has_issues: process.env.FAKE_ISSUES_DISABLED !== "1" }))
} else if (endpoint.includes("/branches/")) {
  if (process.env.FAKE_MISSING_BRANCH === "1") process.exit(2)
  console.log(JSON.stringify({ name: decodeURIComponent(endpoint.split("/").at(-1) ?? "") }))
} else if (args.includes("POST")) {
  if (process.env.FAKE_POST_FAILURE === "1") process.exit(2)
  const kind = endpoint.endsWith("pulls") ? "pull" : "issues"
  console.log(JSON.stringify({ number: 42, html_url: process.env.FAKE_WRONG_URL === "1" ? "https://evil.example/42" : "https://github.com/team/api/" + kind + "/42" }))
} else process.exit(2)
`,
  )
  chmodSync(executable, 0o755)
})

afterAll(() => rmSync(directory, { recursive: true, force: true }))

function commands() {
  try {
    return readFileSync(logPath, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as { args: string[]; stdin: string })
  } catch {
    return []
  }
}

function resetLog() {
  writeFileSync(logPath, "")
}

const issue = {
  kind: "issue" as const,
  repository: "team/api",
  title: "Unicode ✓",
  body: "linha 1\nlinha 2",
}
const pr = {
  kind: "pr" as const,
  repository: "team/api",
  title: "Fix",
  body: "descrição",
  base: "main",
  head: "feat/demo",
  draft: true,
}

test("creation validates before any GitHub request and keeps Ctrl+N available with empty lists", async () => {
  resetLog()
  expect(validateGitHubCreateDraft({ ...pr, head: "main" })).toBe(
    "Base e head precisam ser diferentes.",
  )
  expect(validateGitHubCreateDraft({ ...pr, head: "bad branch" })).toBe(
    "Informe uma branch head válida.",
  )
  expect(
    await createGitHubItem({ ...issue, repository: "invalid" }, auth, {
      executable,
      env: { FAKE_LOG: logPath },
    }),
  ).toMatchObject({ status: "rejected" })
  expect(commands()).toHaveLength(0)
  expect(
    issueWorkspaceAction({
      key: { name: "n", ctrl: true },
      focus: "list",
      hasSelection: false,
      canLoadMore: false,
      canLoadPreview: false,
    }),
  ).toEqual({ type: "create-issue" })
  expect(
    pullRequestWorkspaceAction({
      keyName: "n",
      ctrl: true,
      focus: "list",
      hasSelection: false,
      canLoadMore: false,
    }),
  ).toEqual({ type: "create-pr" })
})

test("issue creation posts exact JSON once after authenticating and checking repository", async () => {
  resetLog()
  const result = await createGitHubItem(issue, auth, { executable, env: { FAKE_LOG: logPath } })
  expect(result).toEqual({
    status: "confirmed",
    number: 42,
    url: "https://github.com/team/api/issues/42",
  })
  const calls = commands()
  expect(calls.map((call) => call.args.at(-1))).toEqual(["user", "repos/team/api", "-"])
  expect(calls.filter((call) => call.args.includes("POST"))).toHaveLength(1)
  expect(JSON.parse(calls[2]?.stdin ?? "")).toEqual({
    title: "Unicode ✓",
    body: "linha 1\nlinha 2",
  })
})

test("PR creation checks both remote branches and sends draft without touching local Git", async () => {
  resetLog()
  const result = await createGitHubItem(pr, auth, { executable, env: { FAKE_LOG: logPath } })
  expect(result).toMatchObject({ status: "confirmed", number: 42 })
  const calls = commands()
  expect(calls.map((call) => call.args.find((part) => part.startsWith("repos/")))).toEqual([
    undefined,
    "repos/team/api",
    "repos/team/api/branches/main",
    "repos/team/api/branches/feat%2Fdemo",
    "repos/team/api/pulls",
  ])
  expect(JSON.parse(calls[4]?.stdin ?? "")).toEqual({
    title: "Fix",
    body: "descrição",
    base: "main",
    head: "feat/demo",
    draft: true,
  })
})

test("changed account or unavailable branch prevents POST; ambiguous response never confirms", async () => {
  resetLog()
  expect(
    await createGitHubItem(issue, auth, {
      executable,
      env: { FAKE_LOG: logPath, FAKE_OTHER_VIEWER: "1" },
    }),
  ).toMatchObject({ status: "rejected" })
  expect(commands().filter((call) => call.args.includes("POST"))).toHaveLength(0)
  resetLog()
  expect(
    await createGitHubItem(pr, auth, {
      executable,
      env: { FAKE_LOG: logPath, FAKE_MISSING_BRANCH: "1" },
    }),
  ).toMatchObject({ status: "rejected" })
  expect(commands().filter((call) => call.args.includes("POST"))).toHaveLength(0)
  resetLog()
  expect(
    await createGitHubItem(issue, auth, {
      executable,
      env: { FAKE_LOG: logPath, FAKE_POST_FAILURE: "1" },
    }),
  ).toMatchObject({ status: "uncertain" })
  expect(commands().filter((call) => call.args.includes("POST"))).toHaveLength(1)
  resetLog()
  expect(
    await createGitHubItem(issue, auth, {
      executable,
      env: { FAKE_LOG: logPath, FAKE_WRONG_URL: "1" },
    }),
  ).toMatchObject({ status: "uncertain" })
})
