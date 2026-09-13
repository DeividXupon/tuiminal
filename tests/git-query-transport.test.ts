import { afterEach, describe, expect, test } from "bun:test"
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DEFAULT_ISSUE_CONFIG } from "../src/features/git/model/issue/config"
import { DEFAULT_PULL_REQUEST_CONFIG } from "../src/features/git/model/pr/config"
import { IssueSession } from "../src/features/git/services/issue-session"
import { PullRequestSession } from "../src/features/git/services/pr-session"

const fixtures: { root: string; session: IssueSession | PullRequestSession }[] = []

afterEach(() => {
  for (const fixture of fixtures.splice(0)) {
    fixture.session.dispose()
    rmSync(fixture.root, { recursive: true, force: true })
  }
})

function createSession(kind: "pr" | "issue", repositories: string[] = []) {
  const root = mkdtempSync(join(tmpdir(), "tuiminal-query-scope-"))
  const executable = join(root, "gh")
  const log = join(root, "searches.jsonl")
  const configPath = join(root, "config.yaml")
  const defaults = kind === "pr" ? DEFAULT_PULL_REQUEST_CONFIG : DEFAULT_ISSUE_CONFIG
  writeFileSync(
    configPath,
    JSON.stringify({
      ...defaults,
      profiles: {
        [root]: {
          host: "github.example.test",
          repositories,
          sections: [{ id: "all", title: "All", query: "is:open" }],
        },
      },
    }),
  )
  writeFileSync(log, "")
  writeFileSync(
    executable,
    `#!/usr/bin/env bun
import { appendFileSync } from "node:fs"
const args = process.argv.slice(2)
const pageInfo = { hasNextPage: false, endCursor: null }
if (args[0] === "--version") console.log("gh version 2.83.2 (fixture)")
else if (args[0] === "api" && args.at(-1) === "user") {
  console.log(JSON.stringify({ login: "viewer", node_id: "viewer-node" }))
} else if (args[0] === "api" && args[1] === "graphql") {
  const body = JSON.parse(await Bun.stdin.text())
  if (body.query.includes("TuiminalPullRequestOrganizations")) {
    console.log(JSON.stringify({ data: { viewer: { organizations: { pageInfo, nodes: [{ login: "team" }] } } } }))
  } else if (body.query.includes("TuiminalPullRequestCollaborators")) {
    console.log(JSON.stringify({ data: { viewer: { repositories: { pageInfo, nodes: [{ nameWithOwner: "external/project" }] } } } }))
  } else if (typeof body.variables.searchQuery === "string") {
    appendFileSync(process.env.FIXTURE_SEARCH_LOG, JSON.stringify(body.variables.searchQuery) + "\\n")
    console.log(JSON.stringify({ data: { search: { pageInfo, issueCount: 0, nodes: [] } } }))
  } else process.exit(2)
} else process.exit(2)
`,
  )
  chmodSync(executable, 0o755)
  const Session = kind === "pr" ? PullRequestSession : IssueSession
  const session = new Session({
    configPath,
    transport: { executable, env: { FIXTURE_SEARCH_LOG: log } },
  })
  fixtures.push({ root, session })
  return {
    root,
    session,
    queries: () =>
      readFileSync(log, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as string),
  }
}

for (const kind of ["pr", "issue"] as const) {
  describe(`${kind} scoped search transport`, () => {
    test("sends literal phrases and real account qualifiers separately through stdin", async () => {
      const fixture = createSession(kind)
      const query = '"documentation repo:other/project author:@me here"'
      expect(await fixture.session.loadSection(fixture.root, "all", query)).toMatchObject({
        status: "ready",
      })
      expect(fixture.queries().sort()).toEqual(
        [
          `is:${kind} ${query} archived:false user:viewer`,
          `is:${kind} ${query} archived:false org:team`,
          `is:${kind} ${query} archived:false repo:external/project`,
        ].sort(),
      )
    })

    test("preserves a structured repository alongside a quoted repo reference", async () => {
      const fixture = createSession(kind, ["team/project"])
      const query = 'label:"mentions repo:other/project here"'
      expect(await fixture.session.loadSection(fixture.root, "all", query)).toMatchObject({
        status: "ready",
      })
      expect(fixture.queries()).toEqual([`is:${kind} ${query} archived:false repo:team/project`])
    })

    test("does not send any search when the quoted text is unfinished", async () => {
      const fixture = createSession(kind)
      await expect(
        fixture.session.loadSection(fixture.root, "all", '"unfinished repo:other/project'),
      ).rejects.toThrow("Feche as aspas na query do GitHub.")
      expect(fixture.queries()).toEqual([])
    })
  })
}
