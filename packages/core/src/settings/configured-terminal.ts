import { isTerminalMasterKey, type TerminalMasterKey } from "./terminal"

let masterKey: TerminalMasterKey | null = null

export function validateConfiguredMasterKey(value: unknown): TerminalMasterKey | null {
  if (value === null || value === undefined) return null
  if (!isTerminalMasterKey(value))
    throw new Error("masterKey must be a supported Terminal Master Key or null")
  return value
}

export function setConfiguredMasterKey(value: TerminalMasterKey | null) {
  masterKey = value
}

export function getConfiguredMasterKey() {
  return masterKey
}
