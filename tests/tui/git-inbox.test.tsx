import "./setup"
import { afterEach, expect, test } from "bun:test"
import type { TestRendererSetup } from "@opentui/core/testing"
import type { TextRenderable } from "@opentui/core"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import { updateUiSettings } from "../../packages/core/src/settings/theme"
import { GitViewer } from "../../packages/feature-git/src"
import { InboxWorkspace } from "../../packages/feature-git/src/InboxWorkspace"
import { DEMO_INBOX_NOTIFICATIONS } from "../../packages/feature-git/src/model/inbox/fixtures"
import { InboxList } from "../../packages/feature-git/src/ui/inbox/InboxList"
import { IssueSectionEditorModal } from "../../packages/feature-git/src/ui/issue/IssueSectionEditorModal"
import { SectionEditorModal } from "../../packages/feature-git/src/ui/pr/SectionEditorModal"

let tui: TestRendererSetup | undefined
const initialDemo = process.env.TUIMINAL_GIT_INBOX_DEMO

async function key(name: string, options: { ctrl?: boolean; shift?: boolean } = {}) {
  act(() => tui?.mockInput.pressKey(name, options))
  if (name.toLowerCase() === "escape") await act(async () => Bun.sleep(60))
  await tui?.renderOnce()
}

afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  if (initialDemo === undefined) delete process.env.TUIMINAL_GIT_INBOX_DEMO
  else process.env.TUIMINAL_GIT_INBOX_DEMO = initialDemo
})

test("Git lazy mounts Inbox as tab 4 and keeps remote writes behind confirmation", async () => {
  process.env.TUIMINAL_GIT_INBOX_DEMO = "1"
  updateUiSettings({ layout: "compact", language: "pt-BR" })
  tui = await testRender(<GitViewer active />, { width: 140, height: 30 })
  await tui.renderOnce()

  expect(tui.captureCharFrame()).toContain("[4] INBOX")
  expect(tui.captureCharFrame()).not.toContain("INBOX · DEMO")
  await key("4")
  expect(tui.captureCharFrame()).toContain("INBOX · DEMO")
  expect(tui.captureCharFrame()).toContain("Evitar corrida na atualização automática")
  expect(tui.captureCharFrame()).not.toContain("ATUALIZAÇÃO AUTOMÁTICA ATIVA")

  await key("d")
  expect(tui.captureCharFrame()).toContain("CONCLUIR NOTIFICAÇÃO")
  expect(tui.captureCharFrame()).toContain("[Ctrl+S] Confirmar")
  await key("ESCAPE")
  expect(tui.captureCharFrame()).not.toContain("CONCLUIR NOTIFICAÇÃO")
})

test("Inbox displays an in-list loader while an automatic page is arriving", async () => {
  tui = await testRender(
    <InboxList
      items={DEMO_INBOX_NOTIFICATIONS}
      selectedIndex={2}
      focused
      width={80}
      savedIds={new Set()}
      loadingMore
      loadingFrame="◒"
      onSelect={() => undefined}
    />,
    { width: 84, height: 14 },
  )
  await tui.renderOnce()
  expect(tui.captureCharFrame()).toContain("◒ Carregando mais notificações…")
  expect(tui.renderer.root.findDescendantById("git-inbox-page-loader")).not.toBeNull()
})

for (const width of [70, 140]) {
  test(`Inbox preview owns navigation and returns to the same list row at width ${width}`, async () => {
    process.env.TUIMINAL_GIT_INBOX_DEMO = "1"
    updateUiSettings({ layout: "compact", language: "pt-BR" })
    tui = await testRender(<InboxWorkspace active />, { width, height: 24 })
    await tui.renderOnce()
    await key("j")
    await key("RETURN")
    const title = () => {
      const heading = tui?.renderer.root.findDescendantById("git-inbox-preview-title")
      if (!heading) throw new Error("Missing inbox preview title")
      return (heading as TextRenderable).plainText
    }
    expect(title()).toBe(DEMO_INBOX_NOTIFICATIONS[1]?.title ?? "")
    if (width === 70) {
      expect(tui.renderer.root.findDescendantById("git-inbox-list-panel")).toBeUndefined()
    }
    await key("j")
    await key("d", { ctrl: true })
    await key("u", { ctrl: true })
    expect(title()).toBe(DEMO_INBOX_NOTIFICATIONS[1]?.title ?? "")
    expect(tui.captureCharFrame()).not.toContain("CONCLUIR NOTIFICAÇÃO")
    expect(tui.captureCharFrame()).not.toContain("PARAR DE ACOMPANHAR")
    await key("ESCAPE")
    expect(tui.renderer.root.findDescendantById("git-inbox-list-panel")).toBeTruthy()
    await key("j")
    await key("l")
    expect(title()).toBe(DEMO_INBOX_NOTIFICATIONS[2]?.title ?? "")
    if (width === 140) {
      await key("h")
      const target = tui.renderer.root.findDescendantById("git-inbox-preview-title")
      if (!target) throw new Error("Missing preview title")
      await act(async () => tui?.mockMouse.click(target.screenX + 1, target.screenY))
      await key("k")
      expect(title()).toBe(DEMO_INBOX_NOTIFICATIONS[2]?.title ?? "")
    }
  })
}

for (const itemIndex of [0, 1]) {
  test(`Inbox shows the ${itemIndex === 0 ? "PR" : "Issue"} conversation with reply, reaction and modal focus`, async () => {
    process.env.TUIMINAL_GIT_INBOX_DEMO = "1"
    updateUiSettings({ layout: "compact", language: "pt-BR" })
    tui = await testRender(<InboxWorkspace active />, { width: 140, height: 32 })
    await tui.renderOnce()
    if (itemIndex) await key("j")
    await key("l")
    await key("v")
    expect(tui.captureCharFrame()).toContain("[Enter] Responder")
    expect(tui.captureCharFrame()).toContain(itemIndex ? "↳ @bia" : "↳ @ana")
    await key("e")
    expect(tui.captureCharFrame()).toContain("REAGIR NO COMENTÁRIO")
    await key("2")
    await key("s", { ctrl: true })
    await act(async () => Bun.sleep(20))
    await tui.renderOnce()
    expect(tui.captureCharFrame()).not.toContain("REAGIR NO COMENTÁRIO")
    expect(tui.captureCharFrame()).toContain("INBOX · DEMO")
    await key("j")
    await key("RETURN")
    expect(tui.captureCharFrame()).toContain("RESPONDER COMENTÁRIO")
    await act(async () => Bun.sleep(10))
    await tui.renderOnce()
    await key("ESCAPE")
    expect(tui.captureCharFrame()).toContain("RESPONDER COMENTÁRIO")
    await key("ESCAPE")
    expect(tui.captureCharFrame()).not.toContain("RESPONDER COMENTÁRIO")
    expect(tui.captureCharFrame()).toContain("[Enter] Responder")
    await key("?")
    expect(
      tui.renderer.root.findDescendantById("git-action-palette-row-comment-react"),
    ).toBeTruthy()
    await key("ESCAPE")
    await key("h")
    await key(itemIndex ? "k" : "j")
    await key("l")
    expect(
      (tui.renderer.root.findDescendantById("git-inbox-preview-title") as TextRenderable).plainText,
    ).toBe(DEMO_INBOX_NOTIFICATIONS[itemIndex ? 0 : 1]?.title ?? "")
    expect(tui.captureCharFrame()).toContain("[Enter] Responder")
  })
}

test("PR query editor applies GitHub autocomplete from the keyboard", async () => {
  let applied = ""
  tui = await testRender(
    <SectionEditorModal
      open
      mode="query"
      initialTitle=""
      initialQuery="is:open rev"
      repositories={["team/api"]}
      onClose={() => undefined}
      onApply={(query) => {
        applied = query
      }}
      onSave={() => undefined}
    />,
    { width: 100, height: 24 },
  )
  await act(async () => Bun.sleep(10))
  await tui.renderOnce()
  expect(tui.captureCharFrame()).toContain("review-requested:@me")
  await key("y", { ctrl: true })
  expect(tui.captureCharFrame()).toContain("is:open review-requested:@me")
  act(() => tui?.mockInput.pressEnter())
  await tui.renderOnce()
  expect(applied).toBe("is:open review-requested:@me")
})

test("Issue query editor applies GitHub autocomplete from the keyboard", async () => {
  let applied = ""
  tui = await testRender(
    <IssueSectionEditorModal
      mode="query"
      initialTitle=""
      initialQuery="is:open no:"
      repositories={["team/api"]}
      onClose={() => undefined}
      onApply={(query) => {
        applied = query
      }}
      onSave={() => undefined}
    />,
    { width: 100, height: 24 },
  )
  await act(async () => Bun.sleep(10))
  await tui.renderOnce()
  expect(tui.captureCharFrame()).toContain("no:assignee")
  await key("y", { ctrl: true })
  expect(tui.captureCharFrame()).toContain("is:open no:assignee")
  act(() => tui?.mockInput.pressEnter())
  await tui.renderOnce()
  expect(applied).toBe("is:open no:assignee")
})
