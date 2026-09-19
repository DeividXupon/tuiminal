import "./setup"
import { afterEach, expect, test } from "bun:test"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { readFile, unlink, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { act, StrictMode } from "react"
import { App } from "../../apps/cli/src/App"
import { getUiSettings, updateUiSettings } from "../../packages/core/src/settings/theme"
import { HttpRedirectApprovalModal } from "../../packages/feature-http/src/ui/HttpRedirectApprovalModal"
import { useHttpRedirectApprovals } from "../../packages/feature-http/src/hooks/use-http-redirect-approvals"
import { InlineButton } from "../../packages/core/src/ui/InlineButton"

let tui: TestRendererSetup | undefined
const initialSettings = getUiSettings()
const servers: ReturnType<typeof Bun.serve>[] = []
const root = process.env.TUIMINAL_WORKDIR
if (!root) throw new Error("Missing isolated TUI fixture")
const path = resolve(root, "redirect-ui.http")
const previousOnlyTab = process.env.TUIMINAL_ONLY_TAB
let previousFile: Uint8Array | null = null
let touchedFile = false
function current() {
  if (!tui) throw new Error("TUI not mounted")
  return tui
}

async function settle(until: () => boolean) {
  for (let attempt = 0; attempt < 100; attempt++) {
    await act(async () => {
      await Bun.sleep(10)
    })
    await current().renderOnce()
    if (until()) return
  }
  throw new Error(`Redirect TUI did not settle:\n${current().captureCharFrame()}`)
}
async function press(id: string) {
  await act(async () => {
    const button = current().renderer.root.findDescendantById(id) as
      | { press?: () => void }
      | undefined
    if (!button?.press) throw new Error(`Missing control ${id}`)
    button.press()
  })
  await current().renderOnce()
}
async function key(name: string) {
  await act(async () => {
    current().mockInput.pressKey(name)
    await Bun.sleep(name === "ESCAPE" ? 60 : 5)
  })
  await current().renderOnce()
}
async function click(id: string) {
  const button = current().renderer.root.findDescendantById(id)
  if (!button) throw new Error(`Missing mouse target ${id}`)
  await act(async () => {
    await current().mockMouse.click(button.screenX + 2, button.screenY)
  })
  await current().renderOnce()
}
afterEach(async () => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  await Promise.all(servers.splice(0).map((server) => server.stop(true)))
  if (touchedFile) {
    if (previousFile) await writeFile(path, previousFile)
    else await unlink(path).catch(() => undefined)
  }
  touchedFile = false
  updateUiSettings(initialSettings)
  if (previousOnlyTab === undefined) delete process.env.TUIMINAL_ONLY_TAB
  else process.env.TUIMINAL_ONLY_TAB = previousOnlyTab
})

for (const layout of ["compact", "framed"] as const) {
  test(`a POST pauses for consent, resumes once and Escape never exits App (${layout})`, async () => {
    updateUiSettings({ layout })
    process.env.TUIMINAL_ONLY_TAB = "http"
    let initialCount = 0
    const bodies: string[] = []
    const destination = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      async fetch(request) {
        bodies.push(await request.text())
        return Response.json({ accepted: true })
      },
    })
    servers.push(destination)
    const source = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch() {
        initialCount++
        return new Response(null, {
          status: 307,
          headers: { location: `http://127.0.0.1:${destination.port}/end` },
        })
      },
    })
    servers.push(source)
    previousFile = await readFile(path).catch(() => null)
    touchedFile = true
    await writeFile(
      path,
      `### Redirect UI\n# @name redirect-ui\nPOST http://127.0.0.1:${source.port}/start\nContent-Type: text/plain\n\nfixture-body\n`,
    )
    tui = await testRender(<App />, { width: 120, height: 30 })
    await settle(() =>
      Boolean(
        current().renderer.root.findDescendantById(
          "http-navigation-project-redirect-ui.http#redirect-ui",
        ),
      ),
    )
    await press("http-navigation-project-redirect-ui.http#redirect-ui")
    await press("http-send-button")
    await settle(
      () => current().renderer.currentFocusedRenderable?.id === "http-redirect-approval-modal",
    )
    expect(initialCount).toBe(1)
    expect(bodies).toEqual([])
    expect(current().captureCharFrame()).toContain(`127.0.0.1:${destination.port}`)
    await key("ESCAPE")
    await settle(() => !current().renderer.root.findDescendantById("http-redirect-approval-modal"))
    expect(current().renderer.isDestroyed).toBe(false)
    expect(bodies).toEqual([])
    expect(initialCount).toBe(1)

    await press("http-send-button")
    await settle(() =>
      Boolean(current().renderer.root.findDescendantById("http-redirect-approval-modal")),
    )
    if (layout === "compact") await key("y")
    else await click("http-redirect-approval-confirm")
    await settle(() => current().captureCharFrame().includes('"accepted": true'))
    expect(initialCount).toBe(2)
    expect(bodies).toEqual(["fixture-body"])
    expect(
      current().renderer.root.findDescendantById("http-redirect-approval-modal"),
    ).toBeUndefined()

    await press("http-collection-help")
    await press("http-collection-runner-button")
    await settle(
      () => current().renderer.currentFocusedRenderable?.id === "http-collection-runner-dataset",
    )
    await press("http-collection-runner-run")
    await settle(
      () => current().renderer.currentFocusedRenderable?.id === "http-redirect-approval-modal",
    )
    await key("ESCAPE")
    await settle(
      () => current().renderer.currentFocusedRenderable?.id === "http-collection-runner-dataset",
    )
    expect(current().renderer.root.findDescendantById("http-collection-runner-modal")).toBeDefined()
    await key("ESCAPE")
    expect(current().renderer.currentFocusedRenderable?.id).not.toBe(
      "http-collection-runner-dataset",
    )
    expect(current().renderer.root.findDescendantById("http-collection-runner-modal")).toBeDefined()
    await key("ESCAPE")
    await settle(() => !current().renderer.root.findDescendantById("http-collection-runner-modal"))
    expect(current().renderer.isDestroyed).toBe(false)
    expect(initialCount).toBe(3)
    expect(bodies).toEqual(["fixture-body"])
  }, 15_000)
}

test("the confirmation keeps targets and actions reachable at 60x16 and ignores repeated approval", async () => {
  const answers: boolean[] = []
  tui = await testRender(
    <HttpRedirectApprovalModal
      pending={{
        id: 1,
        approval: {
          executionId: "small",
          requestId: "small",
          hop: 1,
          fromOrigin: "https://one.test",
          toOrigin: "http://two.test:8080",
          method: "POST",
          displayUrl: "http://two.test:8080/redacted",
          risks: ["body", "downgrade"],
        },
      }}
      decide={(_id, allowed) => answers.push(allowed)}
      terminalWidth={60}
      terminalHeight={16}
    />,
    { width: 60, height: 16 },
  )
  await settle(
    () => current().renderer.currentFocusedRenderable?.id === "http-redirect-approval-modal",
  )
  const action = current().renderer.root.findDescendantById("http-redirect-approval-confirm")
  expect(action?.screenY).toBeLessThan(16)
  expect(current().captureCharFrame()).toContain("http://two.test:8080")
  await key("\x1b[121;1:2u")
  expect(answers).toEqual([])
  await key("y")
  expect(answers).toEqual([true])
})

test("StrictMode keeps the queue usable; TLS decisions are single-use and unmount rejects waiting work", async () => {
  const answers: boolean[] = []
  const tlsTargets: string[] = []
  const controller = new AbortController()
  function Harness() {
    const approvals = useHttpRedirectApprovals((approval) => tlsTargets.push(approval.target))
    return (
      <box>
        <InlineButton
          id="http-fixture-start"
          label="[S] Start fixture"
          onPress={() => {
            for (const target of ["https://one.test", "https://two.test"])
              void Promise.resolve(
                approvals.authorize(
                  {
                    executionId: target,
                    requestId: target,
                    hop: 1,
                    fromOrigin: "https://source.test",
                    toOrigin: target,
                    method: "GET",
                    displayUrl: `${target}/redacted`,
                    risks: ["insecure-tls"],
                  },
                  controller.signal,
                ),
              ).then((allowed) => answers.push(allowed))
          }}
        />
        {approvals.pending ? (
          <HttpRedirectApprovalModal
            pending={approvals.pending}
            decide={approvals.decide}
            terminalWidth={90}
            terminalHeight={24}
          />
        ) : null}
      </box>
    )
  }
  tui = await testRender(
    <StrictMode>
      <Harness />
    </StrictMode>,
    { width: 90, height: 24 },
  )
  await press("http-fixture-start")
  await settle(() => current().renderer.currentFocusedRenderable?.id === "http-insecure-tls-modal")
  expect(current().captureCharFrame()).toContain("https://one.test")
  await key("i")
  await settle(() => current().captureCharFrame().includes("https://two.test"))
  expect(answers).toEqual([true])
  expect(current().renderer.currentFocusedRenderable?.id).toBe("http-insecure-tls-modal")
  await key("\x1b[105;1:2u")
  expect(answers).toEqual([true])
  act(() => current().renderer.root.findDescendantById("http-insecure-tls-confirm")?.focus())
  await key("ESCAPE")
  expect(answers).toEqual([true, false])
  expect(tlsTargets).toEqual(["https://one.test"])
  await press("http-fixture-start")
  await settle(() => Boolean(current().renderer.root.findDescendantById("http-insecure-tls-modal")))
  await act(async () => {
    current().renderer.destroy()
    await Promise.resolve()
  })
  tui = undefined
  expect(answers).toEqual([true, false, false, false])
  controller.abort()
})
