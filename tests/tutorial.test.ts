import { describe, expect, test } from "bun:test"
import { estimateTutorialTextHeight, getTutorialSteps } from "../src/app/tutorial/TutorialOverlay"
import { translateUi } from "../src/shared/i18n/index"

const DATABASE_TUTORIAL_SOURCE = await Bun.file(
  new URL("../src/features/database/tutorial/DatabaseTutorialDemo.tsx", import.meta.url),
).text()
const GIT_TUTORIAL_SOURCE = await Bun.file(
  new URL("../src/features/git/tutorial/GitTutorialDemo.tsx", import.meta.url),
).text()
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

  test("covers the Git Base/PR/Issues flow with a stable local demo target for every step", () => {
    const steps = getTutorialSteps("git")
    expect(steps.length).toBeGreaterThanOrEqual(6)
    expect(new Set(steps.map((step) => step.targetId)).size).toBe(steps.length)
    expect(steps.map((step) => step.targetId)).toContain("tutorial-git-issues")
    for (const step of steps) {
      expect(GIT_TUTORIAL_SOURCE).toContain(`id="${step.targetId}"`)
      for (const value of [step.group, step.title, step.description, step.hint]) {
        if (value) expect(translateUi(value, "en")).not.toBe(value)
      }
    }
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
      estimateTutorialTextHeight("◇ [Space] linha · [Ctrl+Space] página · [Esc] limpar", 28, 1, 4),
    ).toBe(3)
    expect(
      estimateTutorialTextHeight("◇ [Space] 行 · [Ctrl+Space] 页面 · [Esc] 清除", 28, 1, 4),
    ).toBeGreaterThanOrEqual(2)
  })
})
