import { describe, expect, test } from "bun:test"
import { RGBA } from "@opentui/core"
import { ACTION_KEY_COLOR, BRAND_COLOR } from "../packages/core/src/ui/brand"
import { shortcutContent } from "../packages/core/src/ui/shortcut-content"
import {
  actionPalettePanelForKey,
  actionPaletteSideEntries,
  filterActionPaletteActions,
  filterActionPaletteSideItems,
  isActionPaletteKey,
  orderActionPaletteActions,
} from "../packages/core/src/ui/action-palette"
import { focusDirectionForKey, nextFocusTarget } from "../packages/core/src/ui/focus-navigation"

const tags = { files: { label: "ARQUIVOS", color: "#fff" }, app: { label: "APP", color: "#000" } }
const actions = [
  { id: "a", shortcut: "[A]", label: "Stage", description: "Primeira", tags: ["files"] },
  {
    id: "b",
    shortcut: "[B]",
    label: "Bloqueada",
    description: "Segunda",
    tags: ["app"],
    disabledReason: "Foque outro box",
  },
  { id: "c", shortcut: "", label: "Livre", description: "Terceira", tags: ["app"] },
] as const

describe("action palette", () => {
  test("orders available actions first and keeps the feature order", () => {
    expect(orderActionPaletteActions(actions).map((action) => action.id)).toEqual(["a", "c", "b"])
  })

  test("filters by shortcut, translated label, description and tag label", () => {
    const ids = (query: string) =>
      filterActionPaletteActions(actions, query, tags, (value) => value).map((action) => action.id)
    expect(ids("")).toEqual(["a", "b", "c"])
    expect(ids("[b]")).toEqual(["b"])
    expect(ids("terceira")).toEqual(["c"])
    expect(ids("arquivos")).toEqual(["a"])
    expect(ids("nada")).toEqual([])
  })

  test("recognizes [?] from key names, sequences and shifted slash only", () => {
    expect(isActionPaletteKey({ name: "?" })).toBe(true)
    expect(isActionPaletteKey({ name: "/", shift: true })).toBe(true)
    expect(isActionPaletteKey({ name: "x", sequence: "?" })).toBe(true)
    expect(isActionPaletteKey({ name: "/" })).toBe(false)
    expect(isActionPaletteKey({ name: "?", ctrl: true })).toBe(false)
    expect(isActionPaletteKey({ name: "?", meta: true })).toBe(false)
  })
})

describe("action palette side list", () => {
  test("filters side items by their literal label", () => {
    const items = [
      { id: "main", label: "main" },
      { id: "feature/Palette", label: "feature/Palette" },
    ]
    expect(filterActionPaletteSideItems(items, "palette").map((item) => item.id)).toEqual([
      "feature/Palette",
    ])
    expect(filterActionPaletteSideItems(items, " ")).toEqual(items)
  })

  test("flattens stacked blocks with unique ids", () => {
    const side = [
      {
        id: "projects",
        title: "P",
        emptyText: "",
        items: [{ id: "main", label: "api" }],
        onSelect: () => undefined,
      },
      {
        id: "branches",
        title: "B",
        emptyText: "",
        items: [
          { id: "main", label: "main" },
          { id: "dev", label: "dev" },
        ],
        onSelect: () => undefined,
      },
    ]
    expect(actionPaletteSideEntries(side, "").map((entry) => entry.id)).toEqual([
      "projects:main",
      "branches:main",
      "branches:dev",
    ])
    expect(actionPaletteSideEntries(side, "ma").map((entry) => entry.itemId)).toEqual(["main"])
  })

  test("switches panels with Tab, H/L and arrows only without modifiers", () => {
    expect(actionPalettePanelForKey({ name: "tab" }, "actions")).toBe("side")
    expect(actionPalettePanelForKey({ name: "tab" }, "side")).toBe("actions")
    expect(actionPalettePanelForKey({ name: "l" }, "actions")).toBe("side")
    expect(actionPalettePanelForKey({ name: "left" }, "side")).toBe("actions")
    expect(actionPalettePanelForKey({ name: "tab", shift: true }, "actions")).toBeNull()
    expect(actionPalettePanelForKey({ name: "j" }, "actions")).toBeNull()
  })
})

describe("focus navigation", () => {
  const rects = [
    { key: "files", left: 0, top: 0, width: 30, height: 20 },
    { key: "preview", left: 31, top: 0, width: 60, height: 14 },
    { key: "terminal", left: 31, top: 14, width: 60, height: 6 },
  ]

  test("moves to the nearest box in each direction and stays at edges", () => {
    expect(nextFocusTarget(rects, "files", "right")).toBe("preview")
    expect(nextFocusTarget(rects, "preview", "down")).toBe("terminal")
    expect(nextFocusTarget(rects, "terminal", "up")).toBe("preview")
    expect(nextFocusTarget(rects, "terminal", "left")).toBe("files")
    expect(nextFocusTarget(rects, "files", "left")).toBe("files")
    expect(nextFocusTarget(rects, "missing", "left")).toBe("missing")
  })

  test("maps vim keys and arrows to directions", () => {
    expect(
      ["h", "j", "k", "l", "left", "down", "up", "right", "x"].map(focusDirectionForKey),
    ).toEqual(["left", "down", "up", "right", "left", "down", "up", "right", null])
  })
})

describe("action key color", () => {
  const colorOf = (content: string, token: string, color?: string, actionKeys?: string[]) => {
    const styled = shortcutContent(content, color, undefined, actionKeys)
    if (typeof styled === "string") throw new Error("Expected styled shortcut text")
    const chunk = styled.chunks.find((candidate) => candidate.text === token)
    return chunk?.fg?.toInts()
  }
  const purple = RGBA.fromHex(ACTION_KEY_COLOR).toInts()
  const blue = RGBA.fromHex(BRAND_COLOR).toInts()

  test("draws [?] and declared action keys in purple and other hints in the brand blue", () => {
    expect(colorOf("[?] Ações  [R] Atualizar", "[?]")).toEqual(purple)
    expect(colorOf("[?] Ações  [R] Atualizar", "[R]")).toEqual(blue)
    expect(colorOf("Sync [Ctrl+B] > [R]", "[Ctrl+B]", undefined, ["[Ctrl+B]"])).toEqual(purple)
    expect(colorOf("[Ctrl+B] Criar", "[Ctrl+B]")).toEqual(blue)
    expect(colorOf("[?/Esc] Fechar", "[?/Esc]")).toEqual(blue)
  })

  test("keeps an explicit muted or disabled color", () => {
    expect(colorOf("[?] Ações", "[?]", "#777777")).toEqual(RGBA.fromHex("#777777").toInts())
  })
})
