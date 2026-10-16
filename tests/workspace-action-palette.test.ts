import { expect, test } from "bun:test"
import { DATABASE_PALETTE_ACTIONS_MESSAGES } from "../packages/core/src/i18n/database-palette-actions-catalog"
import { DATABASE_PALETTE_LABELS_MESSAGES } from "../packages/core/src/i18n/database-palette-labels-catalog"
import { LANGUAGE_OPTIONS, translateUi } from "../packages/core/src/i18n/index"
import { RUNNER_PALETTE_ACTIONS_MESSAGES } from "../packages/core/src/i18n/runner-palette-actions-catalog"
import { RUNNER_PALETTE_LABELS_MESSAGES } from "../packages/core/src/i18n/runner-palette-labels-catalog"
import { ownsKeyboardFocus } from "../packages/core/src/keyboard/scope"
import { databaseKeyboardScope } from "../packages/feature-database/src/keyboard"
import { runnerKeyboardScope } from "../packages/feature-runner/src/keyboard"

test("Database and Runner palettes have complete translations in all six languages", () => {
  const messages = [
    ...DATABASE_PALETTE_ACTIONS_MESSAGES,
    ...DATABASE_PALETTE_LABELS_MESSAGES,
    ...RUNNER_PALETTE_ACTIONS_MESSAGES,
    ...RUNNER_PALETTE_LABELS_MESSAGES,
  ]
  for (const message of messages) {
    for (const [index, language] of LANGUAGE_OPTIONS.entries()) {
      const expected = message[index]
      if (!expected) throw new Error(`Missing ${language.id} translation: ${message[0]}`)
      expect(translateUi(message[0], language.id)).toBe(expected)
    }
  }
})

test("palette dialogs and searches own application shortcuts", () => {
  for (const id of ["database-action-palette", "database-query-sql-1-action-palette"]) {
    expect(ownsKeyboardFocus(databaseKeyboardScope, id)).toBe(true)
    expect(ownsKeyboardFocus(databaseKeyboardScope, `${id}-search`)).toBe(true)
  }
  expect(ownsKeyboardFocus(runnerKeyboardScope, "runner-action-palette")).toBe(true)
  expect(ownsKeyboardFocus(runnerKeyboardScope, "runner-action-palette-search")).toBe(true)
})
