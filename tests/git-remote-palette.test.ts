import { describe, expect, test } from "bun:test"
import { actionPaletteActionForKey } from "../packages/core/src/ui/action-palette"
import { inboxPaletteActions } from "../packages/feature-git/src/model/inbox/palette"
import { issuePaletteActions } from "../packages/feature-git/src/model/issue/palette"
import { pullRequestActionKindForShortcut } from "../packages/feature-git/src/model/pr/navigation"
import {
  PULL_REQUEST_MUTATIONS,
  pullRequestPaletteActions,
} from "../packages/feature-git/src/model/pr/palette"
import { remoteDashboardCommand } from "../packages/feature-git/src/model/remote-dashboard-palette"
import { gitTabForPaletteId } from "../packages/feature-git/src/model/remote-palette"
import { inboxKeyAction } from "../packages/feature-git/src/ui/inbox/useInboxWorkspaceKeyboard"

const base = {
  focus: "list" as const,
  hasSelection: true,
  canCreate: true,
  activityComment: false,
  navigation: true,
}

function prActions(next: Partial<Parameters<typeof pullRequestPaletteActions>[0]> = {}) {
  return pullRequestPaletteActions({
    ...base,
    previewTab: "overview",
    detailsReady: true,
    watching: false,
    selectedCommit: false,
    availability: new Map([
      ["comment", { enabled: true, reason: null }],
      ["merge", { enabled: false, reason: "merge-conflict" }],
    ]),
    ...next,
  })
}

const byId = <Item extends { id: string }>(items: readonly Item[]) =>
  new Map(items.map((item) => [item.id, item]))

describe("Pull request palette", () => {
  test("shows writes with GitHub availability and loading reasons", () => {
    const actions = byId(prActions())
    expect(actions.get("mutation:comment")?.disabledReason).toBeNull()
    expect(actions.get("mutation:merge")?.disabledReason).toBe("merge-conflict")
    expect(actions.get("mutation:close")?.disabledReason).toBe(
      "Carregando detalhes do pull request",
    )
    expect(byId(prActions({ hasSelection: false })).get("mutation:comment")?.disabledReason).toBe(
      "Selecione um pull request",
    )
  })

  test("lists GitHub writes first on the list and preview rows first on the preview", () => {
    const list = prActions()
    expect(byId(list).get("back-to-list")?.disabledReason).toBe("Foque a prévia")
    expect(list[0]?.id).toBe("mutation:comment")
    const firstListRow = list.findIndex((action) => action.tags[0] === "list")
    const lastAvailableWrite = list.findLastIndex(
      (action) => action.tags[0] === "github" && !action.disabledReason,
    )
    expect(lastAvailableWrite).toBeLessThan(firstListRow)
    const preview = prActions({ focus: "preview" })
    expect(preview[0]?.tags[0]).toBe("preview")
    expect(byId(preview).get("open-preview")?.disabledReason).toBe("Foque a lista")
    expect(byId(preview).get("toggle-description")?.disabledReason).toBeNull()
    expect(
      byId(prActions({ focus: "preview", previewTab: "checks" })).get("toggle-description")
        ?.disabledReason,
    ).toBe("Disponível na aba de visão geral")
  })

  test("keeps palette write keys aligned with the workspace shortcuts", () => {
    for (const mutation of PULL_REQUEST_MUTATIONS) {
      expect(pullRequestActionKindForShortcut(mutation.key)).toBe(mutation.kind)
    }
  })

  test("runs available write keys directly and ignores unavailable ones", () => {
    const actions = prActions()
    expect(actionPaletteActionForKey(actions, { name: "c" })?.id).toBe("mutation:comment")
    // [M] chooses a box; merge moved to [Shift+M] and stays unavailable here.
    expect(actionPaletteActionForKey(actions, { name: "m" })?.id).toBe("choose-box")
    expect(actionPaletteActionForKey(actions, { name: "m", shift: true })).toBeNull()
    expect(actionPaletteActionForKey(actions, { name: "c", meta: true })).toBeNull()
  })

  test("offers other Git tabs only with a navigation owner", () => {
    expect([...byId(prActions()).keys()].filter((id) => id.startsWith("tab-"))).toEqual([
      "tab-base",
      "tab-issues",
      "tab-inbox",
    ])
    expect(prActions({ navigation: false }).some((action) => action.id.startsWith("tab-"))).toBe(
      false,
    )
    expect(gitTabForPaletteId("tab-base")).toBe("base")
    expect(gitTabForPaletteId("refresh")).toBeNull()
  })

  test("lists no pure navigation rows but keeps their command mapping out of the palette", () => {
    const ids = prActions().map((action) => action.id as string)
    for (const hidden of [
      "next-row",
      "previous-row",
      "first-row",
      "last-row",
      "previous-section",
      "next-section",
      "previous-preview-tab",
      "next-preview-tab",
    ]) {
      expect(ids).not.toContain(hidden)
    }
    expect(remoteDashboardCommand("back-to-list")).toEqual({ type: "focus", target: "list" })
    expect(remoteDashboardCommand("open-preview")).toEqual({ type: "focus", target: "preview" })
    expect(remoteDashboardCommand("create")).toBeNull()
  })
})

describe("Issue palette", () => {
  test("lists Issue writes and comment rows for the activity tab", () => {
    const actions = byId(
      issuePaletteActions({
        ...base,
        focus: "preview",
        previewTab: "activity",
        activityComment: true,
        availability: new Map([["labels", { enabled: true, reason: null }]]),
      }),
    )
    expect(actions.get("mutation:labels")?.disabledReason).toBeNull()
    expect(actions.get("comment-reply")?.disabledReason).toBeNull()
    expect(actions.get("create")?.label).toBe("Criar issue")
    expect(actions.has("tab-issues")).toBe(false)
  })
})

test("remote palettes remove manual paging and preview layout commands", () => {
  const issues = issuePaletteActions({
    ...base,
    previewTab: "overview",
    availability: new Map(),
  })
  for (const id of ["load-more", "load-preview-more", "toggle-preview", "cycle-preview-position"]) {
    expect(remoteDashboardCommand(id)).toBeNull()
    expect(prActions().some((action) => action.id === id)).toBe(false)
    expect(issues.some((action) => action.id === id)).toBe(false)
  }
})

describe("Inbox palette", () => {
  test("explains read and selection state", () => {
    const read = byId(
      inboxPaletteActions({
        focus: "list",
        selected: { unread: false, saved: true },
        navigation: true,
      }),
    )
    expect(read.get("read")?.disabledReason).toBe("A notificação já está lida")
    expect(read.get("save")?.label).toBe("Remover dos salvos")
    const empty = byId(inboxPaletteActions({ focus: "list", selected: null, navigation: false }))
    expect(empty.get("done")?.disabledReason).toBe("Selecione uma notificação")
    expect(empty.get("refresh")?.disabledReason).toBeNull()
    expect(empty.has("tab-base")).toBe(false)
  })
})

describe("[M] and [Shift+M]", () => {
  test("plain [M] is free for box selection while [Shift+M] keeps the writes", () => {
    expect(pullRequestActionKindForShortcut({ name: "m" })).toBeNull()
    expect(pullRequestActionKindForShortcut({ name: "m", shift: true })).toBe("merge")
    expect(inboxKeyAction({ name: "m" })).toBeNull()
    expect(inboxKeyAction({ name: "m", shift: true })).toBe("read")
  })
})
