import "./setup"
import { afterEach, expect, test } from "bun:test"
import { RGBA, type BoxRenderable } from "@opentui/core"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import { COLORS, getUiSettings, updateUiSettings } from "../../packages/core/src/settings/theme"
import { InboxWorkspace } from "../../packages/feature-git/src/InboxWorkspace"
import { IssuesWorkspace } from "../../packages/feature-git/src/IssuesWorkspace"
import { PullRequestsWorkspace } from "../../packages/feature-git/src/PullRequestsWorkspace"

type Dashboard = "pr" | "issue" | "inbox"

let tui: TestRendererSetup | undefined
const settings = getUiSettings()
const demos = {
  pr: process.env.TUIMINAL_GIT_PR_DEMO,
  issue: process.env.TUIMINAL_GIT_ISSUES_DEMO,
  inbox: process.env.TUIMINAL_GIT_INBOX_DEMO,
}

afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  updateUiSettings(settings)
  restoreDemo("TUIMINAL_GIT_PR_DEMO", demos.pr)
  restoreDemo("TUIMINAL_GIT_ISSUES_DEMO", demos.issue)
  restoreDemo("TUIMINAL_GIT_INBOX_DEMO", demos.inbox)
})

function restoreDemo(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
}

async function mount(
  dashboard: Dashboard,
  width: number,
  layout: "framed" | "compact",
  language = "pt-BR",
) {
  const environment = {
    pr: "TUIMINAL_GIT_PR_DEMO",
    issue: "TUIMINAL_GIT_ISSUES_DEMO",
    inbox: "TUIMINAL_GIT_INBOX_DEMO",
  } as const
  process.env[environment[dashboard]] = "1"
  updateUiSettings({ layout, language: language as typeof settings.language })
  const workspace = {
    pr: <PullRequestsWorkspace active />,
    issue: <IssuesWorkspace active />,
    inbox: <InboxWorkspace active />,
  }[dashboard]
  tui = await testRender(workspace, { width, height: 35 })
  const row = {
    pr: "git-pr-row-0",
    issue: "git-issue-row-0",
    inbox: "git-inbox-row-0",
  }[dashboard]
  for (let attempt = 0; attempt < 100; attempt++) {
    await act(async () => Bun.sleep(10))
    await tui.renderOnce()
    if (tui.renderer.root.findDescendantById(row)) return
  }
  throw new Error(`${dashboard} dashboard did not load:\n${tui.captureCharFrame()}`)
}

function node(id: string) {
  const result = tui?.renderer.root.findDescendantById(id)
  if (!result) throw new Error(`Missing ${id}`)
  return result
}

function expectBackground(id: string, color: string) {
  expect((node(id) as BoxRenderable).backgroundColor.equals(RGBA.fromHex(color))).toBe(true)
}

for (const language of ["pt-BR", "en", "es", "ja", "zh-CN", "ko"]) {
  test(`framed PR header packs sections and actions without blank rows: ${language}`, async () => {
    await mount("pr", 220, "framed", language)
    const section = node("git-pr-section-0")
    const sections = node("git-pr-sections")
    const actions = node("git-pr-toggle-preview")
    const query = node("git-pr-query")
    const title = node("git-pr-title")
    expect(actions.screenY).toBe(section.screenY)
    expect(actions.screenX).toBeGreaterThanOrEqual(sections.screenX + sections.width)
    expect(section.screenY).toBe(title.screenY + title.height)
    expect(query.screenY).toBe(section.screenY + 1)
    expect(node("git-pr-list-panel").screenY).toBe(query.screenY + 1)
    expectBackground("git-pr-dashboard", COLORS.panel)
  })

  test(`framed Issues header packs sections and actions without blank rows: ${language}`, async () => {
    await mount("issue", 220, "framed", language)
    const section = node("git-issue-section-0")
    const sections = node("git-issue-sections")
    const actions = node("git-issue-toggle-preview")
    const query = node("git-issue-query")
    const title = node("git-issue-title")
    expect(actions.screenY).toBe(section.screenY)
    expect(actions.screenX).toBeGreaterThanOrEqual(sections.screenX + sections.width)
    expect(section.screenY).toBe(title.screenY + title.height)
    expect(query.screenY).toBe(section.screenY + 1)
    expect(node("git-issue-list-panel").screenY).toBe(query.screenY + 1)
    expectBackground("git-issue-dashboard", COLORS.panel)
  })
}

test("compact PR and Issues headers keep their existing four consecutive rows", async () => {
  await mount("pr", 220, "compact")
  expect(node("git-pr-toggle-preview").screenY).toBe(1)
  expect(node("git-pr-section-0").screenY).toBe(2)
  expect(node("git-pr-query").screenY).toBe(3)
  expect(node("git-pr-list-panel").screenY).toBe(4)
  expectBackground("git-pr-dashboard", COLORS.canvas)
  act(() => tui?.renderer.destroy())
  tui = undefined

  await mount("issue", 220, "compact")
  expect(node("git-issue-toggle-preview").screenY).toBe(1)
  expect(node("git-issue-section-0").screenY).toBe(2)
  expect(node("git-issue-query").screenY).toBe(3)
  expect(node("git-issue-list-panel").screenY).toBe(4)
  expectBackground("git-issue-dashboard", COLORS.canvas)
})

for (const dashboard of ["pr", "issue"] as const) {
  test(`narrow framed ${dashboard} header stacks controls without blank rows`, async () => {
    await mount(dashboard, 120, "framed")
    const title = node(`git-${dashboard}-title`)
    const actions = node(`git-${dashboard}-toggle-preview`)
    const section = node(`git-${dashboard}-section-0`)
    const query = node(`git-${dashboard}-query`)
    expect(actions.screenY).toBe(title.screenY + title.height)
    expect(section.screenY).toBe(actions.screenY + 1)
    expect(query.screenY).toBe(section.screenY + 1)
    expect(node(`git-${dashboard}-list-panel`).screenY).toBe(query.screenY + 1)
  })
}

test("Inbox uses consecutive header rows and the layout-specific dashboard background", async () => {
  await mount("inbox", 140, "framed")
  const title = node("git-inbox-title")
  const sections = node("git-inbox-sections")
  expect(sections.screenY).toBe(title.screenY + title.height)
  expect(node("git-inbox-list-panel").screenY).toBe(sections.screenY + 1)
  expectBackground("git-inbox-dashboard", COLORS.panel)
  act(() => tui?.renderer.destroy())
  tui = undefined

  await mount("inbox", 140, "compact")
  expect(node("git-inbox-title").screenY).toBe(0)
  expect(node("git-inbox-sections").screenY).toBe(1)
  expect(node("git-inbox-list-panel").screenY).toBe(2)
  expectBackground("git-inbox-dashboard", COLORS.canvas)
})
