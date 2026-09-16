import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { execFileSync } from "node:child_process"
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { prepareIssueAction } from "../packages/feature-git/src/model/issue/actions"
import { DEFAULT_ISSUE_CONFIG } from "../packages/feature-git/src/model/issue/config"
import { DEMO_ISSUES } from "../packages/feature-git/src/model/issue/fixtures"
import { executeIssueMutation } from "../packages/feature-git/src/services/github/issue-mutations"
import { openIssueInBrowser } from "../packages/feature-git/src/services/github/issue-read-actions"
import { searchIssuesPage } from "../packages/feature-git/src/services/github/issue-search"
import { IssueActionCoordinator } from "../packages/feature-git/src/services/issue-actions"
import { IssueSession } from "../packages/feature-git/src/services/issue-session"
import { saveIssueConfig } from "../packages/feature-git/src/storage/issue/config"

const directory = mkdtempSync(join(tmpdir(), "tuiminal-issue-actions-"))
const executable = join(directory, "gh")
const logPath = join(directory, "commands.jsonl")
const checkoutClone = join(directory, "checkout-clone")
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
  mkdirSync(checkoutClone)
  execFileSync("git", ["-C", checkoutClone, "init", "-q"])
  execFileSync("git", ["-C", checkoutClone, "config", "user.name", "Fixture"])
  execFileSync("git", ["-C", checkoutClone, "config", "user.email", "fixture@example.test"])
  execFileSync("git", [
    "-C",
    checkoutClone,
    "remote",
    "add",
    "origin",
    "git@github.com:equipe/api.git",
  ])
  writeFileSync(join(checkoutClone, "README.md"), "fixture\n")
  execFileSync("git", ["-C", checkoutClone, "add", "README.md"])
  execFileSync("git", ["-C", checkoutClone, "commit", "-qm", "fixture"])
  writeFileSync(
    executable,
    `#!/usr/bin/env bun
import { appendFileSync, existsSync, writeFileSync } from "node:fs"
const args = process.argv.slice(2)
if (process.env.FAKE_IGNORE_INPUT === "1") {
  appendFileSync(process.env.FAKE_LOG, JSON.stringify({ args }) + "\\n")
  process.exit(0)
}
const stdin = await Bun.stdin.text()
appendFileSync(process.env.FAKE_LOG, JSON.stringify({ args, stdin, cwd: process.cwd() }) + "\\n")
if (args[0] === "--version") {
  console.log("gh version 2.83.2 (fixture)")
} else if (process.env.FAKE_COORDINATOR === "1") {
  if (args[0] === "api" && args.at(-1) === "user") {
    console.log(JSON.stringify({ login: "deivid", node_id: "viewer-node" }))
  } else if (args[0] === "api" && args[1] === "graphql") {
    if (process.env.FAKE_NETWORK_PREFLIGHT === "1" && !existsSync(process.env.FAKE_STATE)) {
      console.error('Post "https://api.github.com/graphql": read tcp: connection reset by peer')
      process.exit(1)
    }
    if (process.env.FAKE_NETWORK_RECONCILE === "1" && existsSync(process.env.FAKE_STATE)) {
      console.error('Post "https://api.github.com/graphql": read tcp: connection reset by peer')
      process.exit(1)
    }
    const request = JSON.parse(stdin)
    if (request.query.includes("TuiminalReactionTarget")) {
      const reacted = existsSync(process.env.FAKE_STATE)
      console.log(JSON.stringify({ data: { node: {
        __typename: "Issue", id: "${item.identity.nodeId}", url: "${item.identity.url}",
        reactionGroups: reacted ? [{ content: "THUMBS_UP", viewerHasReacted: true, users: { totalCount: 1 } }] : []
      } } }))
      process.exit(0)
    }
    if (request.query.includes("TuiminalAddReaction")) {
      writeFileSync(process.env.FAKE_STATE, "reaction")
      console.log(JSON.stringify({ data: { addReaction: { subject: { id: "${item.identity.nodeId}" } } } }))
      process.exit(0)
    }
    const commented = existsSync(process.env.FAKE_STATE)
    const closed = process.env.FAKE_CLOSE_STATE === "1" && commented
    const nodes = commented ? [{ id: "new-comment", body: "integrated", createdAt: "2026-09-07T12:00:00Z", updatedAt: "2026-09-07T12:00:00Z", url: "${item.identity.url}#issuecomment-new", author: { login: "deivid" }, reactionGroups: [] }] : []
    console.log(JSON.stringify({ data: { repository: {
      viewerPermission: "WRITE",
      issue: {
        id: "${item.identity.nodeId}", number: ${item.identity.number}, url: "${item.identity.url}",
        title: ${JSON.stringify(item.title)}, body: "fixture", state: closed ? "CLOSED" : "OPEN",
        createdAt: "${item.createdAt}", updatedAt: "${item.updatedAt}", closedAt: null,
        viewerCanClose: true, viewerCanReopen: false, viewerCanUpdate: true,
        author: { login: "deivid" }, assignees: { nodes: [{ login: "ana" }] },
        labels: { nodes: [{ name: "bug", color: "d73a4a" }] }, reactionGroups: [],
        comments: { totalCount: nodes.length, pageInfo: { hasPreviousPage: false, startCursor: null }, nodes }
      }
    } } }))
  } else if (args[0] === "issue" && args[1] === "comment") {
    if (process.env.FAKE_NO_RECONCILE !== "1") writeFileSync(process.env.FAKE_STATE, "commented")
    console.log("accepted")
  } else if (args[0] === "issue" && args[1] === "close") {
    writeFileSync(process.env.FAKE_STATE, "closed")
    if (process.env.FAKE_NETWORK_MUTATION === "1") {
      console.error('Post "https://api.github.com/graphql": read tcp: connection reset by peer')
      process.exit(1)
    }
    console.log("accepted")
  } else {
    console.error("unexpected coordinator command")
    process.exit(2)
  }
} else if (process.env.FAKE_SEARCH === "1") {
  if (args[0] === "api" && args.at(-1) === "user") {
    console.log(JSON.stringify({ login: "deivid", node_id: "viewer-node" }))
  } else if (args[0] === "api" && args[1] === "graphql") {
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
    await executeIssueMutation(prepared("checkout", { clonePath: checkoutClone }), {
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
      cwd: realpathSync(checkoutClone),
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

  test("adds reactions through GraphQL and replies without interpolating a shell", async () => {
    writeFileSync(logPath, "")
    const commentUrl = `${item.identity.url}#issuecomment-77`
    await executeIssueMutation(
      prepared("reaction", {
        subjectId: item.identity.nodeId,
        subjectKind: "item",
        reaction: "HOORAY",
      }),
      { executable, env: { FAKE_LOG: logPath } },
    )
    await executeIssueMutation(
      prepared("reply", {
        commentId: "IC_selected",
        commentUrl,
        commentAuthor: "rui",
        body: "$(touch never)",
      }),
      { executable, env: { FAKE_LOG: logPath } },
    )
    const [reaction, reply] = commands()
    expect(JSON.parse(reaction?.stdin ?? "{}").variables).toEqual({
      subjectId: item.identity.nodeId,
      content: "HOORAY",
    })
    expect(reply).toMatchObject({
      args: ["issue", "comment", "318", "--repo", "equipe/api", "--body-file", "-"],
      stdin: `↳ ${commentUrl}\n\n@rui $(touch never)`,
    })
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

  test("classifies excessive output after dispatch as uncertain and never retries", async () => {
    writeFileSync(logPath, "")
    const result = await executeIssueMutation(prepared("comment", { body: "once" }), {
      executable,
      maxOutputBytes: 4,
      env: { FAKE_LOG: logPath },
    })
    expect(result).toEqual({ status: "uncertain", reason: "output-limit" })
    expect(commands()).toHaveLength(1)
  })

  test("keeps incomplete input uncertain without retrying the dispatched write", async () => {
    writeFileSync(logPath, "")
    const result = await executeIssueMutation(
      prepared("comment", { body: "x".repeat(512 * 1024) }),
      {
        executable,
        env: { FAKE_LOG: logPath, FAKE_IGNORE_INPUT: "1" },
      },
    )
    expect(result).toEqual({ status: "uncertain", reason: "input-failed" })
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

  test("validates and re-reads an issue reaction without replaying the write", async () => {
    writeFileSync(logPath, "")
    const statePath = join(directory, "issue-reaction-state")
    rmSync(statePath, { force: true })
    const preparedState = prepareIssueAction({
      actionId: "integrated-reaction",
      kind: "reaction",
      target: item.identity,
      expectedUpdatedAt: item.updatedAt,
      expectedState: item.state,
      auth,
      payload: {
        subjectId: item.identity.nodeId,
        subjectKind: "item",
        reaction: "THUMBS_UP",
      },
    })
    const result = await new IssueActionCoordinator({
      executable,
      env: { FAKE_LOG: logPath, FAKE_COORDINATOR: "1", FAKE_STATE: statePath },
    }).execute(preparedState)
    expect(result).toMatchObject({ status: "confirmed", message: "reaction-reconciled" })
    const graphql = commands().filter((command) => command.args[1] === "graphql")
    expect(graphql.filter((command) => command.stdin.includes("TuiminalAddReaction"))).toHaveLength(
      1,
    )
    expect(
      graphql.filter((command) => command.stdin.includes("TuiminalReactionTarget")),
    ).toHaveLength(2)
  })

  test("keeps an accepted but unobserved write uncertain without replay", async () => {
    writeFileSync(logPath, "")
    const statePath = join(directory, "unobserved-coordinator-state")
    rmSync(statePath, { force: true })
    const preparedState = prepareIssueAction({
      actionId: "unobserved-comment",
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
        FAKE_NO_RECONCILE: "1",
      },
    }).execute(preparedState)
    expect(result).toMatchObject({
      status: "uncertain",
      reason: "accepted-awaiting-reconciliation",
    })
    expect(
      commands().filter((command) => command.args.slice(0, 2).join(" ") === "issue comment"),
    ).toHaveLength(1)
  })

  test("does not send close when the GraphQL preflight loses its connection", async () => {
    writeFileSync(logPath, "")
    const statePath = join(directory, "issue-network-preflight-state")
    rmSync(statePath, { force: true })
    const result = await new IssueActionCoordinator({
      executable,
      env: {
        FAKE_LOG: logPath,
        FAKE_COORDINATOR: "1",
        FAKE_STATE: statePath,
        FAKE_NETWORK_PREFLIGHT: "1",
      },
    }).execute(
      prepareIssueAction({
        actionId: "network-preflight-close",
        kind: "close",
        target: item.identity,
        expectedUpdatedAt: item.updatedAt,
        expectedState: item.state,
        auth,
        payload: {},
      }),
    )
    expect(result).toMatchObject({
      status: "rejected",
      reason: expect.stringContaining("não foi enviada"),
    })
    expect(commands().filter((command) => command.args[0] === "issue")).toHaveLength(0)
  })

  test("keeps a close uncertain after a network failure in the dispatched gh command", async () => {
    writeFileSync(logPath, "")
    const statePath = join(directory, "issue-network-mutation-state")
    rmSync(statePath, { force: true })
    const result = await new IssueActionCoordinator({
      executable,
      env: {
        FAKE_LOG: logPath,
        FAKE_COORDINATOR: "1",
        FAKE_STATE: statePath,
        FAKE_NETWORK_MUTATION: "1",
      },
    }).execute(
      prepareIssueAction({
        actionId: "network-mutation-close",
        kind: "close",
        target: item.identity,
        expectedUpdatedAt: item.updatedAt,
        expectedState: item.state,
        auth,
        payload: {},
      }),
    )
    expect(result).toMatchObject({ status: "uncertain", reason: "network" })
    expect(
      commands().filter((command) => command.args.slice(0, 2).join(" ") === "issue close"),
    ).toHaveLength(1)
  })

  test("confirms a close by read only when the network returns after the write error", async () => {
    writeFileSync(logPath, "")
    const statePath = join(directory, "issue-network-recovered-state")
    rmSync(statePath, { force: true })
    const result = await new IssueActionCoordinator({
      executable,
      env: {
        FAKE_LOG: logPath,
        FAKE_COORDINATOR: "1",
        FAKE_STATE: statePath,
        FAKE_CLOSE_STATE: "1",
        FAKE_NETWORK_MUTATION: "1",
      },
    }).execute(
      prepareIssueAction({
        actionId: "network-recovered-close",
        kind: "close",
        target: item.identity,
        expectedUpdatedAt: item.updatedAt,
        expectedState: item.state,
        auth,
        payload: {},
      }),
    )
    expect(result).toMatchObject({ status: "confirmed", message: "close-reconciled" })
    expect(
      commands().filter((command) => command.args.slice(0, 2).join(" ") === "issue close"),
    ).toHaveLength(1)
  })

  test("keeps a close uncertain when reconciliation cannot reach GraphQL", async () => {
    writeFileSync(logPath, "")
    const statePath = join(directory, "issue-network-reconcile-state")
    rmSync(statePath, { force: true })
    const result = await new IssueActionCoordinator({
      executable,
      env: {
        FAKE_LOG: logPath,
        FAKE_COORDINATOR: "1",
        FAKE_STATE: statePath,
        FAKE_CLOSE_STATE: "1",
        FAKE_NETWORK_RECONCILE: "1",
      },
    }).execute(
      prepareIssueAction({
        actionId: "network-reconcile-close",
        kind: "close",
        target: item.identity,
        expectedUpdatedAt: item.updatedAt,
        expectedState: item.state,
        auth,
        payload: {},
      }),
    )
    expect(result).toMatchObject({ status: "uncertain", reason: "accepted-reconciliation-failed" })
    expect(
      commands().filter((command) => command.args.slice(0, 2).join(" ") === "issue close"),
    ).toHaveLength(1)
  })
})

describe("Issue session refresh", () => {
  test("refreshes every configured section and caches non-active results", async () => {
    writeFileSync(logPath, "")
    const root = directory
    const configPath = join(directory, "issue-refresh.yaml")
    const config = structuredClone(DEFAULT_ISSUE_CONFIG)
    config.profiles[root] = {
      host: "github.com",
      repositories: ["team/api"],
      sections: [
        { id: "created", title: "Created", query: "is:open author:@me" },
        { id: "assigned", title: "Assigned", query: "is:open assignee:@me" },
      ],
    }
    saveIssueConfig(config, configPath)
    const session = new IssueSession({
      configPath,
      transport: { executable, env: { FAKE_LOG: logPath, FAKE_SEARCH: "1" } },
    })
    expect(
      await session.refreshSections(root, ["created", "assigned"], "created", null),
    ).toMatchObject({ status: "ready", section: { id: "created" } })
    expect(await session.loadSection(root, "assigned")).toMatchObject({
      status: "ready",
      section: { id: "assigned" },
      fromCache: true,
    })
    session.dispose()
  })
})
