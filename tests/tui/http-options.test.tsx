import { openLocalHttp } from "./http-source"
import "./setup"
import { afterEach, expect, test } from "bun:test"
import type { TestRendererSetup } from "@opentui/core/testing"
import type { InputRenderable, ScrollBoxRenderable, BoxRenderable } from "@opentui/core"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import { RequestOptions } from "../../packages/feature-http/src/ui/HttpRequestOptions"
import { createScratchRequest } from "../../packages/feature-http/src/model/workspace"
import { HttpClient } from "../../packages/feature-http/src/HttpClient"
import { getUiSettings, updateUiSettings } from "../../packages/core/src/settings/theme"

let tui: TestRendererSetup | undefined
const initialSettings = getUiSettings()

afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  updateUiSettings(initialSettings)
})

async function settle(until: () => boolean) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    await act(async () => {
      await Bun.sleep(10)
      await tui?.renderOnce()
    })
    if (until()) return
  }
  throw new Error(`HTTP options did not settle:\n${tui?.captureCharFrame()}`)
}

async function key(name: string, shift = false) {
  await act(async () => {
    tui?.mockInput.pressKey(name, { shift })
    await Bun.sleep(name === "ESCAPE" || name.startsWith("F") ? 60 : 10)
  })
  await act(async () => tui?.renderOnce())
}
function node(id: string) {
  const target = tui?.renderer.root.findDescendantById(id)
  if (!target) throw new Error(`Missing ${id}:\n${tui?.captureCharFrame()}`)
  return target
}
async function click(id: string) {
  const target = node(id)
  await act(async () => {
    await tui?.mockMouse.click(target.screenX + 1, target.screenY)
  })
  await act(async () => tui?.renderOnce())
}
const section = (name: string) => `http-request-options-${name}-http-scratch-1`
const focused = () => tui?.renderer.currentFocusedRenderable?.id
const frame = () => tui?.captureCharFrame() ?? ""
const rowText = (id: string) => {
  const target = node(id)
  return frame().split("\n")[target.screenY] ?? ""
}
async function mount(width = 120, height = 38) {
  tui = await testRender(<HttpClient active />, { width, height })
  await openLocalHttp(tui)
  await settle(() => focused() === "http-url-input")
  await key("ESCAPE")
  await key("a")
  await settle(() => focused() === section("options"))
}
function visibleInScroll(id: string) {
  const target = node(id)
  const scroll = node("http-automation-form-options-http-scratch-1") as ScrollBoxRenderable
  return (
    target.screenY >= scroll.viewport.screenY &&
    target.screenY + target.height <= scroll.viewport.screenY + scroll.viewport.height
  )
}
async function edit(value: string) {
  await act(async () => tui?.mockInput.typeText(value))
}

test.each(["framed", "compact"] as const)(
  "options use block, row and input focus in %s layout",
  async (layout) => {
    updateUiSettings({ layout, language: "pt-BR" })
    await mount()
    expect(rowText(`${section("options")}-heading`)).toContain(
      "OPÇÕES DA REQUISIÇÃO [Enter] Selecionar",
    )
    expect(rowText("http-request-timeout")).toContain("herdar")
    await key("RETURN")
    expect(rowText(`${section("options")}-heading`)).toContain("OPÇÕES DA REQUISIÇÃO [Esc] Sair")
    expect(rowText("http-request-timeout")).toContain("herdar")
    await key("RETURN")
    expect(rowText("http-request-timeout")).toContain("5s")
    await key("j")
    await key("RETURN")
    expect(rowText("http-request-redirects")).toContain("seguir")
    await key("ARROW_DOWN")
    await key("RETURN")
    expect(rowText("http-request-cookie-jar")).toContain("ignorar")
    await key("j")
    await key("j")
    await key("RETURN")
    expect(rowText("http-request-tls-verification")).toContain("TLS INSEGURO")
    await key("j")
    await key("RETURN")
    await settle(() => focused() === "http-request-proxy-http-scratch-1")
    await edit("http://proxy.example.test:8080/jkhl")
    expect((node(focused() ?? "") as InputRenderable).value).toBe(
      "http://proxy.example.test:8080/jkhl",
    )
    await key("ESCAPE")
    expect(focused()).toBe(section("options"))
    await key("k")
    await key("RETURN")
    expect(rowText("http-request-tls-verification")).toContain("verificar")
    await key("ESCAPE")
    await key("j")
    expect(focused()).toBe(section("identity"))
    await settle(() =>
      rowText(`${section("identity")}-heading`).includes("IDENTIFICAÇÃO [Enter] Selecionar"),
    )
    expect(rowText(`${section("identity")}-heading`)).toContain("IDENTIFICAÇÃO [Enter] Selecionar")
    await click(`${section("identity")}-selection`)
    expect(rowText(`${section("identity")}-heading`)).toContain("IDENTIFICAÇÃO [Esc] Sair")
    await key("l")
    await key("RETURN")
    await settle(() => focused() === "http-custom-method-http-scratch-1")
    await key("HOME")
    await key("END", true)
    await key("BACKSPACE")
    await edit("propfind")
    expect((node(focused() ?? "") as InputRenderable).value).toBe("PROPFIND")
    await key("ESCAPE")
    await key("ARROW_LEFT")
    await key("RETURN")
    await settle(() => focused() === "http-request-name-http-scratch-1")
    await edit(" fixture-jkhl")
    const name = node(focused() ?? "") as InputRenderable
    const method = node("http-custom-method-http-scratch-1")
    expect(name.screenY).toBe(method.screenY)
    expect(name.screenX + name.width).toBeLessThan(method.screenX)
    await click(`${section("identity")}-selection`)
    expect(focused()).toBe(section("identity"))
    expect(rowText(`${section("identity")}-heading`)).toContain("[Esc] Sair")
    await click(`${section("identity")}-selection`)
    expect(rowText(`${section("identity")}-heading`)).toContain("[Enter] Selecionar")
    await key("ARROW_DOWN")
    expect(focused()).toBe(section("actions"))
    await key("ARROW_RIGHT")
    await key("h")
    await key("RETURN")
    await settle(() => Boolean(tui?.renderer.root.findDescendantById("http-curl-import-editor")))
    expect(frame()).toContain("cURL")
  },
)

test("options keep actions pinned, alternating rows and selected fields visible through resize", async () => {
  await mount()
  const rows = ["timeout", "redirects", "cookie-jar", "history", "tls-verification"].map(
    (id) => node(`http-request-${id}`).getChildren()[0] as BoxRenderable,
  )
  expect(rows[0]?.backgroundColor).toEqual(rows[2]?.backgroundColor)
  expect(rows[1]?.backgroundColor).toEqual(rows[3]?.backgroundColor)
  expect(rows[0]?.backgroundColor).not.toEqual(rows[1]?.backgroundColor)
  await key("RETURN")
  for (let i = 0; i < 5; i++) await key("j")
  await key("RETURN")
  await settle(() => focused() === "http-request-proxy-http-scratch-1")
  const proxy = node(focused() ?? "") as InputRenderable
  await edit("http://fixture.test:8080")
  for (const [width, height] of [
    [52, 24],
    [80, 28],
    [120, 38],
    [160, 32],
  ] as const) {
    await act(async () => tui?.resize(width, height))
    await settle(() => visibleInScroll(proxy.id))
    expect(node(proxy.id)).toBe(proxy)
    expect(focused()).toBe(proxy.id)
    expect(proxy.value).toBe("http://fixture.test:8080")
    const scroll = node("http-automation-form-options-http-scratch-1") as ScrollBoxRenderable
    const actions = node(section("actions"))
    expect(actions.screenY).toBe(scroll.screenY + scroll.height)
    expect(actions.screenY + actions.height).toBeLessThanOrEqual(
      node("http-request-pane-http-scratch-1").screenY +
        node("http-request-pane-http-scratch-1").height,
    )
  }
  for (const row of rows)
    expect(rowText(row.parent?.id ?? "")).not.toMatch(/\[(?:T|C|⇧L|Shift\+V)\]/)
})

test("mouse edits options and identity, Tab cycles inputs and inactive tabs retain their own keys", async () => {
  await mount(100, 44)
  await click("http-request-cookie-jar")
  expect(rowText("http-request-cookie-jar")).toContain("ignorar")
  await key("RETURN")
  expect(rowText("http-request-cookie-jar")).toContain("usar")
  await click("http-request-proxy-http-scratch-1")
  await edit("http://proxy.test")
  await key("TAB")
  await settle(() => focused() === "http-request-name-http-scratch-1")
  await edit(" edited")
  await key("TAB")
  await settle(() => focused() === "http-custom-method-http-scratch-1")
  await key("TAB", true)
  await settle(() => focused() === "http-request-name-http-scratch-1")
  await key("ESCAPE")
  await click("http-request-view-params")
  await key("j")
  await key("RETURN")
  await settle(() => focused()?.startsWith("http-key-value-name-") ?? false)
  await edit("path-jkhl")
  await settle(() => focused()?.startsWith("http-key-value-name-") ?? false)
  expect((node(focused() ?? "") as InputRenderable).value).toBe("path-jkhl")
})

test("file actions scroll horizontally and activate once without entering their block", async () => {
  const calls: string[] = []
  const request = createScratchRequest("http-scratch-1")
  request.source = {
    kind: "file",
    path: "/synthetic/options.http",
    blockId: "one",
    sourceHash: "fixture",
  }
  tui = await testRender(
    <RequestOptions
      request={request}
      focused
      keyRef={{ current: null }}
      onNameChange={() => {}}
      onMethodChange={() => {}}
      onOptionsChange={() => {}}
      onFocus={() => {}}
      onImportCurl={() => calls.push("import")}
      onExportCurl={() => calls.push("export")}
      onDuplicate={() => calls.push("duplicate")}
      onMove={() => calls.push("move")}
      onDelete={() => calls.push("delete")}
    />,
    { width: 36, height: 20 },
  )
  await settle(() => focused() === section("options"))
  await key("j")
  await key("ARROW_DOWN")
  expect(focused()).toBe(section("actions"))
  const ids = ["import-curl", "export-curl", "duplicate", "move", "delete"]
  for (let index = 0; index < ids.length; index++) {
    if (index) await key(index % 2 ? "l" : "ARROW_RIGHT")
    const target = node(`http-request-${ids[index]}`)
    await settle(() => target.screenX >= 0 && target.screenX + target.width <= 36)
    expect(target.screenY).toBe(19)
    expect(calls).toHaveLength(index)
    await key("RETURN")
    expect(calls).toHaveLength(index + 1)
  }
  expect(calls).toEqual(["import", "export", "duplicate", "move", "delete"])
  await key("h")
  await key("RETURN")
  expect(calls.at(-1)).toBe("move")
  await key("k")
  expect(focused()).toBe(section("identity"))
})

test("options preserve document drafts and reveal only the active document's selection", async () => {
  await mount(100, 44)
  await click("http-request-proxy-http-scratch-1")
  await edit("http://first.test")
  const first = node("http-request-proxy-http-scratch-1") as InputRenderable
  await click("http-document-new")
  await settle(() => focused() === "http-url-input")
  await key("ESCAPE")
  await key("a")
  await settle(
    () =>
      Boolean(focused()?.startsWith("http-request-options-options-")) &&
      focused() !== section("options"),
  )
  await key("RETURN")
  for (let index = 0; index < 5; index++) await key("ARROW_DOWN")
  await key("RETURN")
  await settle(
    () => Boolean(focused()?.startsWith("http-request-proxy-")) && focused() !== first.id,
  )
  const second = node(focused() ?? "") as InputRenderable
  await edit("http://second.test")
  await act(async () => tui?.resize(52, 24))
  const requestId = second.id.slice("http-request-proxy-".length)
  await settle(() => {
    const view = (node(`http-automation-form-options-${requestId}`) as ScrollBoxRenderable).viewport
    return (
      second.screenY >= view.screenY && second.screenY + second.height <= view.screenY + view.height
    )
  })
  expect(focused()).toBe(second.id)
  expect(first.value).toBe("http://first.test")
  expect(second.value).toBe("http://second.test")
  await key("ESCAPE")
  await key("ESCAPE")
  await key("1")
  await settle(() => focused() === first.id)
  expect(first.value).toBe("http://first.test")
})

test("selected option rows expose R to restore only their default without stealing input", async () => {
  await mount(100, 44)
  await click("http-request-proxy-http-scratch-1")
  await edit("http://proxy.test/r")
  await key("ESCAPE")
  for (let index = 0; index < 5; index++) await key("k")
  const ids = ["timeout", "redirects", "cookie-jar", "history", "tls-verification"]
  const changed = ["5s", "manual", "ignorar", "não registrar", "TLS INSEGURO"]
  const defaults = ["herdar", "herdar", "usar", "registrar", "verificar"]
  for (const [index, id] of ids.entries()) {
    if (index) await key("j")
    await key("RETURN")
    if (id === "redirects") await key("RETURN")
    await settle(() => rowText(`http-request-${id}`).includes(changed[index] ?? ""))
    expect(rowText(`http-request-${id}`)).toContain("[R] Padrão")
  }
  for (let index = 0; index < 4; index++) await key("k")
  for (const [index, id] of ids.entries()) {
    if (index) await key("ARROW_DOWN")
    const reset = `http-request-${id}-reset`
    expect(rowText(reset)).toContain("[R] Padrão")
    if (index % 2) await click(reset)
    else await key("r")
    await settle(() => rowText(`http-request-${id}`).includes(defaults[index] ?? ""))
    expect(rowText(`http-request-${id}`)).not.toContain(changed[index] ?? "")
    expect(rowText(reset)).toContain("[R] Padrão")
    if (index < ids.length - 1) {
      expect(rowText(`http-request-${ids[index + 1]}`)).toContain(changed[index + 1] ?? "")
    }
    expect((node("http-request-proxy-http-scratch-1") as InputRenderable).value).toBe(
      "http://proxy.test/r",
    )
  }
  await key("ESCAPE")
  expect(
    tui?.renderer.root.findDescendantById("http-request-tls-verification-reset"),
  ).toBeUndefined()
  await key("r")
  expect(focused()).toBe("http-request-pane-http-scratch-1")
  expect((node("http-request-proxy-http-scratch-1") as InputRenderable).value).toBe(
    "http://proxy.test/r",
  )
  await key("j")
  await key("RETURN")
  await key("RETURN")
  await settle(() => focused() === "http-request-name-http-scratch-1")
  await key("END")
  await edit("-r")
  expect((node(focused() ?? "") as InputRenderable).value).toBe("Scratch-r")
})
