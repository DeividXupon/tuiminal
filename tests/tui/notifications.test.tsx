import "./setup"
import { afterEach, expect, spyOn, test } from "bun:test"
import { RGBA, type BoxRenderable } from "@opentui/core"
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
} from "../../packages/core/src/notifications/index"
import { NOTIFICATION_ANIMATION_TIMING } from "../../packages/core/src/notifications/model"
import { COLORS, getUiSettings, updateUiSettings } from "../../packages/core/src/settings/theme"
import { BRAND_COLOR } from "../../packages/core/src/ui/brand"
import { App } from "../../apps/cli/src/App"
import { HttpClient } from "../../packages/feature-http/src"
import { DatabaseConnectionModal } from "../../packages/feature-database/src/ui/DatabaseConnectionModal"
import { useRunnerNotifications } from "../../packages/feature-runner/src/hooks/use-runner-notifications"

let tui: TestRendererSetup | undefined
const initialSettings = getUiSettings()
const initialOnlyTab = process.env.TUIMINAL_ONLY_TAB
const initialGitHubExecutable = process.env.TUIMINAL_GH_EXECUTABLE
const initialGitDemo = process.env.TUIMINAL_GIT_PR_DEMO

function NotificationHarness({
  notifications,
  onReady,
}: {
  notifications: NotificationInput[]
  onReady?: ((notify: ReturnType<typeof useNotifications>["notify"]) => void) | undefined
}) {
  const { notify } = useNotifications()
  const sent = useRef(false)
  useEffect(() => onReady?.(notify), [notify, onReady])
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
  onReady?: (notify: ReturnType<typeof useNotifications>["notify"]) => void,
) {
  tui = await testRender(
    <NotificationProvider>
      <NotificationHarness notifications={notifications} onReady={onReady} />
    </NotificationProvider>,
    dimensions,
  )
  const input = tui.renderer.root.findDescendantById("notification-focus-owner")
  act(() => input?.focus())
  await act(async () => Bun.sleep(NOTIFICATION_ANIMATION_TIMING.enterMs + 40))
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
    { source: "Banco", kind: "info", message: "Primeira mensagem" },
    { source: "Git", kind: "success", message: "Operação concluída" },
    { source: "Runner", kind: "warning", message: "Health check expirou" },
    { source: "HTTP", kind: "error", message: "Conexão recusada" },
  ])

  const frame = tui?.captureCharFrame() ?? ""
  expect(frame).not.toContain("Primeira mensagem")
  expect(frame).toContain("SUCESSO · Git")
  expect(frame).toContain("AVISO · Runner")
  expect(frame).toContain("ERRO · HTTP")
  expect(tui?.renderer.currentFocusedRenderable?.id).toBe("notification-focus-owner")

  await click("app-notification-dismiss-1")
  expect(tui?.captureCharFrame()).toContain("Health check expirou")
  await settle(() => !(tui?.captureCharFrame().includes("Health check expirou") ?? true))
  expect(tui?.renderer.currentFocusedRenderable?.id).toBe("notification-focus-owner")
})

test("a notification animates away while a longer error remains", async () => {
  const originalSetTimeout = globalThis.setTimeout
  const expirations: Array<() => void> = []
  const schedule = spyOn(globalThis, "setTimeout").mockImplementation(
    new Proxy(originalSetTimeout, {
      apply(target, receiver, args) {
        if (Number(args[1]) > 500_000) {
          expect(Number(args[1])).toBeLessThanOrEqual(1_000_000)
          expirations.push(() => Reflect.apply(args[0], undefined, args.slice(2)))
        }
        return Reflect.apply(target, receiver, args)
      },
    }),
  )
  try {
    await renderNotifications([
      { source: "Git", kind: "success", message: "Salvo", durationMs: 1_000_000 },
      { source: "HTTP", kind: "error", message: "Falha de conexão" },
    ])
    expect(tui?.captureCharFrame()).toContain("Salvo")
    expect(tui?.captureCharFrame()).toContain("Falha de conexão")
    expect(expirations).toHaveLength(1)

    // Deliver the actual scheduled expiration after the first rendered frame,
    // without making rendering race a 25 ms wall-clock lifetime in CI.
    act(() => expirations[0]?.())
    await settle(() => !(tui?.captureCharFrame().includes("Salvo") ?? true))
    expect(tui?.captureCharFrame()).not.toContain("Salvo")
    expect(tui?.captureCharFrame()).toContain("Falha de conexão")
  } finally {
    act(() => tui?.renderer.destroy())
    tui = undefined
    schedule.mockRestore()
  }
})

for (const layout of ["framed", "compact"] as const) {
  test(`notification cards keep the compact top layout and semantic colors in ${layout}`, async () => {
    updateUiSettings({ layout, language: "pt-BR" })
    await renderNotifications([
      { source: "Sistema", kind: "info", message: "Informação disponível" },
      { source: "Git", kind: "success", message: "Operação concluída" },
      { source: "HTTP", kind: "error", message: "Conexão recusada" },
    ])

    const stack = tui?.renderer.root.findDescendantById(
      "app-notification-stack",
    ) as BoxRenderable | null
    expect(stack?.screenY).toBe(1)
    expect(stack?.height).toBe(12)
    for (let index = 0; index < 3; index += 1) {
      const card = tui?.renderer.root.findDescendantById(
        `app-notification-${index}`,
      ) as BoxRenderable | null
      expect(card?.height).toBe(4)
      expect(card?.border).toEqual(["left"])
      expect(card?.borderStyle).toBe("rounded")
      expect(card?.backgroundColor.equals(RGBA.fromHex(COLORS.panelRaised))).toBe(true)
      expect(
        tui?.renderer.root.findDescendantById(`app-notification-progress-${index}`),
      ).toBeDefined()
    }

    const spans = tui?.captureSpans().lines.flatMap((line) => line.spans) ?? []
    const colorOf = (text: string) => spans.find((span) => span.text.includes(text))?.fg.toInts()
    expect(colorOf("INFORMAÇÃO · Sistema")).toEqual(RGBA.fromHex(BRAND_COLOR).toInts())
    expect(colorOf("SUCESSO · Git")).toEqual(RGBA.fromHex(COLORS.success).toInts())
    expect(colorOf("ERRO · HTTP")).toEqual(RGBA.fromHex(COLORS.danger).toInts())
  })
}

test("hovering one card pauses and resumes every countdown and progress bar", async () => {
  await renderNotifications([
    { source: "Git", kind: "success", message: "Primeiro timer", durationMs: 700 },
    { source: "HTTP", kind: "info", message: "Segundo timer", durationMs: 700 },
  ])

  const card = tui?.renderer.root.findDescendantById("app-notification-0")
  const progressBefore = [0, 1].map(
    (index) => tui?.renderer.root.findDescendantById(`app-notification-progress-${index}`)?.width,
  )
  await act(async () => {
    await tui?.mockMouse.moveTo((card?.screenX ?? 0) + 2, (card?.screenY ?? 0) + 1)
  })
  await tui?.renderOnce()
  const progressWhenPaused = [0, 1].map(
    (index) => tui?.renderer.root.findDescendantById(`app-notification-progress-${index}`)?.width,
  )
  expect(progressWhenPaused[0]).toBeLessThanOrEqual(progressBefore[0] ?? 0)
  expect(progressWhenPaused[1]).toBeLessThanOrEqual(progressBefore[1] ?? 0)
  await act(async () => Bun.sleep(300))
  await tui?.renderOnce()
  const progressWhilePaused = [0, 1].map(
    (index) => tui?.renderer.root.findDescendantById(`app-notification-progress-${index}`)?.width,
  )
  expect(progressWhilePaused).toEqual(progressWhenPaused)
  expect(tui?.captureCharFrame()).toContain("Primeiro timer")
  expect(tui?.captureCharFrame()).toContain("Segundo timer")

  await act(async () => {
    await tui?.mockMouse.moveTo(0, 31)
  })
  await settle(() => !(tui?.captureCharFrame().includes("Primeiro timer") ?? true))
  expect(tui?.captureCharFrame()).not.toContain("Segundo timer")
})

test("notification bursts schedule timers only for retained cards and release them on unmount", async () => {
  const originalSetTimeout = globalThis.setTimeout
  const originalClearTimeout = globalThis.clearTimeout
  const retainedTimers = new Set<ReturnType<typeof setTimeout>>()
  let publish: ReturnType<typeof useNotifications>["notify"] = () => {
    throw new Error("Notifications not mounted")
  }
  let scheduled = 0
  const schedule = spyOn(globalThis, "setTimeout").mockImplementation(
    new Proxy(originalSetTimeout, {
      apply(target, receiver, args) {
        const timer = Reflect.apply(target, receiver, args) as ReturnType<typeof setTimeout>
        if (Number(args[1]) > 500_000) {
          retainedTimers.add(timer)
          scheduled += 1
        }
        return timer
      },
    }),
  )
  const cancel = spyOn(globalThis, "clearTimeout").mockImplementation(
    new Proxy(originalClearTimeout, {
      apply(target, receiver, args) {
        retainedTimers.delete(args[0])
        return Reflect.apply(target, receiver, args)
      },
    }),
  )
  try {
    await renderNotifications(
      Array.from({ length: 1_000 }, (_value, index) => ({
        source: "Teste",
        message: `Evento ${index}`,
        durationMs: 1_000_000,
      })),
      undefined,
      (notify) => {
        publish = notify
      },
    )
    expect(tui?.captureCharFrame()).toContain("Evento 999")
    expect(scheduled).toBe(3)
    expect(retainedTimers.size).toBe(3)
    const firstTimers = [...retainedTimers]
    act(() => {
      for (let index = 997; index <= 999; index += 1) {
        publish({ source: "Teste", message: `Evento ${index}`, durationMs: 1_000_000 })
      }
    })
    await tui?.renderOnce()
    expect(scheduled).toBe(6)
    expect(retainedTimers.size).toBe(3)
    expect(firstTimers.every((timer) => !retainedTimers.has(timer))).toBe(true)
    await act(async () => Bun.sleep(NOTIFICATION_ANIMATION_TIMING.enterMs + 40))
    await tui?.renderOnce()
    await click("app-notification-dismiss-1")
    expect(retainedTimers.size).toBe(0)
    await act(async () => {
      await tui?.mockMouse.moveTo(0, 31)
    })
    await tui?.renderOnce()
    expect(retainedTimers.size).toBe(2)
    act(() => tui?.renderer.destroy())
    tui = undefined
    expect(retainedTimers.size).toBe(0)
  } finally {
    act(() => tui?.renderer.destroy())
    tui = undefined
    schedule.mockRestore()
    cancel.mockRestore()
    for (const timer of retainedTimers) originalClearTimeout(timer)
  }
})

test("compact narrow viewport shows only the newest card within terminal bounds", async () => {
  updateUiSettings({ layout: "compact" })
  await renderNotifications(
    [
      { source: "Runner", kind: "warning", message: "Aviso anterior" },
      { source: "Terminal", kind: "error", message: "Erro mais recente" },
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
  await settle(() => tui?.captureCharFrame().includes("[C] DIFFS") ?? false)
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
