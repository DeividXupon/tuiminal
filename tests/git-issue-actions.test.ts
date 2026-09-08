import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { prepareIssueAction } from "../src/features/git/model/issue/actions"
import { DEMO_ISSUES } from "../src/features/git/model/issue/fixtures"
import { executeIssueMutation } from "../src/features/git/services/github/issue-mutations"
import { openIssueInBrowser } from "../src/features/git/services/github/issue-read-actions"
import { searchIssuesPage } from "../src/features/git/services/github/issue-search"
import { IssueActionCoordinator } from "../src/features/git/services/issue-actions"

const directory = mkdtempSync(join(tmpdir(), "tuiminal-issue-actions-"))
const executable = join(directory, "gh")
const logPath = join(directory, "commands.jsonl")
const item = (() => {
  const candidate = DEMO_ISSUES[0]
  if (!candidate) throw new Error("missing issue fixture")
  return candidate
})()
const auth = {
  host: "github.com",
  viewerId: "viewer-node",
  viewerLogin: "deivid",
  generation: 2,
}

beforeAll(() => {
  writeFileSync(
    executable,
    `#!/usr/bin/env bun
import { appendFileSync, existsSync, writeFileSync } from "node:fs"
const args = process.argv.slice(2)
const stdin = await Bun.stdin.text()
appendFileSync(process.env.FAKE_LOG, JSON.stringify({ args, stdin, cwd: process.cwd() }) + "\\n")
if (process.env.FAKE_COORDINATOR === "1") {
  if (args[0] === "api" && args.at(-1) === "user") {
    console.log(JSON.stringify({ login: "deivid", node_id: "viewer-node" }))
  } else if (args[0] === "api" && args[1] === "graphql") {
    const commented = existsSync(process.env.FAKE_STATE)
    const nodes = commented ? [{ id: "new-comment", body: "integrated", createdAt: "2026-09-07T12:00:00Z", updatedAt: "2026-09-07T12:00:00Z", url: "${item.identity.url}#issuecomment-new", author: { login: "deivid" }, reactionGroups: [] }] : []
    console.log(JSON.stringify({ data: { repository: {
      viewerPermission: "WRITE",
      issue: {
        id: "${item.identity.nodeId}", number: ${item.identity.number}, url: "${item.identity.url}",
        title: ${JSON.stringify(item.title)}, body: "fixture", state: "OPEN",
        createdAt: "${item.createdAt}", updatedAt: "${item.updatedAt}", closedAt: null,
        viewerCanClose: true, viewerCanReopen: false, viewerCanUpdate: true,
        author: { login: "deivid" }, assignees: { nodes: [{ login: "ana" }] },
        labels: { nodes: [{ name: "bug", color: "d73a4a" }] }, reactionGroups: [],
        comments: { totalCount: nodes.length, pageInfo: { hasPreviousPage: false, startCursor: null }, nodes }
      }
    } } }))
  } else if (args[0] === "issue" && args[1] === "comment") {
    writeFileSync(process.env.FAKE_STATE, "commented")
    console.log("accepted")
  } else {
    console.error("unexpected coordinator command")
    process.exit(2)
  }
} else if (process.env.FAKE_SEARCH === "1") {
  if (args[0] === "api" && args[1] === "graphql") {
    console.log(JSON.stringify({ data: { search: {
      issueCount: 1, pageInfo: { hasNextPage: false, endCursor: null },
      nodes: [{
        id: "I_search_1", number: 9, url: "https://github.com/team/api/issues/9",
        title: "Safe\\u001b title", state: "OPEN", createdAt: "2026-09-01T00:00:00Z",
        updatedAt: "2026-09-07T00:00:00Z", author: { login: "ana" },
        repository: { name: "api", owner: { login: "team" } },
        assignees: { nodes: [{ login: "deivid" }] }, labels: { nodes: [{ name: "bug", color: "ff0000" }] },
        comments: { totalCount: 3 }, reactionGroups: [{ users: { totalCount: 2 } }]
      }]
    } } }))
  } else console.log("accepted")
} else if (process.env.FAKE_TIMEOUT === "1") await Bun.sleep(500)
else console.log("accepted")
`,
  )
  chmodSync(executable, 0o755)
})

afterAll(() => rmSync(directory, { recursive: true, force: true }))

function prepared(
  kind: Parameters<typeof prepareIssueAction>[0]["kind"],
  payload: Readonly<Record<string, unknown>> = {},
) {
  const state = prepareIssueAction({
    actionId: `test-${kind}`,
    kind,
    target: item.identity,
    expectedUpdatedAt: item.updatedAt,
    expectedState: item.state,
    auth,
    payload,
  })
  if (state.status !== "prepared") throw new Error("fixture action was not prepared")
  return state.action
}

function commands() {
  if (!existsSync(logPath)) return []
  return readFileSync(logPath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { args: string[]; stdin: string; cwd: string })
}

describe("Issue mutation transport", () => {
  test("searches and opens an exact issue through fake gh without shell interpolation", async () => {
    writeFileSync(logPath, "")
    const options = { executable, env: { FAKE_LOG: logPath, FAKE_SEARCH: "1" } }
    const page = await searchIssuesPage({
      host: "github.com",
      query: "is:issue author:@me archived:false",
      first: 20,
      options,
    })
    await openIssueInBrowser(item.identity, options)
    expect(page).toMatchObject({ totalCount: 1, hasNextPage: false, partial: false })
    expect(page.items[0]).toMatchObject({
      identity: { host: "github.com", owner: "team", repository: "api", number: 9 },
      title: "Safe title",
      commentCount: 3,
      reactionCount: 2,
    })
    const recorded = commands()
    expect(recorded[0]?.args).toEqual([
      "api",
      "graphql",
      "--hostname",
      "github.com",
      "--input",
      "-",
    ])
    expect(JSON.parse(recorded[0]?.stdin ?? "{}").variables.searchQuery).toBe(
      "is:issue author:@me archived:false",
    )
    expect(recorded[1]?.args).toEqual(["issue", "view", "318", "--repo", "equipe/api", "--web"])
  })

  test("uses explicit targets, argv and stdin for every gh-dash-style write", async () => {
    writeFileSync(logPath, "")
    await executeIssueMutation(prepared("comment", { body: "$(touch never)" }), {
      executable,
      env: { FAKE_LOG: logPath },
    })
    await executeIssueMutation(prepared("assign", { logins: ["ana", "rui"] }), {
      executable,
      env: { FAKE_LOG: logPath },
    })
    await executeIssueMutation(
      prepared("labels", {
        labels: ["bug", "frontend"],
        addLabels: ["frontend"],
        removeLabels: ["backend"],
      }),
      { executable, env: { FAKE_LOG: logPath } },
    )
    await executeIssueMutation(prepared("checkout", { clonePath: directory }), {
      executable,
      env: { FAKE_LOG: logPath },
    })
    await executeIssueMutation(prepared("close"), {
      executable,
      env: { FAKE_LOG: logPath },
    })
    await executeIssueMutation(prepared("reopen"), {
      executable,
      env: { FAKE_LOG: logPath },
    })

    const recorded = commands()
    expect(recorded[0]).toMatchObject({
      args: ["issue", "comment", "318", "--repo", "equipe/api", "--body-file", "-"],
      stdin: "$(touch never)",
    })
    expect(recorded[1]?.args).toEqual([
      "issue",
      "edit",
      "318",
      "--repo",
      "equipe/api",
      "--add-assignee",
      "ana,rui",
    ])
    expect(recorded[2]?.args).toEqual([
      "issue",
      "edit",
      "318",
      "--repo",
      "equipe/api",
      "--add-label",
      "frontend",
      "--remove-label",
      "backend",
    ])
    expect(recorded[3]).toMatchObject({
      args: ["issue", "develop", "318", "--repo", "equipe/api", "--checkout"],
      cwd: directory,
    })
    expect(recorded[4]?.args.slice(0, 2)).toEqual(["issue", "close"])
    expect(recorded[5]?.args.slice(0, 2)).toEqual(["issue", "reopen"])
  })

  test("rejects empty payloads before dispatch", async () => {
    writeFileSync(logPath, "")
    expect(
      await executeIssueMutation(prepared("comment", { body: "" }), {
        executable,
        env: { FAKE_LOG: logPath },
      }),
    ).toEqual({ status: "rejected", reason: "empty-body" })
    expect(
      await executeIssueMutation(prepared("labels", { addLabels: [], removeLabels: [] }), {
        executable,
        env: { FAKE_LOG: logPath },
      }),
    ).toEqual({ status: "rejected", reason: "no-label-changes" })
    expect(commands()).toHaveLength(0)
  })

  test("classifies timeout as uncertain and never retries", async () => {
    writeFileSync(logPath, "")
    const result = await executeIssueMutation(prepared("comment", { body: "once" }), {
      executable,
      timeoutMs: 150,
      env: { FAKE_LOG: logPath, FAKE_TIMEOUT: "1" },
    })
    expect(result).toEqual({ status: "uncertain", reason: "timeout" })
    expect(commands()).toHaveLength(1)
  })

  test("re-authenticates, re-reads, writes once and confirms by reconciliation", async () => {
    writeFileSync(logPath, "")
    const statePath = join(directory, "coordinator-state")
    rmSync(statePath, { force: true })
    const preparedState = prepareIssueAction({
      actionId: "integrated-comment",
      kind: "comment",
      target: item.identity,
      expectedUpdatedAt: item.updatedAt,
      expectedState: item.state,
      auth,
      payload: { body: "integrated" },
    })
    const result = await new IssueActionCoordinator({
      executable,
      env: {
        FAKE_LOG: logPath,
        FAKE_COORDINATOR: "1",
        FAKE_STATE: statePath,
      },
    }).execute(preparedState)
    expect(result).toMatchObject({ status: "confirmed", message: "comment-reconciled" })
    expect(
      commands().filter((command) => command.args.slice(0, 2).join(" ") === "issue comment"),
    ).toHaveLength(1)
    expect(commands().filter((command) => command.args[1] === "graphql")).toHaveLength(2)
  })
})
