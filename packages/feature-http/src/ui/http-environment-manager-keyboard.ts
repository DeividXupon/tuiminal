import type { HttpEnvironmentFormMode } from "./HttpEnvironmentManagerContent"
import type { HttpEnvironment } from "../storage/environments"
import type { CreateGlobalHttpEnvironmentInput } from "../storage/global-environments"

export type EnvironmentManagerProps = {
  environments: HttpEnvironment[]
  globals: HttpEnvironment | undefined
  activeName: string | null
  terminalWidth: number
  terminalHeight: number
  onSelect: (name: string | null) => void
  onCreate: (input: CreateGlobalHttpEnvironmentInput) => Promise<{ environmentName: string }>
  onReplace: (
    originalName: string,
    input: CreateGlobalHttpEnvironmentInput,
  ) => Promise<{ environmentName: string }>
  onDelete: (name: string) => Promise<{ environmentName: string }>
  onSaveGlobals: (
    input: Omit<CreateGlobalHttpEnvironmentInput, "environmentName">,
  ) => Promise<{ environmentName: string }>
  onClose: () => void
}

export type EnvironmentScreen = "list" | "create" | "edit" | "globals" | "delete"

export type EnvironmentKeyEvent = {
  name: string
  ctrl?: boolean
  shift?: boolean
  preventDefault(): void
  stopPropagation(): void
}

export function consumeEnvironmentKey(event: EnvironmentKeyEvent) {
  event.preventDefault()
  event.stopPropagation()
}

const LIST_KEYS = new Set(["escape", "n", "g", "e", "d", "up", "down", "j", "k", "enter", "return"])
const CHOOSE_KEYS = new Set(["up", "down", "j", "k", "enter", "return"])
const TABLE_KEYS = new Set(["up", "down", "h", "j", "k", "l", "left", "right", "enter", "return"])

export function environmentFocusId(
  screen: EnvironmentScreen,
  mode: HttpEnvironmentFormMode,
  choice: string | null | undefined,
  rowIndex: number,
  column: 0 | 1,
) {
  if (screen === "list") return `http-environment-choice-${choice ?? "none"}`
  if (screen === "delete") return "http-environment-manager-modal"
  if (mode === "name") return "http-environment-create-name"
  if (mode === "cell")
    return `http-environment-create-${column === 0 ? "variable" : "value"}-${rowIndex}`
  return "http-environment-manager-modal"
}

export function environmentKeyIsHandled(
  screen: EnvironmentScreen,
  mode: HttpEnvironmentFormMode,
  event: EnvironmentKeyEvent,
) {
  const name = event.name
  if (screen === "list") return LIST_KEYS.has(name)
  if (screen === "delete") return name === "escape" || name === "y"
  if (name === "escape" || (event.ctrl && name === "s")) return true
  if (mode === "name" || mode === "cell") return name === "tab"
  if (name === "/") return true
  if (mode === "overview") return false
  if (mode === "choose") return CHOOSE_KEYS.has(name)
  return mode === "table" && TABLE_KEYS.has(name)
}
