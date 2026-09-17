import { afterAll, beforeAll, expect, test } from "bun:test"
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { validateGitHubCreateDraft } from "../packages/feature-git/src/model/create-item"
import { issueWorkspaceAction } from "../packages/feature-git/src/model/issue/navigation"
import { pullRequestWorkspaceAction } from "../packages/feature-git/src/model/pr/navigation"
import { createGitHubItem } from "../packages/feature-git/src/services/github/create-item"
import { listGitHubRepositoryBranches } from "../packages/feature-git/src/services/github/branch-list"
import {
  commitSubject,
  readGitHubBranchCommitTitle,
} from "../packages/feature-git/src/services/github/branch-commit-title"

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
} else if (endpoint.startsWith("repos/team/api/branches?")) {
  if (process.env.FAKE_BRANCH_BAD_SHAPE === "1") console.log(JSON.stringify({ unexpected: true }))
  else if (endpoint.endsWith("&page=1")) console.log(JSON.stringify(Array.from({ length: 100 }, (_, index) => ({ name: index === 0 ? "main" : "feature/" + index }))))
  else console.log(JSON.stringify([{ name: "fix/cache" }, { name: "bad branch" }]))
} else if (endpoint.includes("/branches/")) {
  if (process.env.FAKE_MISSING_BRANCH === "1") process.exit(2)
  console.log(JSON.stringify({
    name: process.env.FAKE_BRANCH_WRONG_NAME === "1" ? "other" : decodeURIComponent(endpoint.split("/").at(-1) ?? ""),
    commit: { commit: { message: process.env.FAKE_COMMIT_MESSAGE ?? "Fix cache\\n\\nDetails" } },
  }))
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
    "Base e comparada precisam ser diferentes.",
  )
  expect(validateGitHubCreateDraft({ ...pr, head: "bad branch" })).toBe(
    "Informe uma branch comparada válida.",
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

test("PR branch picker reads bounded remote pages and validates the selected repository", async () => {
  resetLog()
  const options = { executable, env: { FAKE_LOG: logPath } }
  await expect(listGitHubRepositoryBranches("github.com", "invalid", 1, options)).rejects.toThrow()
  expect(commands()).toHaveLength(0)
  const first = await listGitHubRepositoryBranches("github.com", "team/api", 1, options)
  expect(first.branches).toHaveLength(100)
  expect(first.branches[0]).toBe("main")
  expect(first.nextPage).toBe(2)
  const second = await listGitHubRepositoryBranches("github.com", "team/api", 2, options)
  expect(second).toEqual({ branches: ["fix/cache"], nextPage: null })
  expect(commands().map((call) => call.args.at(-1))).toEqual([
    "repos/team/api/branches?per_page=100&page=1",
    "repos/team/api/branches?per_page=100&page=2",
  ])
  await expect(
    listGitHubRepositoryBranches("github.com", "team/api", 1, {
      executable,
      env: { FAKE_LOG: logPath, FAKE_BRANCH_BAD_SHAPE: "1" },
    }),
  ).rejects.toThrow("Resposta de branches inválida.")
})

test("PR title suggestion reads the selected remote branch tip and uses its commit subject", async () => {
  resetLog()
  const options = {
    executable,
    env: { FAKE_LOG: logPath, FAKE_COMMIT_MESSAGE: "Corrigir cache ✓\n\nDetalhes" },
  }
  expect(await readGitHubBranchCommitTitle("github.com", "team/api", "feat/demo", options)).toBe(
    "Corrigir cache ✓",
  )
  expect(commands().map((call) => call.args.at(-1))).toEqual([
    "repos/team/api/branches/feat%2Fdemo",
  ])
  expect(commitSubject(`  ${"👍".repeat(200)}\nbody`)).toHaveLength(256)
  expect(commitSubject(`${"x".repeat(254)}👩‍💻`)).toBe("x".repeat(254))
  resetLog()
  await expect(
    readGitHubBranchCommitTitle("github.com", "team/api", "bad branch", options),
  ).rejects.toThrow("Branch remota inválida.")
  expect(commands()).toHaveLength(0)
  await expect(
    readGitHubBranchCommitTitle("github.com", "team/api", "feat/demo", {
      executable,
      env: { FAKE_LOG: logPath, FAKE_BRANCH_WRONG_NAME: "1" },
    }),
  ).rejects.toThrow("Título do último commit indisponível.")
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
