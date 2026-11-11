import { expect, test } from "bun:test"
import { LANGUAGE_OPTIONS, translateUi } from "../packages/core/src/i18n/index"
import { GIT_REMOTE_TUTORIAL_STEPS } from "../packages/feature-git/src/tutorial/remote-steps"
import { GIT_TUTORIAL_STEPS } from "../packages/feature-git/src/tutorial/steps"

test("Git's remote tour follows Compare with stable PR, Issue and Inbox steps", () => {
  expect(GIT_TUTORIAL_STEPS.slice(28)).toEqual([...GIT_REMOTE_TUTORIAL_STEPS])
  expect(GIT_REMOTE_TUTORIAL_STEPS.map((step) => `${step.tab}:${step.view}`)).toEqual([
    "pr:tab",
    "pr:sections",
    "pr:search",
    "pr:list",
    "pr:overview",
    "pr:checks",
    "pr:activity",
    "pr:commits",
    "pr:files",
    "pr:create",
    "pr:review",
    "issues:tab",
    "issues:sections",
    "issues:list",
    "issues:overview",
    "issues:activity",
    "issues:create",
    "issues:actions",
    "inbox:tab",
    "inbox:sections",
    "inbox:list",
    "inbox:activity",
    "inbox:save",
    "inbox:done",
    "inbox:unsubscribe",
  ])
  expect(new Set(GIT_TUTORIAL_STEPS.map((step) => step.targetId)).size).toBe(
    GIT_TUTORIAL_STEPS.length,
  )
  expect(GIT_REMOTE_TUTORIAL_STEPS.every((step) => step.stateful)).toBe(true)
})

test("every remote tutorial step is localized without losing keyboard shortcuts", () => {
  const shortcuts = (value: string) => [...value.matchAll(/\[[^\]]+\]/g)].map(([key]) => key).sort()
  for (const step of GIT_REMOTE_TUTORIAL_STEPS) {
    for (const value of [step.group, step.title, step.description]) {
      for (const { id } of LANGUAGE_OPTIONS.filter(({ id }) => id !== "pt-BR")) {
        const translated = translateUi(value, id)
        // Spanish titles can legitimately match Portuguese; descriptions do not.
        if (value === step.description || id === "en") expect(translated).not.toBe(value)
        if (id === "ru") expect(translated).not.toBe(translateUi(value, "en"))
        expect(shortcuts(translated)).toEqual(shortcuts(value))
      }
    }
  }
})

test("remote tutorial scenes have no service, persistence, input or process dependencies", async () => {
  for (const file of [
    "GitTutorialRemoteView.tsx",
    "GitTutorialRemotePreview.tsx",
    "GitTutorialRemoteDialog.tsx",
    "remote-steps.ts",
  ]) {
    const source = await Bun.file(
      new URL(`../packages/feature-git/src/tutorial/${file}`, import.meta.url),
    ).text()
    for (const forbidden of [
      "/services/",
      "/storage/",
      "/hooks/",
      "Bun.spawn",
      "Bun.file",
      "node:fs",
      "node:child_process",
      "fetch(",
      "useKeyboard",
      "useEffect",
    ])
      expect(source, file).not.toContain(forbidden)
  }
})
