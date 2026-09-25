import { expect, test } from "bun:test"
import {
  isTerminalMasterKey,
  normalizeTerminalAgentCommands,
  normalizeTerminalRemoteCodexProfiles,
  matchesTerminalMasterKey,
  terminalMasterKeyBytes,
} from "../packages/core/src/settings/terminal"
import { TERMINAL_MESSAGES } from "../packages/core/src/i18n/terminal-catalog"
import { LANGUAGE_OPTIONS, translateUi } from "../packages/core/src/i18n"
import { configurationSectionsForContext } from "../apps/cli/src/model/configuration-context"
import { configurationSettingPatch } from "../apps/cli/src/model/configuration-options"
import { getUiSettings } from "../packages/core/src/settings/theme"

test("Master Key belongs to contextual Terminal settings without a layout switch", () => {
  expect(configurationSectionsForContext("terminal")[0]).toBe("terminal")
  expect(configurationSectionsForContext("terminal")[1]).toBe("remoteConnection")
  expect(configurationSectionsForContext("terminal")).not.toContain("layout")
  expect(
    configurationSettingPatch("terminal", { ...getUiSettings(), terminalMasterKey: "Ctrl+B" }, 1),
  ).toEqual({ terminalMasterKey: "Ctrl+A" })
  expect(isTerminalMasterKey("Ctrl+C")).toBe(false)
  expect(isTerminalMasterKey("constructor")).toBe(false)
  expect(matchesTerminalMasterKey({ ctrl: true, name: "a" }, "Ctrl+A")).toBe(true)
  expect(matchesTerminalMasterKey({ ctrl: true, meta: true, name: "a" }, "Ctrl+A")).toBe(false)
  expect(matchesTerminalMasterKey({ name: "a" }, "Ctrl+A")).toBe(false)
  expect(terminalMasterKeyBytes("Ctrl+A")).toBe("\u0001")
  expect(terminalMasterKeyBytes("Ctrl+Space")).toBe("\u0000")
})

test("all terminal actions and settings have translations in all supported languages", () => {
  for (const message of TERMINAL_MESSAGES) {
    for (const [index, language] of LANGUAGE_OPTIONS.entries()) {
      expect(translateUi(message[0], language.id)).toBe(message[index]!)
    }
  }
})

test("additional agent identities normalize safely without accepting arbitrary data", () => {
  expect(
    normalizeTerminalAgentCommands([" Acme ", "acme", "team.assistant", null, "\u001bsecret"]),
  ).toEqual(["acme", "team.assistant"])
  expect(normalizeTerminalAgentCommands("acme")).toEqual([])
})

test("remote Codex profiles are represented in Terminal settings without enabling a launch action", () => {
  const settings = getUiSettings()
  expect(settings.terminalRemoteCodexProfiles).toEqual([])
  expect(settings.terminalRemoteCodexActiveProfileId).toBeNull()
  expect(normalizeTerminalRemoteCodexProfiles("ubuntu@example.com")).toEqual([])
})
