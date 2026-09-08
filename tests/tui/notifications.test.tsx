import "./setup"
import { afterEach, expect, test } from "bun:test"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { createServer } from "node:http"
import type { AddressInfo } from "node:net"
import { unlink } from "node:fs/promises"
import { act, useEffect, useRef, useState } from "react"
import {
  NotificationProvider,
  useNotifications,
  type NotificationInput,
} from "../../src/shared/notifications/index"
import { getUiSettings, updateUiSettings } from "../../src/core/settings/theme"
import { App } from "../../src/app/App"
import { HttpClient } from "../../src/features/http"
import { DatabaseConnectionModal } from "../../src/features/database/ui/DatabaseConnectionModal"
import { useRunnerNotifications } from "../../src/features/runner/hooks/use-runner-notifications"

let tui: TestRendererSetup | undefined
const initialSettings = getUiSettings()
const initialOnlyTab = process.env.TUIMINAL_ONLY_TAB
const initialGitHubExecutable = process.env.TUIMINAL_GH_EXECUTABLE
const initialGitDemo = process.env.TUIMINAL_GIT_PR_DEMO

function NotificationHarness({ notifications }: { notifications: NotificationInput[] }) {
  const { notify } = useNotifications()
  const sent = useRef(false)
  useEffect(() => {
    if (sent.current) return
    sent.current = true
    for (const notification of notifications) notify(notification)
  }, [notifications, notify])
  return <input id="notification-focus-owner" value="campo permanece focado" />
}

function RunnerNotificationHarness() {
  const [notice, setNotice] = useState("")
  useRunnerNotifications(notice, null, null)
  useEffect(() => setNotice("Comando salvo: teste"), [])
  return <text content="Runner adapter" />
}

async function renderNotifications(
  notifications: NotificationInput[],
  dimensions = { width: 90, height: 32 },
) {
  tui = await testRender(
    <NotificationProvider>
      <NotificationHarness notifications={notifications} />
    </NotificationProvider>,
    dimensions,
  )
  const input = tui.renderer.root.findDescendantById("notification-focus-owner")
  act(() => input?.focus())
  await act(async () => Bun.sleep(10))
  await tui.renderOnce()
}

async function click(id: string) {
  if (!tui) throw new Error("TUI not mounted")
  const target = tui.renderer.root.findDescendantById(id)
  if (!target) throw new Error(`Missing mouse target: ${id}`)
  await act(async () => {
    await tui?.mockMouse.click(target.screenX, target.screenY)
  })
  await tui.renderOnce()
}

async function press(id: string) {
  const target = tui?.renderer.root.findDescendantById(id) as { press?: () => void } | undefined
  if (!target?.press) throw new Error(`Missing press target: ${id}`)
  await act(async () => {
    target.press?.()
    await Bun.sleep(5)
  })
  await tui?.renderOnce()
}

async function settle(until: () => boolean) {
  if (!tui) throw new Error("TUI not mounted")
  for (let attempt = 0; attempt < 120; attempt += 1) {
    await act(async () => Bun.sleep(10))
    await tui.renderOnce()
    if (until()) return
  }
  throw new Error(`Notification TUI did not settle:\n${tui.captureCharFrame()}`)
}

afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  updateUiSettings(initialSettings)
  if (initialOnlyTab === undefined) delete process.env.TUIMINAL_ONLY_TAB
  else process.env.TUIMINAL_ONLY_TAB = initialOnlyTab
  if (initialGitHubExecutable === undefined) delete process.env.TUIMINAL_GH_EXECUTABLE
  else process.env.TUIMINAL_GH_EXECUTABLE = initialGitHubExecutable
  if (initialGitDemo === undefined) delete process.env.TUIMINAL_GIT_PR_DEMO
  else process.env.TUIMINAL_GIT_PR_DEMO = initialGitDemo
})

test("floating stack presents every severity, caps at three and never steals focus", async () => {
  await renderNotifications([
    { source: "Banco", kind: "info", message: "Primeira mensagem", durationMs: null },
    { source: "Git", kind: "success", message: "Operação concluída", durationMs: null },
    { source: "Runner", kind: "warning", message: "Health check expirou", durationMs: null },
    { source: "HTTP", kind: "error", message: "Conexão recusada", durationMs: null },
  ])

  const frame = tui?.captureCharFrame() ?? ""
  expect(frame).not.toContain("Primeira mensagem")
  expect(frame).toContain("SUCESSO · Git")
  expect(frame).toContain("AVISO · Runner")
  expect(frame).toContain("ERRO · HTTP")
  expect(tui?.renderer.currentFocusedRenderable?.id).toBe("notification-focus-owner")

  await click("app-notification-dismiss-1")
  expect(tui?.captureCharFrame()).not.toContain("Health check expirou")
  expect(tui?.renderer.currentFocusedRenderable?.id).toBe("notification-focus-owner")
})

test("transient notification closes automatically while an error remains", async () => {
  await renderNotifications([
    { source: "Git", kind: "success", message: "Salvo", durationMs: 25 },
    { source: "HTTP", kind: "error", message: "Falha persistente", durationMs: null },
  ])
  expect(tui?.captureCharFrame()).toContain("Salvo")
  expect(tui?.captureCharFrame()).toContain("Falha persistente")

  await act(async () => Bun.sleep(50))
  await tui?.renderOnce()
  expect(tui?.captureCharFrame()).not.toContain("Salvo")
  expect(tui?.captureCharFrame()).toContain("Falha persistente")
})

test("compact narrow viewport shows only the newest card within terminal bounds", async () => {
  updateUiSettings({ layout: "compact" })
  await renderNotifications(
    [
      { source: "Runner", kind: "warning", message: "Aviso anterior", durationMs: null },
      { source: "Terminal", kind: "error", message: "Erro mais recente", durationMs: null },
    ],
    { width: 40, height: 18 },
  )

  const frame = tui?.captureCharFrame() ?? ""
  expect(frame).not.toContain("Aviso anterior")
  expect(frame).toContain("ERRO · Terminal")
  const card = tui?.renderer.root.findDescendantById("app-notification-0")
  expect((card?.screenX ?? -1) + (card?.width ?? 0)).toBeLessThanOrEqual(40)
})

test("Database connection events reach the global center", async () => {
  const databasePath = `${process.env.TUIMINAL_WORKDIR}/database.sqlite`
  try {
    tui = await testRender(
      <NotificationProvider>
        <DatabaseConnectionModal
          open
          connections={[]}
          selectedConnectionId={null}
          startInForm
          onClose={() => undefined}
          onSelect={() => undefined}
          onCreated={() => undefined}
          onDeleted={() => undefined}
        />
      </NotificationProvider>,
      { width: 120, height: 32 },
    )
    await settle(() => tui?.renderer.currentFocusedRenderable?.id === "db-connection-name")
    await press("db-connection-driver-sqlite")
    await press("db-connection-test")
    await settle(() => tui?.captureCharFrame().includes("Banco · Conexão") ?? false)
    expect(tui.captureCharFrame()).toContain("ERRO · Banco · Conexão")
  } finally {
    await unlink(databasePath).catch(() => undefined)
  }
})

test("Git PR failures reach the global center", async () => {
  process.env.TUIMINAL_ONLY_TAB = "git"
  process.env.TUIMINAL_GH_EXECUTABLE = "/does/not/exist/gh"
  delete process.env.TUIMINAL_GIT_PR_DEMO
  tui = await testRender(<App />, { width: 120, height: 30 })
  await settle(() => tui?.captureCharFrame().includes("GIT · BASE LOCAL") ?? false)
  act(() => tui?.mockInput.pressKey("2"))
  await settle(() => tui?.captureCharFrame().includes("ERRO · Git · PR") ?? false)
})

test("Runner events reach the global center", async () => {
  tui = await testRender(
    <NotificationProvider>
      <RunnerNotificationHarness />
    </NotificationProvider>,
    { width: 120, height: 30 },
  )
  await settle(() => tui?.captureCharFrame().includes("SUCESSO · Runner") ?? false)
})

test("HTTP response completion reaches the global center", async () => {
  const server = createServer((_request, response) => {
    response.writeHead(204)
    response.end()
  })
  server.listen(0, "127.0.0.1")
  await new Promise<void>((resolve) => server.once("listening", resolve))
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/health`
  try {
    tui = await testRender(
      <NotificationProvider>
        <HttpClient active initialUrlRequest={{ id: 1, url }} />
      </NotificationProvider>,
      { width: 120, height: 30 },
    )
    await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-url-input")
    await act(async () => {
      tui?.mockInput.pressEnter()
      await Bun.sleep(80)
    })
    await settle(() => tui?.captureCharFrame().includes("SUCESSO · HTTP") ?? false)
  } finally {
    server.closeAllConnections()
    if (server.listening) {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      )
    }
  }
})

test("Free Terminal completion reaches the global center", async () => {
  process.env.TUIMINAL_ONLY_TAB = "terminal"
  tui = await testRender(<App />, { width: 120, height: 30 })
  await settle(() => Boolean(tui?.renderer.root.findDescendantById("terminal-command-input")))
  act(() => tui?.renderer.root.findDescendantById("terminal-command-input")?.focus())
  await act(async () => tui?.mockInput.typeText("true"))
  act(() => tui?.mockInput.pressEnter())
  await settle(() => tui?.captureCharFrame().includes("SUCESSO · Terminal") ?? false)
})
