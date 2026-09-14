import "./setup"
import { afterEach, expect, test } from "bun:test"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import { updateUiSettings } from "../../packages/core/src/settings/theme"
import { GitViewer } from "../../packages/feature-git/src"
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
