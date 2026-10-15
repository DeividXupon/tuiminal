import "./setup"
import { afterEach, expect, spyOn, test } from "bun:test"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act, useState } from "react"
import { getUiSettings, updateUiSettings } from "../../packages/core/src/settings/theme"
import { translateUi } from "../../packages/core/src/i18n/index"
import { GitViewer } from "../../packages/feature-git/src/GitFeatureWorkspace"
import { GitNavigationHeader } from "../../packages/feature-git/src/ui/GitNavigationHeader"
import {
  GitNavigationProvider,
  useGitHubNavigationIdentity,
  useGitHubNavigationReport,
} from "../../packages/feature-git/src/ui/GitNavigationContext"
import type { GitWorkspaceTab } from "../../packages/feature-git/src/model/workspace"
import * as auth from "../../packages/feature-git/src/services/github/auth"

const settings = getUiSettings()
const demoKeys = ["TUIMINAL_GIT_PR_DEMO", "TUIMINAL_GIT_ISSUES_DEMO", "TUIMINAL_GIT_INBOX_DEMO"]
const environment = demoKeys.map((key) => process.env[key])
let tui: TestRendererSetup | undefined
const cleanups: Array<() => void> = []
afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  for (const cleanup of cleanups.splice(0)) cleanup()
  updateUiSettings(settings)
  demoKeys.forEach((key, index) => {
    const value = environment[index]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  })
})

function node(id: string) {
  const target = tui?.renderer.root.findDescendantById(id)
  if (!target) throw new Error(`Missing ${id}:\n${tui?.captureCharFrame()}`)
  return target
}

async function click(id: string) {
  const target = node(id)
  await act(async () => tui?.mockMouse.click(target.screenX + 1, target.screenY))
  await tui?.renderOnce()
}

for (const layout of ["compact", "framed"] as const) {
  test.each([120, 60, 40, 30])(
    `${layout} navigation keeps both groups readable at %i columns`,
    async (width) => {
      updateUiSettings({ layout, language: "pt-BR" })
      const selected: GitWorkspaceTab[] = []
      let toggles = 0
      tui = await testRender(
        <GitNavigationHeader
          localRoot="C:\\projects\\tuiminal"
          identity={{ host: "github.com", viewerLogin: "fixture" }}
          selected="base"
          localMode="diffs"
          onSelect={(tab) => selected.push(tab)}
          onToggleMode={() => toggles++}
        />,
        { width, height: 12 },
      )
      await tui.renderOnce()
      const frame = tui.captureCharFrame()
      expect(frame).toContain("LOCAL · …/tuiminal")
      expect(frame).toContain("GITHUB · @fixture")
      expect(frame).toContain("[C] DIFFS")
      const local = node("git-navigation-local")
      const github = node("git-navigation-github")
      if (width >= 60) {
        expect(local.screenY).toBe(github.screenY)
        expect(node("git-navigation-header").height).toBe(2)
        expect(frame.split("\n")[0]).toContain("│")
        expect(frame.split("\n")[1]).toContain("│")
      } else {
        expect(github.screenY).toBeGreaterThan(local.screenY)
      }
      for (const id of [
        "git-tab-base",
        "git-mode-compare",
        "git-tab-pr",
        "git-tab-issues",
        "git-tab-inbox",
      ]) {
        const control = node(id)
        expect(control.screenX + control.width).toBeLessThanOrEqual(width)
        expect(frame.split("\n")[control.screenY]?.trim().length).toBeGreaterThan(0)
        await click(id)
      }
      expect(selected).toEqual(["base", "pr", "issues", "inbox"])
      expect(toggles).toBe(1)
    },
  )
}

test.each(["pt-BR", "en", "es", "ja", "zh-CN", "ko"] as const)(
  "navigation fits translated labels and Unicode context in %s",
  async (language) => {
    updateUiSettings({ language })
    tui = await testRender(
      <GitNavigationHeader
        localRoot="/workspace/開発🧪[Ctrl+C]"
        identity={{ host: "git.example.test", viewerLogin: "long-fixture-account-name" }}
        selected="issues"
        localMode="compare"
        onSelect={() => {}}
        onToggleMode={() => {}}
      />,
      { width: 80, height: 10 },
    )
    await tui.renderOnce()
    expect(tui.captureCharFrame()).toContain(translateUi("[C] COMPARAR"))
    expect(tui.captureCharFrame()).toContain(translateUi("LOCAL"))
    expect(node("git-tab-inbox").screenX + node("git-tab-inbox").width).toBeLessThanOrEqual(80)
    const leftWidth = node("git-navigation-local").width
    act(() => tui?.resize(40, 12))
    await tui.renderOnce()
    expect(node("git-navigation-github").screenY).toBeGreaterThan(
      node("git-navigation-local").screenY,
    )
    act(() => tui?.resize(80, 10))
    await tui.renderOnce()
    expect(node("git-navigation-local").width).toBe(leftWidth)
  },
)

test("header follows the active remote identity, local target and configuration revision", async () => {
  type Dashboard = Parameters<typeof useGitHubNavigationReport>[2]
  const first = { status: "ready", auth: { host: "github.com", viewerLogin: "first" } }
  let setTab!: (tab: GitWorkspaceTab) => void
  let setRoot!: (root: string) => void
  let setRevision!: (revision: number) => void
  let setPr!: (state: Dashboard) => void
  let setIssue!: (state: Dashboard) => void
  function Content() {
    const [tab, updateTab] = useState<GitWorkspaceTab>("pr")
    const [root, updateRoot] = useState("/projects/first-project")
    const [revision, updateRevision] = useState(0)
    const [pr, updatePr] = useState<Dashboard>(first)
    const [issue, updateIssue] = useState<Dashboard>({
      status: "ready",
      auth: { host: "git.example.test", viewerLogin: "second" },
    })
    setTab = updateTab
    setRoot = updateRoot
    setRevision = updateRevision
    setPr = updatePr
    setIssue = updateIssue
    useGitHubNavigationReport("pr", tab === "pr", pr, revision)
    useGitHubNavigationReport("issues", tab === "issues", issue, revision)
    useGitHubNavigationReport(
      "inbox",
      tab === "inbox",
      { status: "ready", host: "github.com", viewerLogin: "inbox-user" },
      revision,
    )
    return (
      <GitNavigationHeader
        localRoot={root}
        identity={useGitHubNavigationIdentity(tab, revision)}
        selected={tab}
        localMode="diffs"
        onSelect={updateTab}
        onToggleMode={() => {}}
      />
    )
  }
  tui = await testRender(
    <GitNavigationProvider>
      <Content />
    </GitNavigationProvider>,
    { width: 120, height: 12 },
  )
  async function update(run: () => void) {
    await act(async () => run())
    await tui?.renderOnce()
  }
  await tui.renderOnce()
  expect(tui.captureCharFrame()).toContain("GITHUB · @first")
  await update(() =>
    setIssue({ status: "ready", auth: { host: "github.com", viewerLogin: "hidden" } }),
  )
  expect(tui.captureCharFrame()).toContain("GITHUB · @first")
  await update(() => setTab("issues"))
  expect(tui.captureCharFrame()).toContain("GITHUB · @hidden")
  await update(() =>
    setIssue({ status: "ready", auth: { host: "git.example.test", viewerLogin: "second" } }),
  )
  expect(tui.captureCharFrame()).toContain("GITHUB · @second · git.example.test")
  await update(() => {
    setTab("base")
    setRoot("/elsewhere/next-project")
  })
  expect(tui.captureCharFrame()).toContain("LOCAL · …/next-project")
  expect(tui.captureCharFrame()).toContain("GITHUB · @second")
  await update(() => setTab("inbox"))
  expect(tui.captureCharFrame()).toContain("GITHUB · @inbox-user")
  await update(() => setTab("pr"))
  await update(() => setRevision(1))
  expect(tui.captureCharFrame()).toContain("GITHUB · —")
  await update(() => setPr({ status: "loading" }))
  expect(tui.captureCharFrame()).toContain("GITHUB · —")
  await update(() =>
    setPr({ status: "ready", auth: { host: "github.com", viewerLogin: "new-account" } }),
  )
  expect(tui.captureCharFrame()).toContain("GITHUB · @new-account")
  await update(() => setTab("base"))
  await update(() => setRevision(2))
  await update(() => setTab("pr"))
  expect(tui.captureCharFrame()).toContain("GITHUB · —")
  await update(() => setPr({ status: "loading" }))
  expect(tui.captureCharFrame()).toContain("GITHUB · —")
  await update(() =>
    setPr({ status: "ready", auth: { host: "github.com", viewerLogin: "new-account" } }),
  )
  expect(tui.captureCharFrame()).toContain("GITHUB · @new-account")
  await update(() => setPr({ status: "loading" }))
  expect(tui.captureCharFrame()).toContain("GITHUB · @new-account")
  await update(() => setPr({ status: "authentication" }))
  expect(tui.captureCharFrame()).toContain("GITHUB · —")
})

test("local navigation stays offline and remote demo tabs publish their fixture account", async () => {
  for (const key of demoKeys) process.env[key] = "1"
  const capabilities = spyOn(auth, "detectGhCapabilities").mockRejectedValue(
    new Error("Unexpected GitHub I/O"),
  )
  const viewer = spyOn(auth, "loadGhAuthContext").mockRejectedValue(
    new Error("Unexpected authentication I/O"),
  )
  cleanups.push(
    () => capabilities.mockRestore(),
    () => viewer.mockRestore(),
  )
  tui = await testRender(<GitViewer active />, { width: 120, height: 32 })
  await act(async () => Bun.sleep(30))
  await tui.renderOnce()
  expect(tui.captureCharFrame()).toContain("GITHUB · —")
  for (const tab of ["pr", "issues", "inbox"]) {
    await click(`git-tab-${tab}`)
    expect(tui.captureCharFrame()).toContain("GITHUB · @demo")
  }
  await click("git-tab-base")
  expect(tui.captureCharFrame()).toContain("GITHUB · @demo")
  await click("git-mode-compare")
  expect(tui.captureCharFrame()).toContain("[C] COMPARAR")
  expect(capabilities).not.toHaveBeenCalled()
  expect(viewer).not.toHaveBeenCalled()
})
