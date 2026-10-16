import "./setup"
import { afterEach, beforeEach, expect, test } from "bun:test"
import { execFileSync } from "node:child_process"
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import { getUiSettings, updateUiSettings } from "../../packages/core/src/settings/theme"
import { GitBaseWorkspace } from "../../packages/feature-git/src/GitWorkspace"
import type { GitBaseNavigationTarget } from "../../packages/feature-git/src/hooks/use-git-base-action-palette"
import {
  GIT_DIFFS_CONFIG_PATH,
  loadGitDiffsConfig,
} from "../../packages/feature-git/src/storage/local/config"

let tui: TestRendererSetup | undefined
let repository: string | undefined
const initialSettings = getUiSettings()

beforeEach(() => {
  repository = mkdtempSync(join(tmpdir(), "tuiminal-git-action-palette-tui-"))
  execFileSync("git", ["init", "--quiet", "--initial-branch=main", repository])
  writeFileSync(join(repository, "README.md"), "base\n")
  execFileSync("git", ["-C", repository, "add", "README.md"])
  execFileSync("git", [
    "-C",
    repository,
    "-c",
    "user.name=Tuiminal Test",
    "-c",
    "user.email=tuiminal@example.test",
    "commit",
    "--quiet",
    "-m",
    "base",
  ])
  execFileSync("git", ["-C", repository, "branch", "feature/palette"])
  writeFileSync(join(repository, "README.md"), "base\nchanged\n")
})

afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  updateUiSettings(initialSettings)
  if (repository) rmSync(repository, { recursive: true, force: true })
  repository = undefined
})

async function key(name: string, options: { shift?: boolean; ctrl?: boolean } = {}) {
  act(() => {
    if (name === "escape") tui?.mockInput.pressEscape()
    else if (name === "enter") tui?.mockInput.pressEnter()
    else if (name === "tab") tui?.mockInput.pressTab()
    else tui?.mockInput.pressKey(name, options)
  })
  await act(async () => Bun.sleep(name === "escape" ? 60 : 10))
  await tui?.renderOnce()
}

async function waitFor(check: () => boolean, label: string) {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    await act(async () => Bun.sleep(10))
    await tui?.renderOnce()
    if (check()) return
  }
  throw new Error(`TUI did not reach: ${label}\n${tui?.captureCharFrame()}`)
}

const frame = () => tui?.captureCharFrame() ?? ""
const focusedId = () => tui?.renderer.currentFocusedRenderable?.id ?? ""

async function mount(
  onNavigate?: (target: GitBaseNavigationTarget) => void,
  owners: { onProjectChanged?: () => void; clean?: boolean; layout?: "framed" | "compact" } = {},
) {
  if (!repository) throw new Error("Missing repository")
  if (owners.clean) writeFileSync(join(repository, "README.md"), "base\n")
  updateUiSettings({ layout: owners.layout ?? "framed", language: "pt-BR" })
  tui = await testRender(
    <GitBaseWorkspace
      active
      targetDirectory={repository}
      onNavigate={onNavigate}
      onProjectChanged={owners.onProjectChanged}
    />,
    { width: 140, height: 40 },
  )
  await waitFor(
    () => frame().includes(owners.clean ? "Working tree limpo" : "README.md"),
    "file tree",
  )
  if (!owners.clean)
    await waitFor(() => focusedId().startsWith("git-file-list-row-"), "file tree focus")
}

test("the header [?] button lists Diffs actions with tags and box-owned actions disabled", async () => {
  await mount(() => undefined)
  const header = tui?.renderer.root.findDescendantById("git-diffs-header")
  const actions = tui?.renderer.root.findDescendantById("git-action-palette-open")
  const configure = tui?.renderer.root.findDescendantById("git-open-local-configuration")
  if (!header || !actions || !configure) throw new Error("Missing header actions")
  expect(actions.screenY).toBe(configure.screenY)
  expect(actions.screenX + actions.width).toBeLessThanOrEqual(header.screenX + header.width)
  await act(async () => tui?.mockMouse.click(actions.screenX + 1, actions.screenY))
  await waitFor(() => focusedId() === "git-action-palette", "palette focus")
  const text = frame()
  expect(text).toContain("AÇÕES DO GIT · DIFFS")
  expect(text).toContain("[/] Buscar")
  expect(text).not.toContain("Foco:")
  expect(text).toContain("ARQUIVOS")
  expect(text).toContain("NAVEGAÇÃO")
  const partial = tui?.renderer.root.findDescendantById("git-action-palette-row-partial-stage")
  const stage = tui?.renderer.root.findDescendantById("git-action-palette-row-stage-file")
  expect(partial && stage && stage.screenY < partial.screenY).toBe(true)

  // Global and workspace keys stay inside the palette while it is open.
  await key("c")
  await key("2")
  expect(frame()).toContain("AÇÕES DO GIT · DIFFS")

  await key("/")
  expect(focusedId()).toBe("git-action-palette-search")
  expect(frame()).toContain("Pesquisar ações…")
  expect(frame()).not.toContain("[/] Buscar")
  await key("escape")
  expect(focusedId()).toBe("git-action-palette")
  expect(frame()).toContain("[/] Buscar")

  const search = tui?.renderer.root.findDescendantById("git-action-palette-search")
  if (!search) throw new Error("Missing palette search")
  await act(async () => tui?.mockMouse.click(search.screenX + 1, search.screenY))
  await waitFor(() => frame().includes("Pesquisar ações…"), "mouse search focus")
  expect(focusedId()).toBe("git-action-palette-search")
  expect(frame()).not.toContain("[/] Buscar")
  await act(async () => tui?.mockInput.typeText("parcial"))
  await waitFor(() => frame().includes("⊘ Foque o painel de diff"), "disabled reason")
  await key("escape")
  expect(focusedId()).toBe("git-action-palette")
  expect(frame().split("\n")[search.screenY]).toContain("parcial")
  await key("escape")
  await waitFor(() => !frame().includes("AÇÕES DO GIT · DIFFS"), "palette closed")
  await waitFor(() => focusedId().startsWith("git-file-list-row-"), "restored file focus")
  expect(tui?.renderer.root.findDescendantById("git-action-palette")).toBeFalsy()
})

test("[?] search runs the selected action and routes navigation", async () => {
  const navigation: GitBaseNavigationTarget[] = []
  await mount((target) => navigation.push(target))
  await key("?")
  await waitFor(() => focusedId() === "git-action-palette", "palette focus")
  await key("/")
  await waitFor(() => focusedId() === "git-action-palette-search", "search focus")
  await act(async () => tui?.mockInput.typeText("histórico de"))
  await tui?.renderOnce()
  await waitFor(
    () =>
      Boolean(tui?.renderer.root.findDescendantById("git-action-palette-row-log")) &&
      !tui?.renderer.root.findDescendantById("git-action-palette-row-stage-file"),
    "filtered results",
  )
  await key("enter")
  await waitFor(() => frame().includes("HISTÓRICO DE COMMITS"), "log view")
  expect(tui?.renderer.root.findDescendantById("git-action-palette")).toBeFalsy()

  await key("?")
  await waitFor(() => focusedId() === "git-action-palette", "palette reopened")
  await key("/")
  await act(async () => tui?.mockInput.typeText("pull"))
  await tui?.renderOnce()
  await key("enter")
  await waitFor(() => navigation.length > 0, "navigation")
  expect(navigation).toEqual(["pr"])
})

test("[?] does not open from the Git command input", async () => {
  await mount()
  await key("t")
  await waitFor(() => focusedId() === "git-command-input", "command focus")
  await key("?")
  expect(frame()).not.toContain("AÇÕES DO GIT · DIFFS")
  expect(focusedId()).toBe("git-command-input")
})

test.each([
  ["git-base-files-panel", false],
  ["git-base-history", false],
  ["git-base-diff", false],
  ["git-base-files-panel", true],
  ["git-base-history", true],
] as const)(
  "shortcuts activate after clicking %s from the command input (clean: %s)",
  async (id, clean) => {
    await mount(undefined, { clean })
    if (!clean)
      await waitFor(() => Boolean(tui?.renderer.root.findDescendantById("git-base-diff")), "diff")
    await key("t")
    await waitFor(() => focusedId() === "git-command-input", "command focus")
    const target = tui?.renderer.root.findDescendantById(id)
    if (!target) throw new Error(`Missing ${id}`)
    await act(async () =>
      tui?.mockMouse.click(target.screenX + 2, target.screenY + target.height - 2),
    )
    await tui?.renderOnce()
    await key("?")
    await waitFor(() => focusedId() === "git-action-palette", `palette after clicking ${id}`)
    await key("escape")
    await key("m")
    await waitFor(() => focusedId() === "git-box-selection", `box selection after clicking ${id}`)
  },
)

test.each(["framed", "compact"] as const)(
  "[?] and [M] activate from the focused diff in the %s layout",
  async (layout) => {
    await mount(undefined, { layout })
    await waitFor(() => Boolean(tui?.renderer.root.findDescendantById("git-base-diff")), "diff")
    await key("enter")
    await waitFor(() => focusedId() === "git-base-diff", "diff focus")
    await key("?")
    await waitFor(() => focusedId() === "git-action-palette", "palette focus from diff")
    await key("escape")
    await waitFor(() => focusedId() === "git-base-diff", "restored diff focus")
    await key("m")
    await waitFor(() => focusedId() === "git-box-selection", "box selection from diff")
    expect(
      tui?.renderer.root.findDescendantById("git-box-preview-focus-selection-tint"),
    ).toBeTruthy()
    await key("escape")
    await waitFor(() => focusedId() === "git-base-diff", "restored diff focus after selection")
  },
)

test("[M] chooses a box with directional keys and focuses it with Enter", async () => {
  await mount()
  await key("m")
  await waitFor(
    () => Boolean(tui?.renderer.root.findDescendantById("git-box-files-focus-selection-tint")),
    "files selected",
  )
  expect(focusedId()).toBe("git-box-selection")
  expect(tui?.renderer.root.findDescendantById("git-box-preview-focus-selection-dim")).toBeTruthy()
  expect(tui?.renderer.root.findDescendantById("git-box-terminal-focus-selection-dim")).toBeTruthy()
  expect(tui?.renderer.root.findDescendantById("git-box-files-focus-selection-prompt")).toBeTruthy()

  await key("l")
  expect(tui?.renderer.root.findDescendantById("git-box-preview-focus-selection-tint")).toBeTruthy()
  await key("j")
  expect(
    tui?.renderer.root.findDescendantById("git-box-terminal-focus-selection-tint"),
  ).toBeTruthy()
  await key("enter")
  await waitFor(() => focusedId() === "git-command-input", "terminal focus")
  expect(tui?.renderer.root.findDescendantById("git-box-files-focus-selection")).toBeFalsy()

  await key("escape")
  await key("m")
  await waitFor(
    () => Boolean(tui?.renderer.root.findDescendantById("git-box-files-focus-selection")),
    "selection reopened",
  )
  await key("escape")
  await waitFor(
    () => !tui?.renderer.root.findDescendantById("git-box-files-focus-selection"),
    "selection cancelled",
  )
})

test("box selection is also reachable from the palette", async () => {
  await mount()
  await key("?")
  await waitFor(() => focusedId() === "git-action-palette", "palette focus")
  await key("/")
  await act(async () => tui?.mockInput.typeText("escolher box"))
  await tui?.renderOnce()
  await key("enter")
  await waitFor(() => focusedId() === "git-box-selection", "box selection focus")
  expect(tui?.renderer.root.findDescendantById("git-box-files-focus-selection-tint")).toBeTruthy()
})

test("[?] side panel switches the observed local branch", async () => {
  await mount()
  await key("?")
  await waitFor(
    () =>
      Boolean(tui?.renderer.root.findDescendantById("git-action-palette-side-branches-row-main")),
    "branch list",
  )
  const actions = tui?.renderer.root.findDescendantById("git-action-palette-actions")
  const side = tui?.renderer.root.findDescendantById("git-action-palette-side")
  if (!actions || !side) throw new Error("Missing palette panels")
  // The branch column takes one third of the shared width.
  expect(Math.abs(side.width * 2 - actions.width)).toBeLessThanOrEqual(3)
  expect(frame()).toContain("BRANCH OBSERVADA")
  expect(frame()).toContain("main · atual")

  await key("tab")
  // The current branch is unavailable, so the first selectable branch is preselected.
  await key("enter")
  await waitFor(() => !tui?.renderer.root.findDescendantById("git-action-palette"), "closed")
  await waitFor(
    () =>
      execFileSync("git", ["-C", repository ?? "", "branch", "--show-current"])
        .toString()
        .trim() === "feature/palette",
    "branch switched",
  )
  await waitFor(() => frame().includes("feature/palette"), "header branch")
  await waitFor(() => focusedId().startsWith("git-file-list-row-"), "restored focus")
})

test("[?] keeps the current branch unavailable in the side panel", async () => {
  await mount()
  await key("?")
  await waitFor(
    () =>
      Boolean(tui?.renderer.root.findDescendantById("git-action-palette-side-branches-row-main")),
    "branch list",
  )
  await key("tab")
  await key("k")
  await key("enter")
  expect(tui?.renderer.root.findDescendantById("git-action-palette")).toBeTruthy()
  expect(
    execFileSync("git", ["-C", repository ?? "", "branch", "--show-current"])
      .toString()
      .trim(),
  ).toBe("main")
})

test("versioned projects sit above branches with equal heights and select a Diffs project", async () => {
  const scanRoot = mkdtempSync(join(tmpdir(), "tuiminal-git-action-palette-scan-"))
  const other = join(scanRoot, "other-project")
  execFileSync("git", ["init", "--quiet", "--initial-branch=main", other])
  const previousRoots = process.env.TUIMINAL_PROJECT_ROOTS
  process.env.TUIMINAL_PROJECT_ROOTS = scanRoot
  let changed = 0
  try {
    await mount(undefined, { onProjectChanged: () => (changed += 1) })
    await key("?")
    const otherRow = `git-action-palette-side-projects-row-${other}`
    await waitFor(
      () =>
        Boolean(tui?.renderer.root.findDescendantById(otherRow)) &&
        Boolean(tui?.renderer.root.findDescendantById("git-action-palette-side-branches-row-main")),
      "projects and branches",
    )
    const projects = tui?.renderer.root.findDescendantById("git-action-palette-side-projects")
    const branches = tui?.renderer.root.findDescendantById("git-action-palette-side-branches")
    if (!projects || !branches) throw new Error("Missing side blocks")
    expect(projects.screenY).toBeLessThan(branches.screenY)
    expect(Math.abs(projects.height - branches.height)).toBeLessThanOrEqual(1)
    expect(frame()).toContain("PROJETOS VERSIONADOS")
    expect(frame()).toContain("other-project")
    expect(frame()).not.toContain("Adicionar projeto")

    // Select explicitly: branches can load before project discovery finishes.
    await key("/")
    await act(async () => tui?.mockInput.typeText("other-project"))
    await waitFor(() => !frame().includes("feature/palette"), "filtered side panel")
    await key("escape")
    await key("tab")
    await key("enter")
    await waitFor(() => changed === 1, "project change")
    expect(Object.values(loadGitDiffsConfig().config.profiles)[0]?.repositoryRoot).toBe(
      realpathSync(other),
    )
    expect(tui?.renderer.root.findDescendantById("git-action-palette")).toBeFalsy()
  } finally {
    if (previousRoots === undefined) delete process.env.TUIMINAL_PROJECT_ROOTS
    else process.env.TUIMINAL_PROJECT_ROOTS = previousRoots
    rmSync(GIT_DIFFS_CONFIG_PATH, { force: true })
    rmSync(scanRoot, { recursive: true, force: true })
  }
})
