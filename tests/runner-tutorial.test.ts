import { expect, test } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { LANGUAGE_OPTIONS, translateUi } from "../packages/core/src/i18n/index"
import { RUNNER_TUTORIAL_BASICS_MESSAGES } from "../packages/core/src/i18n/runner-tutorial-basics-catalog"
import { RUNNER_TUTORIAL_ADVANCED_MESSAGES } from "../packages/core/src/i18n/runner-tutorial-advanced-catalog"
import { RUNNER_TUTORIAL_STEPS } from "../packages/feature-runner/src/tutorial/steps"

test("Runner has a dedicated, stable tour with complete translations", async () => {
  const { loadSourceFeature } = await import("../apps/cli/src/features/source-loader")
  await loadSourceFeature("runner")
  const { getTutorialSteps } = await import("../apps/cli/src/tutorial/TutorialOverlay")
  const steps = getTutorialSteps("runner")
  expect(steps.map(({ accent, ...step }) => step)).toEqual([...RUNNER_TUTORIAL_STEPS])
  expect(steps.map((step) => step.targetId)).toEqual(
    [
      "workspace",
      "projects",
      "commands",
      "running",
      "stopped",
      "manual",
      "processes",
      "logs",
      "filter",
      "ports",
      "history",
      "multi",
      "focus",
      "palette",
      "environment",
      "yaml",
      "validation",
      "flows",
      "flow-running",
      "trust",
      "finale",
    ].map((id) => `tutorial-runner-${id}`),
  )
  expect(steps.every((step) => step.stateful)).toBe(true)
  for (const step of steps) {
    for (const value of [step.group, step.title, step.description]) {
      for (const { id } of LANGUAGE_OPTIONS.filter(({ id }) => id !== "pt-BR")) {
        const message = [
          ...RUNNER_TUTORIAL_BASICS_MESSAGES,
          ...RUNNER_TUTORIAL_ADVANCED_MESSAGES,
        ].find(([source]) => source === value)
        expect(message).toBeDefined()
        if (id === "ru") expect(translateUi(value, id)).not.toBe(translateUi(value, "en"))
        else
          expect(translateUi(value, id)).toBe(
            message?.[LANGUAGE_OPTIONS.findIndex((language) => language.id === id)] ?? "",
          )
      }
    }
  }
})

test("Runner tutorial code has no discovery, process, network or storage dependencies", () => {
  const directory = join(import.meta.dir, "../packages/feature-runner/src/tutorial")
  for (const file of readdirSync(directory)) {
    const source = readFileSync(join(directory, file), "utf8")
    expect(source).not.toMatch(/from ["'][^"']*(?:services|storage|hooks|RunnerWorkspace|node:)/)
    expect(source).not.toMatch(/Bun\.(spawn|file|write)|fetch\(|node:child_process/)
    for (const [, label] of source.matchAll(/label="([^"]+)"/g)) {
      if (!label || !/\]\s+\p{L}/u.test(label) || label === "[H] HTTP") continue
      expect(translateUi(label, "en"), `${file}: ${label}`).not.toBe(label)
    }
  }
})
