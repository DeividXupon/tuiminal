import "./setup"
import { afterEach, expect, test } from "bun:test"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act, useState } from "react"
import { getUiSettings, updateUiSettings } from "../../src/core/settings/theme"
import type {
  GitHubCliGuidedTerminalProcess,
  GitHubCliInstallPlan,
  startGitHubCliGuidedTerminal,
} from "../../src/features/git/services/github/installer"
import {
  GitHubAuthenticationPanel,
  GitHubCliRequirementPanel,
} from "../../src/features/git/ui/shared/GitHubCliRequirementPanel"

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

type TerminalOptions = Parameters<typeof startGitHubCliGuidedTerminal>[0]

function terminalFixture(received: string[], starts: () => void, stops: () => void) {
  return (options: TerminalOptions): GitHubCliGuidedTerminalProcess => {
    starts()
    options.onData(new TextEncoder().encode("fixture shell ready\r\n"))
    return {
      pid: 42,
      write: (data) =>
        received.push(typeof data === "string" ? data : new TextDecoder().decode(data)),
      resize: () => undefined,
      stop: stops,
    }
  }
}

async function settle(until: () => boolean) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    await act(async () => Bun.sleep(5))
    await tui?.renderOnce()
    if (until()) return
  }
  throw new Error(`GitHub guidance did not settle:\n${tui?.captureCharFrame()}`)
}

test("missing-gh panel leaves installation to the user and reloads after detection", async () => {
  let terminals = 0
  let stops = 0
  let retries = 0
  let ready = false
  const received: string[] = []
  const startTerminal = terminalFixture(
    received,
    () => {
      terminals += 1
    },
    () => {
      stops += 1
    },
  )

  updateUiSettings({ language: "pt-BR", layout: "compact" })
  tui = await testRender(
    <GitHubCliRequirementPanel
      active
      capabilities={{ available: false, version: null, supported: false, reason: "missing" }}
      onRetry={() => {
        retries += 1
      }}
      installPlan={plan}
      startTerminal={startTerminal}
      verifyInstallation={async () => ready}
      pollIntervalMs={5}
    />,
    { width: 120, height: 26 },
  )
  await tui.renderOnce()

  const frame = tui.captureCharFrame()
  expect(frame).toContain("gh é a ferramenta oficial do GitHub")
  expect(frame).toContain("TERMINAL GUIADO · INSTALAÇÃO DO GH")
  expect(frame).toContain("fixture install gh")
  expect(frame).toContain("[C] Copiar comando")
  expect(frame).not.toContain("[I]")
  expect(terminals).toBe(1)

  await act(async () => tui?.mockInput.pressKey("i"))
  expect(received).toEqual([])
  expect(terminals).toBe(1)

  await act(async () => {
    tui?.mockInput.pressKey("RETURN")
    await Bun.sleep(5)
  })
  await tui.renderOnce()
  expect(tui.renderer.currentFocusedRenderable?.id).toBe("git-gh-guidance-terminal")
  await act(async () => {
    await tui?.mockInput.typeText("fixture install gh")
    tui?.mockInput.pressKey("RETURN")
  })
  expect(received.join("")).toContain("fixture install gh")

  ready = true
  await settle(() => retries === 1)
  expect(tui.captureCharFrame()).toContain("GH INSTALADO")

  act(() => tui?.renderer.destroy())
  tui = undefined
  expect(stops).toBe(1)
})

test("missing-gh panel shows the official guide when no command is detected", async () => {
  const received: string[] = []
  tui = await testRender(
    <GitHubCliRequirementPanel
      active
      capabilities={{ available: false, version: null, supported: false, reason: "missing" }}
      onRetry={() => undefined}
      installPlan={{ ...plan, available: false, command: null }}
      startTerminal={terminalFixture(
        received,
        () => undefined,
        () => undefined,
      )}
      verifyInstallation={async () => false}
      pollIntervalMs={60_000}
    />,
    { width: 74, height: 22 },
  )
  await tui.renderOnce()

  expect(tui.captureCharFrame()).toContain("Comando automático indisponível")
  expect(tui.captureCharFrame()).not.toContain("[I]")
  await act(async () => tui?.mockInput.pressKey("c"))
  expect(received).toEqual([])
})

test("authentication panel teaches login in its terminal and detects completion", async () => {
  let retries = 0
  let authenticated = false
  const received: string[] = []
  tui = await testRender(
    <GitHubAuthenticationPanel
      active
      host="github.example.test"
      onRetry={() => {
        retries += 1
      }}
      startTerminal={terminalFixture(
        received,
        () => undefined,
        () => undefined,
      )}
      verifyAuthentication={async () => authenticated}
      pollIntervalMs={5}
    />,
    { width: 120, height: 26 },
  )
  await tui.renderOnce()

  const frame = tui.captureCharFrame()
  expect(frame).toContain("AUTENTICAÇÃO GITHUB NECESSÁRIA")
  expect(frame).toContain("gh auth login --hostname github.example.test")
  expect(frame).toMatch(/--\s*web/)
  expect(frame).toContain("O Tuiminal não lê nem guarda seu token")
  expect(frame).toContain("LOGIN DO GITHUB")

  await act(async () => {
    tui?.mockInput.pressKey("RETURN")
    await Bun.sleep(5)
  })
  await tui.renderOnce()
  expect(tui.renderer.currentFocusedRenderable?.id).toBe("git-gh-guidance-terminal")
  await act(async () => {
    await tui?.mockInput.typeText("gh auth login --hostname github.example.test --web")
    tui?.mockInput.pressKey("RETURN")
  })
  expect(received.join("")).toContain("gh auth login --hostname github.example.test --web")

  authenticated = true
  await settle(() => retries === 1)
  expect(tui.captureCharFrame()).toContain("LOGIN CONFIRMADO")
})

test("guided terminal forwards emulator responses required by interactive prompts", async () => {
  const received: string[] = []
  let emitOutput: ((data: Uint8Array) => void) | undefined
  tui = await testRender(
    <GitHubAuthenticationPanel
      active
      host="github.example.test"
      onRetry={() => undefined}
      startTerminal={(options) => {
        emitOutput = options.onData
        return {
          pid: 43,
          write: (data) =>
            received.push(typeof data === "string" ? data : new TextDecoder().decode(data)),
          resize: () => undefined,
          stop: () => undefined,
        }
      }}
      verifyAuthentication={async () => false}
      pollIntervalMs={60_000}
    />,
    { width: 120, height: 26 },
  )
  await tui.renderOnce()

  await act(async () => {
    emitOutput?.(new TextEncoder().encode("\u001b[6n"))
    await Bun.sleep(5)
  })

  const escapeSequence = String.fromCharCode(27)
  expect(
    received.some((value) => value.startsWith(`${escapeSequence}[`) && /\d+;\d+R$/.test(value)),
  ).toBe(true)
})

test("stale shell exits cannot detach replacements and a closed shell reopens", async () => {
  const sessions: Array<{
    options: TerminalOptions
    received: string[]
    stops: number
  }> = []
  let setActive: (active: boolean) => void = () => undefined

  function Harness() {
    const [active, updateActive] = useState(true)
    setActive = updateActive
    return (
      <GitHubAuthenticationPanel
        active={active}
        host="github.example.test"
        onRetry={() => undefined}
        startTerminal={(options) => {
          const session = { options, received: [] as string[], stops: 0 }
          sessions.push(session)
          return {
            pid: 44 + sessions.length,
            write: (data) =>
              session.received.push(
                typeof data === "string" ? data : new TextDecoder().decode(data),
              ),
            resize: () => undefined,
            stop: () => {
              session.stops += 1
            },
          }
        }}
        verifyAuthentication={async () => false}
        pollIntervalMs={60_000}
      />
    )
  }

  tui = await testRender(<Harness />, { width: 120, height: 26 })
  await tui.renderOnce()
  expect(sessions).toHaveLength(1)

  await act(async () => setActive(false))
  await tui.renderOnce()
  await act(async () => setActive(true))
  await tui.renderOnce()
  expect(sessions).toHaveLength(2)

  await act(async () => {
    sessions[0]?.options.onExit({ code: null, signal: "SIGTERM", stopped: true })
    await Bun.sleep(1)
    tui?.mockInput.pressKey("RETURN")
    await Bun.sleep(1)
    await tui?.mockInput.typeText("y")
    tui?.mockInput.pressKey("RETURN")
  })
  expect(sessions[1]?.received.join("")).toContain("y")

  await act(async () => {
    sessions[1]?.options.onExit({ code: 0, signal: null, stopped: false })
    await Bun.sleep(1)
  })
  await tui.renderOnce()
  expect(tui.captureCharFrame()).toContain("Reabrir terminal")

  await act(async () => {
    tui?.mockInput.pressKey("RETURN")
    await Bun.sleep(1)
  })
  await tui.renderOnce()
  expect(sessions).toHaveLength(3)
})
