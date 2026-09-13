import { describe, expect, test } from "bun:test"
import { estimateTutorialTextHeight, getTutorialSteps } from "../src/app/tutorial/TutorialOverlay"
import { translateUi } from "../src/shared/i18n/index"

const DATABASE_TUTORIAL_SOURCE = await Bun.file(
  new URL("../src/features/database/tutorial/DatabaseTutorialDemo.tsx", import.meta.url),
).text()
const GIT_TUTORIAL_SOURCE = (
  await Promise.all(
    [
      "GitTutorialDemo.tsx",
      "GitTutorialCompareView.tsx",
      "GitTutorialComparePicker.tsx",
      "GitTutorialCompareResult.tsx",
      "GitTutorialDiffView.tsx",
      "GitTutorialLogView.tsx",
      "GitTutorialProjectModal.tsx",
      "GitTutorialStateViews.tsx",
    ].map((filename) =>
      Bun.file(new URL(`../src/features/git/tutorial/${filename}`, import.meta.url)).text(),
    ),
  )
).join("\n")
const HTTP_TUTORIAL_SOURCE = await Bun.file(
  new URL("../src/features/http/tutorial/HttpTutorialDemo.tsx", import.meta.url),
).text()

describe("contextual tutorial", () => {
  test("keeps non-database tours focused on the active tool", () => {
    for (const screen of ["runner", "terminal"]) {
      const steps = getTutorialSteps(screen)
      expect(steps.map((step) => step.targetId)).toEqual(["tutorial-current-tool"])
      expect(steps.some((step) => step.targetId === "tutorial-app-header")).toBe(false)
      expect(steps.some((step) => step.targetId === "tutorial-settings-button")).toBe(false)
    }
  })

  test("covers the HTTP request/response flow with translated stable demo targets", () => {
    const steps = getTutorialSteps("http")
    expect(steps.length).toBeGreaterThanOrEqual(6)
    expect(new Set(steps.map((step) => step.targetId)).size).toBe(steps.length)
    for (const step of steps) {
      expect(HTTP_TUTORIAL_SOURCE).toContain(`id="${step.targetId}"`)
      for (const value of [step.group, step.title, step.description, step.hint]) {
        if (value) expect(translateUi(value, "en")).not.toBe(value)
      }
    }
  })

  test("covers the local Diffs and branch comparison workflows", () => {
    const steps = getTutorialSteps("git")
    expect(steps.map((step) => step.targetId)).toEqual([
      "tutorial-git-diffs-tab",
      "tutorial-git-repository",
      "tutorial-git-local-configuration",
      "tutorial-git-files",
      "tutorial-git-stage-toggle",
      "tutorial-git-mini-graph",
      "tutorial-git-open-graph",
      "tutorial-git-open-log",
      "tutorial-git-diff",
      "tutorial-git-diff-layout",
      "tutorial-git-actions",
      "tutorial-git-partial-stage",
      "tutorial-git-discard",
      "tutorial-git-terminal",
      "tutorial-git-navigation",
      "tutorial-git-shortcuts",
      "tutorial-git-compare-tab",
      "tutorial-git-compare-selectors",
      "tutorial-git-compare-project",
      "tutorial-git-compare-base",
      "tutorial-git-compare-compared",
      "tutorial-git-compare-range",
      "tutorial-git-compare-summary",
      "tutorial-git-compare-files",
      "tutorial-git-compare-diff",
      "tutorial-git-compare-layout",
      "tutorial-git-compare-navigation",
      "tutorial-git-compare-return",
    ])
    expect(new Set(steps.map((step) => step.targetId)).size).toBe(steps.length)
    expect(steps.filter((step) => step.hint).map((step) => step.targetId)).toEqual([
      "tutorial-git-local-configuration",
      "tutorial-git-open-graph",
      "tutorial-git-open-log",
      "tutorial-git-partial-stage",
      "tutorial-git-compare-project",
      "tutorial-git-compare-base",
      "tutorial-git-compare-compared",
    ])
    expect(steps.filter((step) => step.stateful).map((step) => step.targetId)).toEqual(
      steps.slice(16).map((step) => step.targetId),
    )
    expect(steps.map((step) => step.targetId)).not.toContain("tutorial-git-pr-list")
    expect(steps.map((step) => step.targetId)).not.toContain("tutorial-git-issues")
    expect(steps.map((step) => step.targetId)).not.toContain("tutorial-git-inbox")
    for (const step of steps) {
      expect(GIT_TUTORIAL_SOURCE).toContain(step.targetId)
      for (const value of [step.group, step.title, step.description, step.hint]) {
        if (value) expect(translateUi(value, "en")).not.toBe(value)
      }
    }
    expect(GIT_TUTORIAL_SOURCE).not.toContain("loadGitComparisonContext")
    expect(GIT_TUTORIAL_SOURCE).not.toContain("loadGitBranchComparison")
  })

  test("covers every database panel and current batch workflow", () => {
    const targets = getTutorialSteps("database").map((step) => step.targetId)

    expect(new Set(targets).size).toBe(targets.length)
    expect(targets).toContain("tutorial-db-catalog")
    expect(targets).toContain("tutorial-db-grid")
    expect(targets).toContain("tutorial-db-inspector")
    expect(targets).toContain("tutorial-db-table-history")
    expect(targets).toContain("tutorial-db-table-tools")
    expect(targets).toContain("tutorial-db-selection")
    expect(targets).toContain("tutorial-db-export")
    expect(targets).toContain("tutorial-db-review")
    expect(targets).not.toContain("tutorial-db-empty")
  })

  test("has a rendered demo target for every database step", () => {
    expect(DATABASE_TUTORIAL_SOURCE).toContain("export function DatabaseTutorialDemo()")
    for (const step of getTutorialSteps("database")) {
      expect(DATABASE_TUTORIAL_SOURCE).toContain(`id="${step.targetId}"`)
    }
  })

  test("translates all database tutorial copy", () => {
    for (const step of getTutorialSteps("database")) {
      for (const value of [step.group, step.title, step.description, step.hint]) {
        if (!value) continue
        expect(translateUi(value, "en")).not.toBe(value)
      }
    }

    expect(translateUi("Selecionar várias linhas", "es")).toBe("Seleccionar varias filas")
    expect(translateUi("Exportar a seleção", "ja")).toBe("選択をエクスポート")
    expect(translateUi("DADOS · SELEÇÃO EM LOTE", "zh-CN")).toBe("数据 · 批量选择")
    expect(translateUi("Editar uma ou várias linhas", "ko")).toBe("한 행 또는 여러 행 편집")
  })

  test("reserves enough card height for word wrapping and wide glyphs", () => {
    expect(
      estimateTutorialTextHeight(
        "◇ [Alt+Space] iniciar/finalizar · [↑/↓] ajustar · [Esc] limpar",
        28,
        1,
        4,
      ),
    ).toBeGreaterThanOrEqual(3)
    expect(
      estimateTutorialTextHeight("◇ [Alt+Space] 开始/结束 · [↑/↓] 调整 · [Esc] 清除", 28, 1, 4),
    ).toBeGreaterThanOrEqual(2)
  })
})
