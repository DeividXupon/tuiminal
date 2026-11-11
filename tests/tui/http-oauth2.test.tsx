import "./setup"
import { afterEach, expect, test } from "bun:test"
import { act, useState } from "react"
import type { InputRenderable } from "@opentui/core"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { HttpAuthEditor } from "../../packages/feature-http/src/ui/HttpAuthEditor"
import { defaultHttpOAuth2 } from "../../packages/feature-http/src/model/oauth2"
import type { HttpAuth } from "../../packages/feature-http/src/model/types"
import { clearHttpOAuthSessions } from "../../packages/feature-http/src/services/oauth2-session"

let tui: TestRendererSetup | undefined
let server: ReturnType<typeof Bun.serve> | undefined
let release = () => {}
afterEach(async () => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  clearHttpOAuthSessions()
  release()
  await server?.stop(true)
})
async function settle(check: () => boolean) {
  for (let attempt = 0; attempt < 100; attempt++) {
    await act(async () => {
      await Bun.sleep(10)
      await tui?.renderOnce()
    })
    if (check()) return
  }
  throw new Error(tui?.captureCharFrame())
}
async function key(name: string, ctrl = false) {
  await act(async () => {
    tui?.mockInput.pressKey(name, { ctrl })
    await tui?.renderOnce()
  })
}
async function click(id: string) {
  const node = tui?.renderer.root.findDescendantById(id)
  if (!node) throw new Error(`Missing ${id}`)
  await act(async () => {
    await tui?.mockMouse.click(node.screenX + 1, node.screenY)
    await tui?.renderOnce()
  })
}

test("OAuth controls preserve config after failure/cancel, mask secrets and ignore keys when inactive", async () => {
  let setActive = (_active: boolean) => {}
  let calls = 0
  let slow = false
  let fail = true
  let current: HttpAuth = defaultHttpOAuth2()
  server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch() {
      calls++
      if (slow)
        await new Promise<void>((resolve) => {
          release = resolve
        })
      return fail
        ? new Response("private-server-error", { status: 401 })
        : Response.json({ access_token: "private-access", token_type: "Bearer", expires_in: 3600 })
    },
  })
  const initial: HttpAuth = {
    ...defaultHttpOAuth2(),
    tokenUrl: `${server.url}token`,
    clientId: "fixture",
    clientSecret: "private-client-secret",
  }
  function Fixture() {
    const [auth, setAuth] = useState(initial)
    const [active, updateActive] = useState(true)
    setActive = updateActive
    current = auth
    return (
      <HttpAuthEditor
        requestId="oauth-fixture"
        auth={auth}
        onChange={setAuth}
        onFocus={() => {}}
        focused={active}
        oauthContext={{ variables: new Map(), environmentName: null }}
      />
    )
  }
  tui = await testRender(<Fixture />, { width: 100, height: 38 })
  await settle(() => tui?.captureCharFrame().includes("Obter token") ?? false)
  await click("http-oauth-acquire")
  await settle(() => tui?.captureCharFrame().includes("falha ao obter token") ?? false)
  expect(current).toEqual(initial)
  expect(tui.captureCharFrame()).not.toContain("private-server-error")
  fail = false
  await key("t", true)
  await settle(() => tui?.captureCharFrame().includes("token disponível") ?? false)
  expect(tui.captureCharFrame()).not.toContain("private-access")
  expect(tui.captureCharFrame()).not.toContain("private-client-secret")
  await click("http-oauth-forget")
  slow = true
  await key("t", true)
  await settle(() => calls === 3)
  await key("ESCAPE")
  await settle(() => tui?.captureCharFrame().includes("operação cancelada") ?? false)
  expect(current).toEqual(initial)
  slow = false
  release()
  await key("t", true)
  await settle(() => tui?.captureCharFrame().includes("token disponível") ?? false)
  const before = calls
  await act(async () => {
    setActive(false)
    await tui?.renderOnce()
  })
  await key("t", true)
  await key("r", true)
  expect(calls).toBe(before)
  const secret = tui.renderer.root.findDescendantById(
    "http-auth-oauth2-field-clientSecret-oauth-fixture",
  ) as InputRenderable
  await act(async () => {
    secret.focus()
    tui?.resize(52, 30)
  })
  await settle(() => tui?.renderer.currentFocusedRenderable === secret)
  expect(secret.value).toBe("private-client-secret")
  expect(tui.captureCharFrame()).not.toContain("private-client-secret")
})
