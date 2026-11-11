import { openLocalHttp } from "./http-source"
import "./setup"
import { afterEach, expect, test } from "bun:test"
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { CliRenderEvents, type InputRenderable, type ScrollBoxRenderable } from "@opentui/core"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act, useState } from "react"
import { HttpClient } from "../../packages/feature-http/src/HttpClient"
import { getUiSettings, updateUiSettings } from "../../packages/core/src/settings/theme"
import { NotificationProvider } from "../../packages/core/src/notifications/index"

const settings = getUiSettings()
const originalHome = process.env.TUIMINAL_HTTP_HOME
const originalFetch = globalThis.fetch
const roots: string[] = []
let tui: TestRendererSetup | undefined
let home = ""
let setWorkspaceActive: ((active: boolean) => void) | undefined
function Harness() {
  const [active, setActive] = useState(true)
  setWorkspaceActive = setActive
  return (
    <HttpClient active={active} initialUrlRequest={{ id: 1, url: "https://example.invalid" }} />
  )
}
const original = "### List\n# @name list\nGET https://example.invalid/users\n"
afterEach(async () => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  process.env.TUIMINAL_HTTP_HOME = originalHome
  globalThis.fetch = originalFetch
  updateUiSettings(settings)
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})
function find(id: string) {
  return tui?.renderer.root.findDescendantById(id)
}
function node(id: string) {
  const target = find(id)
  if (!target) throw new Error(`Missing ${id}:\n${tui?.captureCharFrame()}`)
  return target
}
async function settle(check: () => boolean) {
  for (let i = 0; i < 150; i++) {
    await act(async () => Bun.sleep(10))
    await act(async () => {
      await tui?.renderOnce()
    })
    if (check()) return
  }
  throw new Error(tui?.captureCharFrame())
}
async function click(id: string, button: 0 | 1 | 2 = 0) {
  await settle(() => Boolean(find(id)?.width && find(id)?.height))
  const target = node(id)
  await act(async () => {
    await tui?.mockMouse.click(target.screenX + 1, target.screenY, button)
    await tui?.renderOnce()
  })
}
async function key(name: string, ctrl = false) {
  await act(async () => {
    tui?.mockInput.pressKey(name, { ctrl })
    await Bun.sleep(name === "ESCAPE" ? 70 : 10)
  })
  await act(async () => {
    await tui?.renderOnce()
  })
}
async function name(value: string) {
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-collection-name-input")
  await act(async () => {
    const input = node("http-collection-name-input") as InputRenderable
    input.value = ""
    tui?.mockInput.typeText(value)
    await tui?.renderOnce()
  })
}
async function mount(width = 120, notifications = false, files: Record<string, string> = {}) {
  if (!originalHome) throw new Error("Missing isolated HTTP home")
  home = originalHome
  await mkdir(join(home, "Team"))
  roots.push(join(home, "Team"))
  for (const [file, content] of Object.entries({ "api.http": original, ...files }))
    await writeFile(join(home, "Team", file), content)
  updateUiSettings({ language: "pt-BR" })
  tui = await testRender(
    notifications ? (
      <NotificationProvider>
        <Harness />
      </NotificationProvider>
    ) : (
      <Harness />
    ),
    { width, height: 32, kittyKeyboard: true },
  )
  await openLocalHttp(tui)
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-url-input")
  await key("ESCAPE")
  await key("c")
  await settle(() => Boolean(find("http-collection-file-Team/api.http")))
  await click("http-collection-file-Team/api.http")
}
async function openMenu() {
  await key("a")
  await settle(() => Boolean(find("http-collection-menu")))
}
async function action(action: string) {
  await openMenu()
  await click(`http-collection-menu-${action}`)
}

for (const width of [120, 160])
  test(`workspace grows on focus and anchors its menu after resizing at ${width} columns`, async () => {
    await mount(width)
    const navigation = node("http-navigation-pane")
    const collection = node("http-collection-file-Team/api.http")
    const expandedWidth = navigation.width
    const url = node("http-url-input") as InputRenderable
    await click("http-url-input")
    await settle(() => navigation.width < expandedWidth)
    const restingWidth = navigation.width
    await act(async () => {
      tui?.mockInput.typeText("/pending")
    })
    const draftUrl = url.value
    await key("ESCAPE")
    await key("c")
    await settle(() => navigation.width === expandedWidth)
    expect(node("http-navigation-pane")).toBe(navigation)
    expect(node("http-collection-file-Team/api.http")).toBe(collection)
    expect(url.value).toBe(draftUrl)
    await click("http-request-view-headers")
    await settle(() => navigation.width === restingWidth)
    const listeners = tui?.renderer.listenerCount(CliRenderEvents.FRAME)
    await click(collection.id, 2)
    await settle(() => {
      const anchor = find("http-collection-actions-file:Team/api.http")
      const menu = find("http-collection-menu")
      return Boolean(
        anchor &&
          menu &&
          navigation.width === expandedWidth &&
          menu.screenX === anchor.screenX + anchor.width &&
          menu.screenY === collection.screenY,
      )
    })
    expect(tui?.renderer.currentFocusedRenderable?.id).toBe("http-collection-menu")
    await act(async () => {
      tui?.resize(width + 20, 32)
    })
    await settle(() => {
      const anchor = node("http-collection-actions-file:Team/api.http")
      return node("http-collection-menu").screenX === anchor.screenX + anchor.width
    })
    await key("ESCAPE")
    expect(tui?.renderer.listenerCount(CliRenderEvents.FRAME)).toBe(listeners)
    expect(tui?.renderer.currentFocusedRenderable).toBe(collection)
    expect(url.value).toBe(draftUrl)
    expect(await readFile(join(home, "Team/api.http"), "utf8")).toBe(original)
  })

for (const width of [52, 120])
  test(`right click selects collection items without opening or toggling them at ${width} columns`, async () => {
    await mount(width)
    const requestId = "http-navigation-project-Team/api.http#list"
    const expanded = Boolean(find(requestId))
    await key("HOME")
    await click("http-collection-file-Team/api.http", 2)
    await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-collection-menu")
    expect(find("http-collection-menu-create-request")).toBeDefined()
    expect(find("http-collection-menu-delete")).toBeDefined()
    expect(Boolean(find(requestId))).toBe(expanded)
    expect(node("http-collection-menu").screenY).toBe(
      node("http-collection-file-Team/api.http").screenY,
    )
    await key("ESCAPE")
    expect(tui?.renderer.currentFocusedRenderable?.id).toBe("http-collection-file-Team/api.http")
    await click("http-collection-directory-Team", 2)
    await settle(() => Boolean(find("http-collection-menu-create-folder")))
    expect(find("http-collection-file-Team/api.http")).toBeDefined()
    await key("ESCAPE")
    await click("http-collection-file-Team/api.http", 2)
    await settle(() => Boolean(find("http-collection-menu")))
    await key("ESCAPE")
    await key("ARROW_RIGHT")
    await settle(() => Boolean(find(requestId)))
    if (width >= 80) {
      await click("http-url-input")
      await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-url-input")
    }
    await click(requestId, 2)
    await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-collection-menu")
    expect(find("http-collection-menu-delete")).toBeDefined()
    expect(find("http-collection-menu-create-request")).toBeUndefined()
    expect(find("http-document-Team/api.http#list")).toBeUndefined()
    await key("ESCAPE")
    expect(tui?.renderer.currentFocusedRenderable?.id).toBe(requestId)
    await openMenu()
    expect(find("http-collection-menu-delete")).toBeDefined()
    expect(await readFile(join(home, "Team/api.http"), "utf8")).toBe(original)
  })

for (const width of [52, 120])
  test(`collection menu uses keyboard, mouse and bounds at ${width} columns`, async () => {
    await mount(width)
    expect(find("http-collection-actions-file:Team/api.http")).toBeDefined()
    await openMenu()
    const menu = node("http-collection-menu")
    expect(menu.screenX).toBeGreaterThanOrEqual(0)
    expect(menu.screenX + menu.width).toBeLessThanOrEqual(width)
    expect(menu.screenY + menu.height).toBeLessThanOrEqual(32)
    expect(find("http-collection-menu-create-folder")).toBeDefined()
    expect(find("http-collection-menu-delete")).toBeDefined()
    await key("g", true)
    expect(find("http-source-picker")).toBeUndefined()
    await key("ESCAPE")
    expect(find("http-collection-menu")).toBeUndefined()
    expect(find("http-navigation-pane")).toBeDefined()
    await openMenu()
    await act(async () => {
      await tui?.mockMouse.click(width - 2, 1)
      await tui?.renderOnce()
    })
    await settle(() => !find("http-collection-menu"))
    await openMenu()
    await key("ARROW_DOWN")
    await key("ARROW_DOWN")
    await key("RETURN")
    await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-collection-name-input")
    const input = node("http-collection-name-input") as InputRenderable
    expect(input.value).toBe("api.http")
    expect(input.height).toBe(1)
    expect(find("http-collection-action-apply")).toBeUndefined()
    expect(find("http-collection-action-cancel")).toBeUndefined()
    expect(find("http-collection-action-form")).toBeUndefined()
    const collectionY = input.screenY
    await name("renamed.http")
    await key("ESCAPE")
    expect(find("http-collection-name-input")).toBeUndefined()
    await settle(() => node("http-collection-file-Team/api.http").screenY === collectionY)
    expect(await readFile(join(home, "Team/api.http"), "utf8")).toBe(original)
    await action("rename")
    await name("renamed.http")
    await key("RETURN")
    await settle(
      () =>
        Boolean(find("http-collection-file-Team/renamed.http")) &&
        !find("http-collection-name-input"),
    )
    expect(await readFile(join(home, "Team/renamed.http"), "utf8")).toBe(original)
  })

test("creates folders and requests inline, cancels empty drafts and keeps typed shortcuts inert", async () => {
  await mount()
  await click("http-collection-directory-Team")
  await action("create-folder")
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-collection-name-input")
  expect((node("http-collection-name-input") as InputRenderable).value).toBe("")
  expect(node("http-collection-draft").height).toBe(1)
  expect(find("http-collection-action-apply")).toBeUndefined()
  expect(find("http-collection-action-cancel")).toBeUndefined()
  expect(node("http-collection-draft").screenY).toBe(
    node("http-collection-directory-Team").screenY + 1,
  )
  await key("RETURN")
  expect(find("http-collection-name-input")).toBeDefined()
  await key("ESCAPE")
  expect(await readdir(join(home, "Team"))).toEqual(["api.http"])
  await action("create-folder")
  await name("Folder")
  await key("RETURN")
  await settle(
    () =>
      Boolean(find("http-collection-directory-Team/Folder")) && !find("http-collection-name-input"),
  )
  await click("http-collection-file-Team/api.http")
  await action("create-request")
  await name("a new call")
  expect(find("http-collection-menu")).toBeUndefined()
  expect(find("http-collection-action-form")).toBeUndefined()
  expect(node("http-collection-draft").screenY).toBe(
    node("http-collection-file-Team/api.http").screenY + 1,
  )
  await key("RETURN")
  await settle(
    () =>
      Boolean(find("http-navigation-project-Team/api.http#a-new-call")) &&
      !find("http-collection-name-input"),
  )
  expect(await readFile(join(home, "Team/api.http"), "utf8")).toContain("a new call")
})

test("request menu renames inline, duplicates once and confirms deletion", async () => {
  await mount()
  await key("ARROW_RIGHT")
  await key("ARROW_DOWN")
  expect(find("http-collection-actions-request:Team/api.http#list")).toBeDefined()
  await openMenu()
  expect(find("http-collection-menu-create-request")).toBeUndefined()
  expect(find("http-collection-menu-delete")).toBeDefined()
  const y = node("http-navigation-project-Team/api.http#list").screenY
  await click("http-collection-menu-rename")
  await name("Renamed")
  expect(node("http-collection-name-input").screenY).toBe(y)
  await key("RETURN")
  await settle(() => !find("http-collection-name-input"))
  expect(await readFile(join(home, "Team/api.http"), "utf8")).toContain("Renamed")
  await key("ESCAPE")
  await key("c")
  // Select the request after the collection's stable @name was preserved.
  await click("http-collection-file-Team/api.http")
  await key("ARROW_RIGHT")
  await key("ARROW_DOWN")
  await action("duplicate")
  await name("Copy")
  await act(async () => {
    tui?.mockInput.pressEnter()
    tui?.mockInput.pressEnter()
    await tui?.renderOnce()
  })
  await settle(() => !find("http-collection-name-input"))
  let copied = await readFile(join(home, "Team/api.http"), "utf8")
  expect(copied.match(/### Copy/g)).toHaveLength(1)
  expect(copied).toContain("Renamed")
  await click("http-document-Team/api.http#renamed")
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-url-input")
  await act(async () => {
    const url = node("http-url-input") as InputRenderable
    url.selectAll()
    tui?.mockInput.typeText("https://example.invalid/original-after-copy")
    await tui?.renderOnce()
  })
  await key("s", true)
  for (let attempt = 0; attempt < 100; attempt++) {
    copied = await readFile(join(home, "Team/api.http"), "utf8")
    if (copied.includes("original-after-copy")) break
    await act(async () => {
      await Bun.sleep(10)
      await tui?.renderOnce()
    })
  }
  expect(copied).toContain("original-after-copy")
  expect(find("http-external-conflict-modal")).toBeUndefined()
  await key("ESCAPE")
  await key("c")
  await click("http-collection-file-Team/api.http")
  await key("ARROW_RIGHT")
  await key("END")
  await action("delete")
  expect(find("http-collection-action-form")).toBeDefined()
  expect(await readFile(join(home, "Team/api.http"), "utf8")).toBe(copied)
  await key("ESCAPE")
  expect(find("http-collection-action-form")).toBeUndefined()
  await action("delete")
  await key("RETURN")
  await settle(() => !find("http-collection-action-form"))
  expect(await readFile(join(home, "Team/api.http"), "utf8")).not.toContain("### Copy")
  expect(await readFile(join(home, "Team/api.http"), "utf8")).toContain("### Renamed")
})

test("dismisses collection menus when HTTP loses its active scope", async () => {
  await mount()
  await openMenu()
  await act(async () => {
    setWorkspaceActive?.(false)
    await tui?.renderOnce()
  })
  await settle(() => !find("http-collection-menu"))
  await key("a")
  expect(find("http-collection-menu")).toBeUndefined()
  await act(async () => {
    setWorkspaceActive?.(true)
    await tui?.renderOnce()
  })
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-url-input")
  await key("ESCAPE")
  await key("c")
  await openMenu()
  await key("ESCAPE")
  expect(find("http-collection-menu")).toBeUndefined()
})

test("deletion notification owns focus and restores the tree after refusal or deleting its origin", async () => {
  await mount(52)
  const origin = tui?.renderer.currentFocusedRenderable?.id
  const originalY = node("http-collection-file-Team/api.http").screenY
  await action("delete")
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-collection-action-form")
  expect(node("http-collection-file-Team/api.http").screenY).toBe(originalY)
  await act(async () => {
    await tui?.mockMouse.click(0, 20)
    tui?.mockInput.pressKey("g", { ctrl: true })
    tui?.mockInput.pressKey("c")
    await tui?.renderOnce()
  })
  expect(find("http-collection-action-form")).toBeDefined()
  expect(tui?.renderer.currentFocusedRenderable?.id).toBe("http-collection-action-form")
  await key("ESCAPE")
  expect(tui?.renderer.currentFocusedRenderable?.id).toBe(origin)
  expect(await readFile(join(home, "Team/api.http"), "utf8")).toBe(original)
  await action("delete")
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-collection-action-form")
  await key("RETURN")
  await settle(() => !find("http-collection-file-Team/api.http"))
  expect(tui?.renderer.currentFocusedRenderable?.id).toBe("http-navigation-collection")
  expect(await readdir(join(home, "Team"))).toEqual([])
})

test("a refused deletion preserves dirty requests and exposes its error after confirmation closes", async () => {
  await mount(120, true)
  await key("ARROW_RIGHT")
  await key("ARROW_DOWN")
  await key("RETURN")
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-url-input")
  await act(async () => {
    const url = node("http-url-input") as InputRenderable
    url.selectAll()
    tui?.mockInput.typeText("https://example.invalid/unsaved")
  })
  await key("ESCAPE")
  await key("c")
  await click("http-collection-file-Team/api.http")
  const origin = tui?.renderer.currentFocusedRenderable?.id
  await action("delete")
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-collection-action-form")
  await key("RETURN")
  await settle(() => !find("http-collection-action-form") && Boolean(find("app-notification-0")))
  expect(tui?.renderer.currentFocusedRenderable?.id).toBe(origin)
  expect(await readFile(join(home, "Team/api.http"), "utf8")).toBe(original)
  expect((node("http-url-input") as InputRenderable).value).toBe("https://example.invalid/unsaved")
  expect(tui?.captureCharFrame()).toContain("Salve ou feche")
})

test.each(["framed", "compact"] as const)(
  "keeps a draft at the bottom visible and preserves its input through resize in %s",
  async (layout) => {
    updateUiSettings({ layout })
    await mount()
    const source = Array.from(
      { length: 35 },
      (_, index) =>
        `### Request ${index.toString().padStart(2, "0")}\n# @name request-${index}\nGET https://example.invalid/${index}\n`,
    ).join("\n")
    await writeFile(join(home, "Team/api.http"), source)
    await key("ARROW_RIGHT")
    await settle(() => Boolean(find("http-navigation-project-Team/api.http#request-34")))
    await key("END")
    await openMenu()
    expect(
      node("http-collection-menu").screenY + node("http-collection-menu").height,
    ).toBeLessThanOrEqual(32)
    await click("http-collection-menu-duplicate")
    await name("Bottom copy")
    const input = node("http-collection-name-input") as InputRenderable
    for (const width of [52, 160, 120]) {
      await act(async () => {
        tui?.resize(width, 32)
        await tui?.renderOnce()
      })
      await settle(() => {
        const { viewport } = node("http-collection-scroll") as ScrollBoxRenderable
        return (
          input.width > 0 &&
          input.screenY >= viewport.screenY &&
          input.screenY + input.height <= viewport.screenY + viewport.height
        )
      })
      expect(node("http-collection-name-input")).toBe(input)
      expect(input.value).toBe("Bottom copy")
      expect(input.screenX + input.width).toBeLessThanOrEqual(width)
    }
    await key("ESCAPE")
    await settle(() => !find("http-collection-name-input"))
    expect(await readFile(join(home, "Team/api.http"), "utf8")).toBe(source)
  },
)

test("Escape cancels a collection without closing its dialog and permits retry", async () => {
  let sent = 0
  let aborted = 0
  globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
    sent++
    if (sent > 1) return Response.json({ retried: true })
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener(
        "abort",
        () => {
          aborted++
          reject(new DOMException("Aborted", "AbortError"))
        },
        { once: true },
      )
    })
  }) as typeof fetch
  await mount()
  await click("http-collection-file-Team/api.http", 2)
  await click("http-collection-menu-run-collection")
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-collection-runner-target")
  await key("x")
  expect(sent).toBe(0)
  await key("RETURN", true)
  await settle(() => sent === 1)
  await click("http-collection-runner-dataset")
  await settle(
    () => tui?.renderer.currentFocusedRenderable?.id === "http-collection-runner-dataset",
  )
  await key("ESCAPE")
  expect(aborted).toBe(0)
  await key("ESCAPE")
  await settle(() => tui?.captureCharFrame().includes("CANCELADO") ?? false)
  expect(aborted).toBe(1)
  expect(find("http-collection-runner-modal")).toBeDefined()
  await key("RETURN", true)
  await settle(() => tui?.captureCharFrame().includes("CONCLUÍDO") ?? false)
  expect(sent).toBe(2)
  await key("ESCAPE")
  await settle(() => !find("http-collection-runner-modal"))
})

test("runs only the selected collection, including requests hidden by search", async () => {
  const sent: string[] = []
  globalThis.fetch = (async (input: string | URL | Request) => {
    sent.push(String(input instanceof Request ? input.url : input))
    return Response.json({ ok: true })
  }) as typeof fetch
  await mount(120, false, {
    "api.http": `${original}\n### Details\n# @name details\nGET https://example.invalid/details\n`,
    "other.http": "### Other\n# @name other\nGET https://example.invalid/other\n",
    "empty.http": "# Empty collection\n",
  })
  await key("f")
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-collection-search")
  await act(async () => tui?.mockInput.typeText("List"))
  await key("ESCAPE")
  await click("http-collection-file-Team/api.http", 2)
  await click("http-collection-menu-run-collection")
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-collection-runner-target")
  const target = () =>
    (node("http-collection-runner-target-name") as { plainText?: string }).plainText
  expect(target()).toBe("api.http")
  expect(sent).toEqual([])
  for (const expected of ["List", "Details", "api.http"]) {
    await key("t")
    expect(target()).toBe(expected)
  }
  expect(sent).toEqual([])
  await key("RETURN", true)
  await settle(() => tui?.captureCharFrame().includes("CONCLUÍDO") ?? false)
  expect(sent).toEqual(["https://example.invalid/users", "https://example.invalid/details"])
  await key("ESCAPE")
  await key("f")
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-collection-search")
  await act(async () => {
    ;(node("http-collection-search") as InputRenderable).value = ""
  })
  await key("ESCAPE")
  await click("http-collection-file-Team/other.http", 2)
  await click("http-collection-menu-run-collection")
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-collection-runner-target")
  expect(target()).toBe("other.http")
  await key("RETURN", true)
  await settle(() => tui?.captureCharFrame().includes("CONCLUÍDO") ?? false)
  expect(sent).toEqual([
    "https://example.invalid/users",
    "https://example.invalid/details",
    "https://example.invalid/other",
  ])
  await key("ESCAPE")
  await click("http-collection-file-Team/empty.http", 2)
  await click("http-collection-menu-run-collection")
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-collection-runner-target")
  await key("RETURN", true)
  await settle(() => tui?.captureCharFrame().includes("Nenhum request") ?? false)
  expect(sent).toHaveLength(3)
})

test("replaces Commands and its legacy keys with collection and local workspace menus", async () => {
  await mount()
  expect(find("http-collection-help")).toBeUndefined()
  expect(find("http-collection-runner-button")).toBeUndefined()
  expect(tui?.captureCharFrame()).not.toContain("Comandos")
  for (const letter of ["n", "N", "p", "e", "d", "o", "i", "r"]) {
    await key(letter)
    expect(find("http-collection-action-form")).toBeUndefined()
    expect(find("http-collection-name-input")).toBeUndefined()
    expect(find("http-collection-runner-modal")).toBeUndefined()
    expect(find("http-collection-import-modal")).toBeUndefined()
    expect(find("http-postman-modal")).toBeUndefined()
    expect(find("http-environment-manager-modal")).toBeUndefined()
  }
  expect(await readFile(join(home, "Team/api.http"), "utf8")).toBe(original)
  await key("c")
  await key("HOME")
  await openMenu()
  for (const action of ["create-collection", "create-folder", "import-collection"])
    expect(find(`http-collection-menu-${action}`)).toBeDefined()
  expect(find("http-collection-menu-run-collection")).toBeUndefined()
  await key("ESCAPE")
  await click("http-collection-workspace-heading", 2)
  await click("http-collection-menu-import-collection")
  await settle(() => Boolean(find("http-collection-import-modal")))
})
