import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  preparePullRequestAction,
  pullRequestActionAvailability,
  pullRequestMutationWasReconciled,
} from "../packages/feature-git/src/model/pr/actions"
import { demoPullRequestDetails } from "../packages/feature-git/src/model/pr/detail-fixtures"
import { DEMO_PULL_REQUESTS } from "../packages/feature-git/src/model/pr/fixtures"
import { executePullRequestMutation } from "../packages/feature-git/src/services/github/mutations"
import { PullRequestActionCoordinator } from "../packages/feature-git/src/services/pr-actions"

const directory = mkdtempSync(join(tmpdir(), "tuiminal-pr-actions-"))
const executable = join(directory, "gh")
const logPath = join(directory, "commands.jsonl")
const item = (() => {
  const candidate = DEMO_PULL_REQUESTS[0]
  if (!candidate) throw new Error("missing pull request fixture")
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
if (process.env.FAKE_IGNORE_INPUT === "1") {
  appendFileSync(process.env.FAKE_LOG, JSON.stringify({ args }) + "\\n")
  process.exit(0)
}
const stdin = await Bun.stdin.text()
appendFileSync(process.env.FAKE_LOG, JSON.stringify({ args, stdin, cwd: process.cwd() }) + "\\n")
if (process.env.FAKE_COORDINATOR === "1") {
  if (args[0] === "api" && args.at(-1) === "user") {
    console.log(JSON.stringify({ login: "deivid", node_id: "viewer-node" }))
  } else if (args[0] === "api" && args[1] === "graphql") {
    const request = JSON.parse(stdin)
    if (request.query.includes("TuiminalReactionTarget")) {
      const reacted = existsSync(process.env.FAKE_STATE)
      console.log(JSON.stringify({ data: { node: {
        __typename: "PullRequest", id: "${item.identity.nodeId}", url: "${item.identity.url}",
        reactionGroups: reacted ? [{ content: "HEART", viewerHasReacted: true, users: { totalCount: 1 } }] : []
      } } }))
      process.exit(0)
    }
    if (request.query.includes("TuiminalAddReaction")) {
      writeFileSync(process.env.FAKE_STATE, "reaction")
      console.log(JSON.stringify({ data: { addReaction: { subject: { id: "${item.identity.nodeId}" } } } }))
      process.exit(0)
    }
    const commented = existsSync(process.env.FAKE_STATE)
    if (commented && process.env.FAKE_INVALID_RECONCILIATION === "1") {
      console.log("not-json")
      process.exit(0)
    }
    const connection = (nodes) => ({ totalCount: nodes.length, pageInfo: { hasNextPage: false, endCursor: null }, nodes })
    console.log(JSON.stringify({ data: { repository: {
      viewerPermission: "WRITE", mergeCommitAllowed: true, squashMergeAllowed: true, rebaseMergeAllowed: true,
      pullRequest: {
        body: "", baseRefOid: "base", headRefOid: "${item.headSha}", state: "OPEN", isDraft: false,
        mergedAt: null, mergeable: "MERGEABLE", mergeStateStatus: "CLEAN",
        viewerCanUpdateBranch: true, viewerCanClose: true, viewerCanReopen: false, viewerCanUpdate: false,
        assignees: connection([]), reviewRequests: connection([]), reviews: connection([]), commits: connection([]),
        files: connection([]), timelineItems: connection([]), statusCheckRollup: { contexts: connection([]) },
        comments: connection(commented ? [{ id: "new-comment", body: "integrated", createdAt: "2026-09-04T12:00:00Z", url: "https://github.com/equipe/api/pull/142#comment", author: { login: "deivid" } }] : [])
      }
    } } }))
  } else if (args[0] === "pr" && args[1] === "comment") {
    if (process.env.FAKE_NO_RECONCILE !== "1") writeFileSync(process.env.FAKE_STATE, "commented")
    console.log("accepted")
  } else {
    console.error("unexpected coordinator command")
    process.exit(2)
  }
} else if (process.env.FAKE_NETWORK === "1") {
  console.error('Post "https://api.github.com/graphql": read tcp: connection reset by peer')
  process.exit(1)
} else if (process.env.FAKE_TIMEOUT === "1") await Bun.sleep(500)
else console.log("accepted")
`,
  )
  chmodSync(executable, 0o755)
})

afterAll(() => rmSync(directory, { recursive: true, force: true }))

function prepared(kind: Parameters<typeof preparePullRequestAction>[0]["kind"], payload = {}) {
  const state = preparePullRequestAction({
    actionId: `test-${kind}`,
    kind,
    target: item.identity,
    expectedHeadSha: item.headSha,
    auth,
    payload,
  })
  if (state.status !== "prepared") throw new Error("fixture action was not prepared")
  return state.action
}

function commands() {
  return readFileSync(logPath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { args: string[]; stdin: string; cwd: string })
}

describe("pull request action eligibility and reconciliation", () => {
  test("shows explicit reasons for unsafe or impossible actions", () => {
    const details = demoPullRequestDetails(item)
    expect(
      pullRequestActionAvailability({
        kind: "approve",
        summary: item,
        details,
        viewerLogin: item.author.login,
        hasCheckout: false,
        workflowCount: 0,
      }),
    ).toEqual({ enabled: false, reason: "cannot-approve-own-pr" })
    expect(
      pullRequestActionAvailability({
        kind: "merge",
        summary: item,
        details: {
          ...details,
          mergeable: "conflicting",
          permissions: { ...details.permissions, canMerge: true },
        },
        viewerLogin: "reviewer",
        hasCheckout: false,
        workflowCount: 0,
      }),
    ).toEqual({ enabled: false, reason: "merge-conflict" })
  })

  test("confirms only effects observed by a direct read", () => {
    const before = demoPullRequestDetails(item)
    expect(
      pullRequestMutationWasReconciled({
        action: prepared("assign", { login: "new-owner" }),
        before,
        after: { ...before, assignees: [...before.assignees, { login: "new-owner" }] },
        viewerLogin: auth.viewerLogin,
      }),
    ).toBe(true)
    expect(
      pullRequestMutationWasReconciled({
        action: prepared("reaction", {
          subjectId: item.identity.nodeId,
          subjectKind: "item",
          reaction: "HEART",
        }),
        before,
        after: {
          ...before,
          reactionGroups: [{ content: "HEART", count: 2, viewerHasReacted: true }],
        },
        viewerLogin: auth.viewerLogin,
      }),
    ).toBe(true)
    expect(
      pullRequestMutationWasReconciled({
        action: prepared("merge", { mergeQueue: true }),
        before,
        after: {
          ...before,
          mergeQueueEntry: { position: 3, state: "QUEUED", enqueuedAt: "2026-09-04" },
        },
        viewerLogin: auth.viewerLogin,
      }),
    ).toBe(true)
    expect(
      pullRequestMutationWasReconciled({
        action: prepared("merge", { method: "squash" }),
        before,
        after: before,
        viewerLogin: auth.viewerLogin,
      }),
    ).toBe(false)
    expect(
      pullRequestMutationWasReconciled({
        action: prepared("close"),
        before,
        after: { ...before, remoteState: "closed" },
        viewerLogin: auth.viewerLogin,
      }),
    ).toBe(true)
  })
})

describe("pull request mutation transport", () => {
  test("coordinates auth, immutable head, one write and direct reconciliation", async () => {
    writeFileSync(logPath, "")
    const statePath = join(directory, "coordinator-state")
    rmSync(statePath, { force: true })
    const preparedState = preparePullRequestAction({
      actionId: "integrated-comment",
      kind: "comment",
      target: item.identity,
      expectedHeadSha: item.headSha,
      auth,
      payload: { body: "integrated" },
    })
    const result = await new PullRequestActionCoordinator({
      executable,
      env: {
        FAKE_LOG: logPath,
        FAKE_COORDINATOR: "1",
        FAKE_STATE: statePath,
      },
    }).execute(preparedState)
    expect(result).toMatchObject({ status: "confirmed", message: "comment-reconciled" })
    expect(
      commands().filter((command) => command.args.slice(0, 2).join(" ") === "pr comment"),
    ).toHaveLength(1)
    expect(commands().filter((command) => command.args[1] === "graphql")).toHaveLength(2)
  })

  test("validates a reaction target, writes once and re-reads that reactable", async () => {
    writeFileSync(logPath, "")
    const statePath = join(directory, "coordinator-reaction-state")
    rmSync(statePath, { force: true })
    const preparedState = preparePullRequestAction({
      actionId: "integrated-reaction",
      kind: "reaction",
      target: item.identity,
      expectedHeadSha: item.headSha,
      auth,
      payload: {
        subjectId: item.identity.nodeId,
        subjectKind: "item",
        reaction: "HEART",
      },
    })
    const result = await new PullRequestActionCoordinator({
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

  test("uses explicit targets and stdin for user-authored content", async () => {
    writeFileSync(logPath, "")
    expect(
      await executePullRequestMutation(prepared("comment", { body: "$(touch never)" }), {
        executable,
        env: { FAKE_LOG: logPath },
      }),
    ).toEqual({ status: "confirmed", message: "comment-accepted" })
    expect(
      await executePullRequestMutation(prepared("approve", { body: "Aprovado" }), {
        executable,
        env: { FAKE_LOG: logPath },
      }),
    ).toEqual({ status: "confirmed", message: "approve-accepted" })
    expect(commands()[0]).toMatchObject({
      args: ["pr", "comment", "142", "--repo", "equipe/api", "--body-file", "-"],
      stdin: "$(touch never)",
    })
    const approval = commands()[1]
    if (!approval) throw new Error("approval command was not recorded")
    expect(JSON.parse(approval.stdin)).toEqual({
      event: "APPROVE",
      commit_id: item.headSha,
      body: "Aprovado",
    })
  })

  test("adds reactions through GraphQL and replies with a safe link to the selected comment", async () => {
    writeFileSync(logPath, "")
    const commentUrl = `${item.identity.url}#issuecomment-55`
    await executePullRequestMutation(
      prepared("reaction", {
        subjectId: "IC_selected",
        subjectKind: "comment",
        commentUrl,
        reaction: "EYES",
      }),
      { executable, env: { FAKE_LOG: logPath } },
    )
    await executePullRequestMutation(
      prepared("reply", {
        commentId: "IC_selected",
        commentUrl,
        commentAuthor: "ana",
        body: "Vou ajustar.",
      }),
      { executable, env: { FAKE_LOG: logPath } },
    )
    const [reaction, reply] = commands()
    expect(reaction?.args).toEqual(["api", "graphql", "--hostname", "github.com", "--input", "-"])
    expect(JSON.parse(reaction?.stdin ?? "{}").variables).toEqual({
      subjectId: "IC_selected",
      content: "EYES",
    })
    expect(reply).toMatchObject({
      args: ["pr", "comment", "142", "--repo", "equipe/api", "--body-file", "-"],
      stdin: `↳ ${commentUrl}\n\n@ana Vou ajustar.`,
    })
  })

  test("allows an approval with the configurable comment left empty", async () => {
    writeFileSync(logPath, "")
    expect(
      await executePullRequestMutation(prepared("approve", { body: "" }), {
        executable,
        env: { FAKE_LOG: logPath },
      }),
    ).toEqual({ status: "confirmed", message: "approve-accepted" })
    expect(JSON.parse(commands()[0]?.stdin ?? "{}")).toEqual({
      event: "APPROVE",
      commit_id: item.headSha,
      body: "",
    })
  })

  test("pins update and merge to the reviewed head and never adds bypass flags", async () => {
    writeFileSync(logPath, "")
    await executePullRequestMutation(prepared("update-branch"), {
      executable,
      env: { FAKE_LOG: logPath },
    })
    await executePullRequestMutation(prepared("merge", { method: "rebase" }), {
      executable,
      env: { FAKE_LOG: logPath },
    })
    const [update, merge] = commands()
    if (!update || !merge) throw new Error("mutation commands were not recorded")
    expect(JSON.parse(update.stdin)).toEqual({ expected_head_sha: item.headSha })
    expect(merge.args).toContain("--match-head-commit")
    expect(merge.args).toContain(item.headSha)
    expect(merge.args).toContain("--rebase")
    expect(merge.args).not.toContain("--admin")
    expect(merge.args).not.toContain("--delete-branch")
  })

  test("lets GitHub choose queue or auto-merge without forcing a strategy", async () => {
    writeFileSync(logPath, "")
    await executePullRequestMutation(prepared("merge", { method: "squash", mergeQueue: true }), {
      executable,
      env: { FAKE_LOG: logPath },
    })
    const merge = commands()[0]
    expect(merge?.args).not.toContain("--squash")
    expect(merge?.args).toContain("--match-head-commit")
  })

  test("classifies a dispatched timeout as uncertain and does not retry", async () => {
    writeFileSync(logPath, "")
    const result = await executePullRequestMutation(prepared("comment", { body: "once" }), {
      executable,
      timeoutMs: 150,
      env: { FAKE_LOG: logPath, FAKE_TIMEOUT: "1" },
    })
    expect(result).toEqual({ status: "uncertain", reason: "timeout" })
    expect(commands()).toHaveLength(1)
  })

  test("keeps a dispatched PR write uncertain after a connection failure", async () => {
    writeFileSync(logPath, "")
    const result = await executePullRequestMutation(prepared("comment", { body: "once" }), {
      executable,
      env: { FAKE_LOG: logPath, FAKE_NETWORK: "1" },
    })
    expect(result).toEqual({ status: "uncertain", reason: "network" })
    expect(commands()).toHaveLength(1)
  })

  test("classifies excessive output after dispatch as uncertain and does not retry", async () => {
    writeFileSync(logPath, "")
    const result = await executePullRequestMutation(prepared("comment", { body: "once" }), {
      executable,
      maxOutputBytes: 4,
      env: { FAKE_LOG: logPath },
    })
    expect(result).toEqual({ status: "uncertain", reason: "output-limit" })
    expect(commands()).toHaveLength(1)
  })

  test("keeps incomplete input uncertain without retrying the dispatched write", async () => {
    writeFileSync(logPath, "")
    const result = await executePullRequestMutation(
      prepared("comment", { body: "x".repeat(512 * 1024) }),
      {
        executable,
        env: { FAKE_LOG: logPath, FAKE_IGNORE_INPUT: "1" },
      },
    )
    expect(result).toEqual({ status: "uncertain", reason: "input-failed" })
    expect(commands()).toHaveLength(1)
  })

  test("keeps a dispatched write uncertain when its direct reconciliation is invalid", async () => {
    writeFileSync(logPath, "")
    const statePath = join(directory, "invalid-reconciliation-state")
    rmSync(statePath, { force: true })
    const preparedState = preparePullRequestAction({
      actionId: "invalid-reconciliation",
      kind: "comment",
      target: item.identity,
      expectedHeadSha: item.headSha,
      auth,
      payload: { body: "integrated" },
    })
    const result = await new PullRequestActionCoordinator({
      executable,
      env: {
        FAKE_LOG: logPath,
        FAKE_COORDINATOR: "1",
        FAKE_STATE: statePath,
        FAKE_INVALID_RECONCILIATION: "1",
      },
    }).execute(preparedState)
    expect(result).toMatchObject({
      status: "uncertain",
      reason: "accepted-reconciliation-failed",
    })
    expect(
      commands().filter((command) => command.args.slice(0, 2).join(" ") === "pr comment"),
    ).toHaveLength(1)
  })
})
