import { gitBaseActionTags } from "../packages/feature-git/src/rendering/action-palette-tags"
import { describe, expect, test } from "bun:test"
import { COLORS } from "../packages/core/src/settings/theme"
import {
  type GitBaseActionState,
  gitBaseActions,
  gitFocusedBlockTag,
} from "../packages/feature-git/src/model/base-actions"
import { gitLocalProjectLabels } from "../packages/feature-git/src/hooks/use-git-local-projects-side"

const state: GitBaseActionState = {
  repository: true,
  focusedPane: "files",
  view: "diff",
  partialStage: false,
  partialStageStartDisabled: false,
  fileCount: 2,
  selectedActionFileCount: 1,
  selectedFolder: false,
  busy: false,
  stagePending: false,
  hasSelectedCommit: true,
  commitCount: 3,
  terminalExpanded: false,
  navigation: true,
  localConfiguration: true,
}

function byId(next: Partial<GitBaseActionState> = {}) {
  return new Map(gitBaseActions({ ...state, ...next }).map((action) => [action.id, action]))
}

describe("Git Diffs actions", () => {
  test("disables actions owned by another box with the focus reason", () => {
    const files = byId()
    expect(files.get("open-selection")?.disabledReason).toBeNull()
    expect(files.get("partial-stage")?.disabledReason).toBe("Foque o painel de diff")
    expect(files.get("focus-files")?.disabledReason).toBe("Já está focado")
    const preview = byId({ focusedPane: "preview" })
    expect(preview.get("partial-stage")?.disabledReason).toBeNull()
    expect(preview.get("open-selection")?.disabledReason).toBe("Foque a árvore de arquivos")
  })

  test("lists the focused box first, then available and finally unavailable actions", () => {
    const actions = gitBaseActions({ ...state, focusedPane: "preview" })
    expect(actions[0]?.tags[0]).toBe("diff")
    const firstDisabled = actions.findIndex((action) => action.disabledReason)
    expect(firstDisabled).toBeGreaterThan(0)
    expect(actions.slice(firstDisabled).every((action) => action.disabledReason)).toBe(true)
  })

  test("follows the active view and history focus", () => {
    const diff = byId()
    expect(diff.has("discard")).toBe(true)
    expect(diff.has("show-diff")).toBe(false)
    expect(diff.get("next-commit")?.disabledReason).toBe("Abra o histórico ou a árvore de commits")
    const graph = byId({ view: "graph", focusedPane: "preview" })
    expect(graph.has("discard")).toBe(false)
    expect(graph.get("show-diff")?.disabledReason).toBeNull()
    expect(graph.get("stage-file")?.disabledReason).toBe("Disponível na visualização de diff")
    expect(graph.get("next-commit")?.disabledReason).toBeNull()
    expect(graph.get("graph")?.label).toBe("Fechar árvore de commits")
    expect(byId({ view: "log" }).get("log")?.disabledReason).toBe("Já está aberto")
  })

  test("explains selection and in-flight operation guards", () => {
    expect(byId({ selectedActionFileCount: 0 }).get("stage-file")?.disabledReason).toBe(
      "Selecione um arquivo ou pasta",
    )
    const busy = byId({ busy: true, stagePending: true })
    expect(busy.get("stage-selection")?.disabledReason).toBe("Operação Git em andamento")
    expect(busy.get("refresh")?.disabledReason).toBe("Operação Git em andamento")
    expect(byId({ selectedFolder: true }).get("stage-selection")?.label).toBe("Stage da pasta")
  })

  test("partial stage exposes only its own actions as available", () => {
    const actions = gitBaseActions({ ...state, focusedPane: "preview", partialStage: true })
    const enabled = actions.filter((action) => !action.disabledReason).map((action) => action.id)
    expect(enabled).toEqual([
      "partial-toggle-mode",
      "partial-transfer",
      "partial-apply",
      "refresh",
      "local-configuration",
    ])
    expect(actions.find((action) => action.id === "choose-box")?.disabledReason).toBe(
      "Conclua o stage parcial",
    )
  })

  test("omits navigation and configuration without their owners", () => {
    const actions = byId({ navigation: false, localConfiguration: false })
    expect(actions.has("tab-pr")).toBe(false)
    expect(actions.has("compare")).toBe(false)
    expect(actions.has("local-configuration")).toBe(false)
    expect([...byId({ repository: false }).keys()]).toEqual([
      "tab-pr",
      "tab-issues",
      "tab-inbox",
      "compare",
      "refresh",
      "local-configuration",
    ])
  })

  test("maps the focused pane to its box tag and resolves tag colors", () => {
    expect(gitFocusedBlockTag({ focusedPane: "files", view: "graph" })).toBe("files")
    expect(gitFocusedBlockTag({ focusedPane: "preview", view: "graph" })).toBe("history")
    expect(gitFocusedBlockTag({ focusedPane: "preview", view: "commit" })).toBe("diff")
    expect(gitFocusedBlockTag({ focusedPane: "terminal", view: "diff" })).toBe("terminal")
    expect(gitBaseActionTags(COLORS).files).toEqual({ label: "ARQUIVOS", color: COLORS.git })
  })
})

describe("Git versioned projects", () => {
  test("labels projects by name and disambiguates equal names by path", () => {
    const project = (root: string, displayPath = root) => ({
      root,
      name: root.split("/").at(-1) ?? root,
      displayPath,
    })
    expect(
      gitLocalProjectLabels([
        project("/work/api", "~/work/api"),
        project("/home/api"),
        project("/work/web"),
      ]),
    ).toEqual(["~/work/api", "/home/api", "web"])
  })
})
