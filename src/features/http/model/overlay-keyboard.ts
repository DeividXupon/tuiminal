import type { HttpWorkspaceOverlay } from "./types"

type OverlayKey = { name: string; ctrl?: boolean }

type OverlayCommand =
  | { kind: "apply-overlay" | "close-overlay" | "ignore" | "blur-editor" }
  | {
      kind:
        | "toggle-import-format"
        | "back-import-preview"
        | "cycle-runner-target"
        | "cycle-runner-concurrency"
    }
  | {
      kind: "resolve-external-conflict"
      resolution: "reload" | "apply-local" | "save-copy"
    }

function closesOverlay(key: OverlayKey) {
  return key.name === "escape" || key.name === "f1" || (key.ctrl && key.name === "o")
}

function collectionImportCommand(key: OverlayKey, focusedId: string): OverlayCommand {
  if (key.ctrl && (key.name === "enter" || key.name === "return")) {
    return { kind: "apply-overlay" }
  }
  if (focusedId.startsWith("http-collection-import-")) {
    return key.name === "escape" ? { kind: "blur-editor" } : { kind: "ignore" }
  }
  if (key.name === "f") return { kind: "toggle-import-format" }
  if (key.name === "b") return { kind: "back-import-preview" }
  return closesOverlay(key) ? { kind: "close-overlay" } : { kind: "ignore" }
}

function collectionRunnerCommand(key: OverlayKey, focusedId: string): OverlayCommand {
  if (key.ctrl && (key.name === "enter" || key.name === "return")) {
    return { kind: "apply-overlay" }
  }
  if (focusedId === "http-collection-runner-dataset") {
    return key.name === "escape" ? { kind: "blur-editor" } : { kind: "ignore" }
  }
  if (key.name === "t") return { kind: "cycle-runner-target" }
  if (key.name === "c") return { kind: "cycle-runner-concurrency" }
  if (key.name === "x") return { kind: "apply-overlay" }
  return closesOverlay(key) ? { kind: "close-overlay" } : { kind: "ignore" }
}

function externalConflictCommand(key: OverlayKey): OverlayCommand {
  const resolution = ({ r: "reload", l: "apply-local", c: "save-copy" } as const)[key.name]
  if (resolution) return { kind: "resolve-external-conflict", resolution }
  return closesOverlay(key) ? { kind: "close-overlay" } : { kind: "ignore" }
}

function inputOwningOverlayCommand(
  key: OverlayKey,
  focusedId: string,
  inputPrefix: string,
): OverlayCommand {
  if (focusedId.startsWith(inputPrefix)) {
    return key.name === "escape" ? { kind: "blur-editor" } : { kind: "ignore" }
  }
  return key.name === "escape" ? { kind: "close-overlay" } : { kind: "ignore" }
}

export function resolveSpecialHttpOverlayCommand(
  overlay: HttpWorkspaceOverlay,
  key: OverlayKey,
  focusedId: string,
): OverlayCommand | null {
  if (overlay === "collection-import") return collectionImportCommand(key, focusedId)
  if (overlay === "collection-runner") return collectionRunnerCommand(key, focusedId)
  if (overlay === "external-conflict") return externalConflictCommand(key)
  if (overlay === "environment-manager") {
    return inputOwningOverlayCommand(key, focusedId, "http-environment-create-")
  }
  if (overlay === "workspace-settings") {
    return inputOwningOverlayCommand(key, focusedId, "http-key-value-")
  }
  return null
}
