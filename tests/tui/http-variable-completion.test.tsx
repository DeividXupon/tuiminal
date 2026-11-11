import "./setup"
import { afterEach, expect, test } from "bun:test"
import { InputRenderable, RGBA, type TextareaRenderable } from "@opentui/core"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import { HttpClient } from "../../packages/feature-http/src/HttpClient"
import { saveHttpLastWorkspace } from "../../packages/feature-http/src/storage/last-workspace"

let tui: TestRendererSetup | undefined
const originalFetch = globalThis.fetch
const originalSecrets = Bun.secrets
const id = "postman/c1.http#r1"
let failVariableSave = false
let variableWrites: string[] = []
function required<T>(value: T | null | undefined): T {
  if (value == null) throw Error("Missing test fixture value")
  return value
}
const viewport = () => required(tui)
const node = (id: string) => viewport().renderer.root.findDescendantById(id)
const mustNode = (id: string) => required(node(id))
afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  globalThis.fetch = originalFetch
  Object.assign(Bun, { secrets: originalSecrets })
})
async function settle(check: () => boolean) {
  for (let n = 0; n < 180; n++) {
    await act(async () => {
      await Bun.sleep(10)
      await viewport().renderOnce()
    })
    if (check()) return
  }
  throw Error(`Focus: ${tui?.renderer.currentFocusedRenderable?.id}\n${tui?.captureCharFrame()}`)
}
async function click(id: string) {
  await settle(() => Boolean(node(id)?.width))
  const target = mustNode(id)
  await act(async () => {
    await viewport().mockMouse.click(target.screenX + 1, target.screenY)
    await viewport().renderOnce()
  })
}
async function key(name: string) {
  await act(async () => {
    viewport().mockInput.pressKey(name)
    await Bun.sleep(70)
    await viewport().renderOnce()
  })
}
async function mount(width: number, bodyKind = "raw") {
  failVariableSave = false
  variableWrites = []
  let globalValues = [{ key: "golbal", value: "254157" }]
  let environmentValues = [
    { key: "env_env", value: "environment value" },
    { key: "env_2", value: "second value" },
  ]
  let collectionValues = [{ key: "lps_name", value: "collection value" }]
  Object.assign(Bun, {
    secrets: {
      get: async () => JSON.stringify({ apiKey: "PMAK-completion-fixture", region: "us" }),
    },
  })
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input)).pathname
    if (init?.method === "PUT") {
      if (failVariableSave) return Response.json({}, { status: 503 })
      variableWrites.push(path)
      const body = JSON.parse(String(init.body))
      if (path.endsWith("/global-variables")) globalValues = body.values
      if (path === "/environments/e1") environmentValues = body.environment.values
      if (path === "/collections/c1") collectionValues = body.collection.variable
      return Response.json({})
    }
    if (path === "/workspaces")
      return Response.json({ workspaces: [{ id: "w1", name: "Completion workspace" }] })
    if (path === "/environments")
      return Response.json({ environments: [{ id: "e1", name: "Stage" }] })
    if (path === "/environments/e1")
      return Response.json({
        environment: {
          name: "Stage",
          values: environmentValues,
        },
      })
    if (path.endsWith("/global-variables")) return Response.json({ values: globalValues })
    if (path === "/collections")
      return Response.json({ collections: [{ id: "c1", name: "Completion collection" }] })
    if (path === "/collections/c1")
      return Response.json({
        collection: {
          info: { name: "Completion collection" },
          variable: collectionValues,
          item: [
            {
              id: "r1",
              name: "Completion call",
              request: {
                method: "POST",
                url: {
                  raw: "https://example.invalid/",
                  query: [{ key: "query", value: "QUERY_FIXTURE" }],
                },
                header: [{ key: "X-Example", value: "HEADER_FIXTURE" }],
                body:
                  bodyKind === "raw"
                    ? { mode: "raw", raw: "BODY_FIXTURE", options: { raw: { language: "json" } } }
                    : {
                        mode: bodyKind,
                        [bodyKind]: [{ key: "FORM_NAME", value: "FORM_VALUE", type: "text" }],
                      },
              },
            },
          ],
        },
      })
    throw Error(`Unexpected fixture request ${path}`)
  }) as typeof fetch
  saveHttpLastWorkspace({ source: "postman", workspaceId: "w1", environmentId: "e1" })
  tui = await testRender(<HttpClient active />, { width, height: 40 })
  await click("http-source-postman-card")
  await click("http-collection-file-postman/c1.http")
  await click(`http-navigation-project-${id}`)
  await settle(() => Boolean(node("http-url-input")))
}
async function edit(targetId: string, prefix = "{{") {
  await click(targetId)
  const input = node(targetId) as TextareaRenderable
  await act(async () => {
    input.selectAll()
    viewport().mockInput.pasteBracketedText(prefix)
  })
  await settle(() => Boolean(node("http-variable-suggestions")))
  return input
}
function findValue(value: string) {
  const visit = (root: NonNullable<ReturnType<typeof node>>): InputRenderable | undefined => {
    if (root instanceof InputRenderable && root.value === value) return root
    for (const child of root.getChildren()) {
      const result = visit(child)
      if (result) return result
    }
    return undefined
  }
  const found = visit(viewport().renderer.root)
  if (!found) throw Error(`Missing field value ${value}`)
  return found.id
}
async function completeGlobal(targetId: string) {
  const input = await edit(targetId)
  await key("ARROW_DOWN")
  await key("ARROW_DOWN")
  await settle(() => viewport().captureCharFrame().includes("254157"))
  await key("TAB")
  await settle(() => !node("http-variable-suggestions"))
  expect(input.plainText).toBe("{{golbal}}")
  expect(viewport().renderer.currentFocusedRenderable).toBe(input)
}
test("variable suggestions require two braces and close when one is deleted", async () => {
  await mount(120)
  for (const targetId of ["http-url-input", `http-body-editor-${id}`]) {
    if (targetId !== "http-url-input") await click("http-request-view-body")
    await click(targetId)
    const input = mustNode(targetId) as TextareaRenderable
    await act(async () => {
      input.selectAll()
      viewport().mockInput.pasteBracketedText("{")
    })
    await key("ARROW_LEFT")
    await key("ARROW_RIGHT")
    expect(input.plainText).toBe("{")
    expect(node("http-variable-suggestions")).toBeUndefined()
    await key("{")
    await settle(() => Boolean(node("http-variable-suggestions")))
    expect(input.plainText).toBe("{{")
    await key("BACKSPACE")
    await settle(() => !node("http-variable-suggestions"))
    expect(input.plainText).toBe("{")
    await key("{")
    await settle(() => Boolean(node("http-variable-suggestions")))
    await key("TAB")
    await settle(() => !node("http-variable-suggestions"))
    expect(input.plainText).toBe("{{env_env}}")
    expect(viewport().renderer.currentFocusedRenderable).toBe(input)
  }
}, 30000)

test.each([52, 120])(
  "variable menu follows cursor, badges, values and selection at %s columns",
  async (width) => {
    await mount(width)
    const input = await edit("http-url-input", "https://example.invalid/日本/{{")
    await settle(() => mustNode("http-variable-suggestions").screenY === input.screenY + 1)
    const popup = mustNode("http-variable-suggestions")
    expect(popup.screenX).toBe(
      Math.min(input.screenX + input.visualCursor.visualCol, width - popup.width),
    )
    for (const [name, color] of [
      ["env_env", "#2563eb"],
      ["golbal", "#238636"],
      ["lps_name", "#8b5a2b"],
    ]) {
      const row = mustNode(`http-url-variable-${name}`)
      expect(
        viewport()
          .captureSpans()
          .lines[row.screenY]?.spans.some((span) =>
            span.bg.toInts().every((v, i) => v === RGBA.fromHex(required(color)).toInts()[i]),
          ),
      ).toBe(true)
    }
    await key("ARROW_DOWN")
    await key("ARROW_DOWN")
    await settle(() => viewport().captureCharFrame().includes("254157"))
    expect(mustNode("http-variable-selected-value").screenY).toBe(
      mustNode("http-url-variable-golbal").screenY + 1,
    )
    await click("http-url-variable-golbal")
    await settle(() => !node("http-variable-suggestions"))
    expect(input.plainText).toBe("https://example.invalid/日本/{{golbal}}")
    expect(viewport().renderer.currentFocusedRenderable).toBe(input)
    await edit("http-url-input")
    for (let i = 0; i < 5; i++) await key("ARROW_DOWN")
    await settle(() => Boolean(node("http-url-variable-$isoTimestamp")?.width))
    expect(mustNode("http-url-variable-$isoTimestamp").screenY).toBeLessThan(40)
    await key("ESCAPE")
    expect(node("http-variable-suggestions")).toBeUndefined()
    expect(viewport().renderer.currentFocusedRenderable).toBe(input)
    await key("ARROW_LEFT")
    await key("ARROW_RIGHT")
    await settle(() => Boolean(node("http-variable-suggestions")))
  },
  30000,
)

test("request fields share completion without losing focus or changing password masking", async () => {
  await mount(120)
  await click("http-request-view-headers")
  await completeGlobal(findValue("HEADER_FIXTURE"))
  await completeGlobal(findValue("X-Example"))
  await click("http-request-view-params")
  await completeGlobal(findValue("QUERY_FIXTURE"))
  await completeGlobal(findValue("query"))
  await click("http-request-view-auth")
  await click("http-auth-kind-bearer")
  await completeGlobal(`http-auth-token-${id}`)
  expect(viewport().captureCharFrame()).not.toContain("{{golbal}}")
  await click("http-auth-kind-basic")
  await completeGlobal(`http-auth-username-${id}`)
  await completeGlobal(`http-auth-password-${id}`)
  await click("http-auth-kind-api-key")
  await completeGlobal(`http-auth-key-name-${id}`)
  await completeGlobal(`http-auth-key-value-${id}`)
  await click("http-request-view-body")
  const body = await edit(`http-body-editor-${id}`, '{\n  "value": "{{')
  await settle(
    () =>
      mustNode("http-variable-suggestions").screenY ===
      body.screenY + body.visualCursor.visualRow + 1,
  )
  await key("ARROW_DOWN")
  await key("ARROW_DOWN")
  await key("TAB")
  await settle(() => body.plainText.includes("{{golbal}}"))
  expect(body.plainText).toBe('{\n  "value": "{{golbal}}')
  expect(viewport().renderer.currentFocusedRenderable).toBe(body)
  await key("ESCAPE")
  await click("http-request-view-scripts")
  const script = node(`http-script-editor-preRequest-${id}`) as TextareaRenderable
  await click(script.id)
  await act(async () => viewport().mockInput.pasteBracketedText("{{"))
  await settle(() => script.plainText === "{{")
  expect(node("http-variable-suggestions")).toBeUndefined()
}, 30000)

test.each(["urlencoded", "formdata"])(
  "%s names and values use the same variable menu",
  async (kind) => {
    await mount(120, kind)
    await click("http-request-view-body")
    await completeGlobal(findValue("FORM_VALUE"))
    await completeGlobal(findValue("FORM_NAME"))
  },
  30000,
)

async function reference(name: string) {
  await click("http-url-input")
  const input = mustNode("http-url-input") as InputRenderable
  await act(async () => {
    input.selectAll()
    viewport().mockInput.pasteBracketedText(`https://example.invalid/{{${name}}}`)
  })
  await key("ARROW_LEFT")
  await key("ARROW_LEFT")
  await key("ARROW_LEFT")
  return input
}
async function changeTooltip(value: string) {
  await key("ARROW_DOWN")
  const input = mustNode("http-variable-value-input") as InputRenderable
  expect(viewport().renderer.currentFocusedRenderable).toBe(input)
  await act(async () => {
    input.selectAll()
    viewport().mockInput.pasteBracketedText(value)
  })
  return input
}
test.each([
  ["golbal", "/workspaces/w1/global-variables"],
  ["env_env", "/environments/e1"],
  ["lps_name", "/collections/c1"],
])(
  "reference %s is blue and its tooltip edits its original scope",
  async (name, path) => {
    await mount(120)
    const input = await reference(name)
    expect(node("http-variable-inspector")).toBeUndefined()
    await settle(() => Boolean(node("http-variable-inspector")?.width))
    expect(viewport().renderer.currentFocusedRenderable).toBe(input)
    const blue = RGBA.fromHex("#7dd3fc").toInts()
    expect(
      viewport()
        .captureSpans()
        .lines[input.screenY]?.spans.some(
          (span) => span.text.includes(name) && span.fg.toInts().every((v, i) => v === blue[i]),
        ),
    ).toBe(true)
    const original = input.value
    await changeTooltip("updated value")
    await key("ESCAPE")
    await settle(() => !node("http-variable-inspector"))
    expect(variableWrites).toEqual([path])
    expect(input.value).toBe(original)
    expect(viewport().renderer.currentFocusedRenderable).toBe(input)
    await key("END")
    await key("ARROW_LEFT")
    await settle(() => Boolean(node("http-variable-inspector")?.width))
    expect((mustNode("http-variable-value-input") as InputRenderable).value).toBe("updated value")
  },
  30000,
)

test("failed tooltip saves retain value and retry once; blur also saves", async () => {
  await mount(120)
  await reference("golbal")
  await settle(() => Boolean(node("http-variable-inspector")?.width))
  const field = await changeTooltip("retry value")
  failVariableSave = true
  await key("ESCAPE")
  await settle(() => viewport().captureCharFrame().includes("503"))
  expect(field.value).toBe("retry value")
  expect(viewport().renderer.currentFocusedRenderable).toBe(field)
  failVariableSave = false
  await key("ESCAPE")
  await settle(() => !node("http-variable-inspector"))
  expect(variableWrites).toHaveLength(1)
  await key("END")
  await key("ARROW_LEFT")
  await settle(() => Boolean(node("http-variable-inspector")?.width))
  await changeTooltip("blur value")
  await click("http-url-input")
  await settle(() => !node("http-variable-inspector"))
  expect(variableWrites).toHaveLength(2)
}, 30000)

test("mouse hover opens after one second without moving the text cursor", async () => {
  await mount(120)
  const input = await reference("golbal")
  await key("HOME")
  const cursor = input.cursorOffset
  await act(async () => {
    await viewport().mockMouse.moveTo(input.screenX + 26, input.screenY)
    await Bun.sleep(500)
    await viewport().renderOnce()
  })
  expect(node("http-variable-inspector")).toBeUndefined()
  await settle(() => Boolean(node("http-variable-inspector")?.width))
  expect(input.cursorOffset).toBe(cursor)
  await changeTooltip("mouse value")
  await key("ESCAPE")
  await settle(() => !node("http-variable-inspector"))
  expect(variableWrites).toHaveLength(1)
}, 30000)

test("body references retain their blue highlight after syntax parsing and mouse hover", async () => {
  await mount(120)
  await click("http-request-view-body")
  const body = mustNode(`http-body-editor-${id}`) as TextareaRenderable
  const text = '{\n  "日本": "{{env_env}}"\n}'
  await click(body.id)
  await act(async () => {
    body.selectAll()
    viewport().mockInput.pasteBracketedText(text)
    body.gotoBufferHome()
  })
  await settle(() => viewport().captureCharFrame().includes("{{env_env}}"))
  await act(async () => {
    await viewport().mockMouse.moveTo(body.screenX + 13, body.screenY + 1)
  })
  await settle(() => Boolean(node("http-variable-inspector")?.width))
  await settle(() => node("http-variable-inspector")?.screenY === body.screenY + 2)
  const popup = mustNode("http-variable-inspector")
  expect(popup.screenY).toBe(body.screenY + 2)
  const blue = RGBA.fromHex("#7dd3fc").toInts()
  expect(
    viewport()
      .captureSpans()
      .lines[body.screenY + 1]?.spans.some(
        (span) => span.text.includes("env_env") && span.fg.toInts().every((v, i) => v === blue[i]),
      ),
  ).toBe(true)
  await changeTooltip("body value")
  await key("ESCAPE")
  await settle(() => !node("http-variable-inspector"))
  expect(body.plainText).toBe(text)
  expect(viewport().renderer.currentFocusedRenderable).toBe(body)
}, 30000)

test("mouse hover resolves a wrapped reference in a narrow body editor", async () => {
  await mount(52)
  await click("http-request-view-body")
  const body = mustNode(`http-body-editor-${id}`) as TextareaRenderable
  await click(body.id)
  await act(async () => {
    body.selectAll()
    viewport().mockInput.pasteBracketedText(`${"prefix ".repeat(14)}{{golbal}}`)
    body.gotoBufferHome()
  })
  await settle(() => viewport().captureCharFrame().includes("{{golbal}}"))
  const lines = viewport().captureCharFrame().split("\n")
  const row = lines.findIndex((line) => line.includes("{{golbal}}"))
  const column = required(lines[row]).indexOf("{{golbal}}") + 3
  expect(row).toBeGreaterThan(body.screenY)
  await act(async () => {
    await viewport().mockMouse.moveTo(column, row)
  })
  await settle(() => Boolean(node("http-variable-inspector")?.width))
  expect((mustNode("http-variable-value-input") as InputRenderable).value).toBe("254157")
}, 30000)
