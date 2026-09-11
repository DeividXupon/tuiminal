import "./setup"
import { afterEach, expect, test } from "bun:test"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import type {
  GitHubCliInstallerProcess,
  GitHubCliInstallPlan,
} from "../../src/features/git/services/github/installer"
import { GitHubCliRequirementPanel } from "../../src/features/git/ui/shared/GitHubCliRequirementPanel"
import { getUiSettings, updateUiSettings } from "../../src/core/settings/theme"

let tui: TestRendererSetup | undefined
const initialSettings = getUiSettings()

afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  updateUiSettings(initialSettings)
})

const plan: GitHubCliInstallPlan = {
  available: true,
  manager: "Fixture",
  displayCommand: "fixture install gh",
  command: ["fixture", "install", "gh"],
  guideUrl: "https://github.com/cli/cli#installation",
}

test("missing-gh panel explains, installs in its terminal and reloads automatically", async () => {
  let starts = 0
  let retries = 0
  const startInstaller = (
    _plan: GitHubCliInstallPlan,
    options: {
      columns: number
      rows: number
      onData: (data: Uint8Array) => void
      onExit: (result: { code: number | null; signal: string | null; stopped: boolean }) => void
    },
  ): GitHubCliInstallerProcess => {
    starts += 1
    options.onData(new TextEncoder().encode("fixture installed\r\n"))
    queueMicrotask(() => options.onExit({ code: 0, signal: null, stopped: false }))
    return {
      pid: 42,
      write: () => undefined,
      resize: () => undefined,
      stop: () => undefined,
    }
  }

  updateUiSettings({ language: "pt-BR", layout: "compact" })
  tui = await testRender(
    <GitHubCliRequirementPanel
      active
      capabilities={{ available: false, version: null, supported: false, reason: "missing" }}
      onRetry={() => {
        retries += 1
      }}
      installPlan={plan}
      startInstaller={startInstaller}
      verifyInstallation={async () => true}
    />,
    { width: 120, height: 26 },
  )
  await tui.renderOnce()

  expect(tui.captureCharFrame()).toContain("gh é a ferramenta oficial do GitHub")
  expect(tui.captureCharFrame()).toContain("INSTALAÇÃO DO GH")
  expect(tui.captureCharFrame()).toContain("fixture install gh")

  await act(async () => {
    tui?.mockInput.pressKey("i")
    await Bun.sleep(20)
  })
  await tui.renderOnce()

  expect(starts).toBe(1)
  expect(retries).toBe(1)
  expect(tui.captureCharFrame()).toContain("GH INSTALADO")
})

test("missing-gh panel never starts an unavailable installer", async () => {
  let starts = 0
  tui = await testRender(
    <GitHubCliRequirementPanel
      active
      capabilities={{ available: false, version: null, supported: false, reason: "missing" }}
      onRetry={() => undefined}
      installPlan={{ ...plan, available: false, command: null }}
      startInstaller={() => {
        starts += 1
        throw new Error("must not run")
      }}
    />,
    { width: 74, height: 22 },
  )
  await tui.renderOnce()
  await act(async () => tui?.mockInput.pressKey("i"))
  await tui.renderOnce()

  expect(starts).toBe(0)
  expect(tui.captureCharFrame()).toContain("Instalador automático indisponível")
})
