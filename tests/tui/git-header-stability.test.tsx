import "./setup"
import { afterEach, expect, test } from "bun:test"
import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import { getUiSettings, updateUiSettings } from "../../packages/core/src/settings/theme"
import { GitBaseWorkspace } from "../../packages/feature-git/src/GitWorkspace"

const settings = getUiSettings()
let tui: TestRendererSetup | undefined
let repository: string | undefined

afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  updateUiSettings(settings)
  if (repository) rmSync(repository, { recursive: true, force: true })
  repository = undefined
})

function createRepository() {
  const root = mkdtempSync(join(tmpdir(), "tuiminal-header-"))
  repository = root
  const git = (...args: string[]) => execFileSync("git", ["-C", root, ...args], { stdio: "pipe" })
  git("init", "--quiet", "--initial-branch=main")
  git("config", "user.name", "Fixture")
  git("config", "user.email", "fixture@example.test")
  git("config", "commit.gpgSign", "false")
  git("config", "core.hooksPath", join(repository, "no-hooks"))
  for (let index = 0; index < 12; index += 1) {
    writeFileSync(join(repository, `file-${index.toString().padStart(2, "0")}.ts`), "old\n")
  }
  git("add", ".")
  git("commit", "--quiet", "-m", "fixture")
  for (let index = 0; index < 12; index += 1) {
    const content = Array.from(
      { length: index % 2 ? 80 : 1 },
      (_, line) => `export const value${line} = "${"wide".repeat(index * 10)}"`,
    ).join("\n")
    writeFileSync(join(repository, `file-${index.toString().padStart(2, "0")}.ts`), `${content}\n`)
  }
  return repository
}

async function settle() {
  await act(async () => Bun.sleep(10))
  await tui?.renderOnce()
}

async function ready() {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    await settle()
    if (
      tui?.renderer.currentFocusedRenderable?.id === "git-file-list-row-0" &&
      tui.captureCharFrame().includes("WORKTREE") &&
      !tui.captureCharFrame().includes("MONTANDO")
    )
      return
  }
  throw new Error(`Git did not settle: ${tui?.captureCharFrame()}`)
}

function headerSnapshot() {
  const header = tui?.renderer.root.findDescendantById("git-diffs-header")
  const button = tui?.renderer.root.findDescendantById("git-open-local-configuration")
  if (!header || !button || !tui) throw new Error("Missing Git header")
  return {
    headerId: header.id,
    buttonId: button.id,
    y: header.screenY,
    height: header.height,
    line: tui.captureCharFrame().split("\n")[button.screenY],
  }
}

function expectCenteredConfiguration() {
  const header = tui?.renderer.root.findDescendantById("git-diffs-header")
  const button = tui?.renderer.root.findDescendantById("git-open-local-configuration")
  const actions = tui?.renderer.root.findDescendantById("git-action-palette-open")
  if (!header || !button || !actions) throw new Error("Missing Git header controls")
  expect(
    Math.abs(button.screenX + button.width / 2 - header.screenX - header.width / 2),
  ).toBeLessThanOrEqual(0.5)
  expect(actions.screenY).toBe(button.screenY)
  expect(actions.screenX).toBeGreaterThanOrEqual(button.screenX + button.width)
  expect(actions.screenX + actions.width).toBeLessThanOrEqual(header.screenX + header.width)
}

for (const layout of ["compact", "framed"] as const) {
  test.each([26, 36])(
    `Git header remains painted during held arrows: ${layout}/%i`,
    async (height) => {
      updateUiSettings({ layout, language: "pt-BR" })
      tui = await testRender(
        <GitBaseWorkspace
          active
          targetDirectory={createRepository()}
          onOpenLocalConfiguration={() => {}}
        />,
        { width: 120, height },
      )
      await ready()
      const initial = headerSnapshot()
      expect(initial.line).toContain("[Ctrl+P]")
      expect(initial.line).toContain("[?] Ações")
      expect(initial.line).toContain("↑0 ↓0")
      expect(initial.line).not.toMatch(/\bALT\b|[●○]/)
      expect(tui.renderer.root.findDescendantById("git-base-shortcut-footer")).toBeUndefined()
      const workspace = tui.renderer.root.findDescendantById("git-diffs-workspace")
      const files = tui.renderer.root.findDescendantById("git-base-files-panel")
      if (!workspace || !files) throw new Error("Missing Git workspace panels")
      expect(initial.y).toBe(workspace.screenY)
      expect(files.screenY).toBe(initial.y + initial.height)
      expect(files.screenY + files.height).toBe(workspace.screenY + workspace.height)
      expectCenteredConfiguration()
      for (const direction of ["down", "up"] as const) {
        for (let index = 0; index < 11; index += 1) {
          act(() => tui?.mockInput.pressArrow(direction))
          await tui.renderOnce()
          expect(headerSnapshot()).toEqual(initial)
          await settle()
          expect(headerSnapshot()).toEqual(initial)
          expect(tui.renderer.currentFocusedRenderable?.id).toBe(
            `git-file-list-row-${direction === "down" ? index + 1 : 10 - index}`,
          )
        }
      }
      for (const width of [160, 90, 60, 40]) {
        act(() => tui?.resize(width, height))
        await settle()
        expectCenteredConfiguration()
      }
    },
  )
}
