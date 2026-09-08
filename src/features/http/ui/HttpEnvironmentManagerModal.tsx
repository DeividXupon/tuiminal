import type { BoxRenderable } from "@opentui/core"
import { useRenderer } from "@opentui/react"
import { useCallback, useMemo, useRef, useState } from "react"
import { COLORS, panelBorder } from "../../../core/settings/theme"
import { translateUi } from "../../../shared/i18n/index"
import { InlineButton } from "../../../shared/ui/InlineButton"
import type {
  CreatePrivateHttpEnvironmentInput,
  CreatePrivateHttpEnvironmentResult,
  HttpEnvironment,
} from "../storage/environments"
import { HttpEnvironmentList, HttpPrivateEnvironmentForm } from "./HttpEnvironmentManagerContent"

type EnvironmentManagerProps = {
  environments: HttpEnvironment[]
  activeName: string | null
  privateEnvironmentPath: string
  terminalWidth: number
  terminalHeight: number
  onSelect: (name: string | null) => void
  onCreate: (
    input: CreatePrivateHttpEnvironmentInput,
  ) => Promise<CreatePrivateHttpEnvironmentResult>
  onOpenWorkspaceSettings: () => void
  onClose: () => void
}

type EnvironmentKeyEvent = {
  name: string
  ctrl?: boolean
  shift?: boolean
  preventDefault(): void
  stopPropagation(): void
}

function consume(event: EnvironmentKeyEvent) {
  event.preventDefault()
  event.stopPropagation()
}

type EnvironmentCreateCommand =
  | "back"
  | "blur-input"
  | "close"
  | "ignore"
  | "save"
  | "toggle-gitignore"
  | "toggle-keychain"

function resolveEnvironmentCreateCommand(
  event: EnvironmentKeyEvent,
  focusedId: string,
): EnvironmentCreateCommand {
  if (event.ctrl && event.name === "k") return "toggle-keychain"
  if (focusedId.startsWith("http-environment-create-")) {
    if (event.name === "escape") return "blur-input"
    return event.ctrl && event.name === "s" ? "save" : "ignore"
  }
  if (event.name === "escape") return "close"
  if (event.name === "g") return "toggle-gitignore"
  if (event.ctrl && event.name === "s") return "save"
  return event.name === "b" ? "back" : "ignore"
}

export function HttpEnvironmentManagerModal({
  environments,
  activeName,
  privateEnvironmentPath,
  terminalWidth,
  terminalHeight,
  onSelect,
  onCreate,
  onOpenWorkspaceSettings,
  onClose,
}: EnvironmentManagerProps) {
  const renderer = useRenderer()
  const modalRef = useRef<BoxRenderable | null>(null)
  const [screen, setScreen] = useState<"list" | "create">("list")
  const [selection, setSelection] = useState(() =>
    Math.max(0, environments.findIndex((environment) => environment.name === activeName) + 1),
  )
  const [environmentName, setEnvironmentName] = useState("")
  const [variableName, setVariableName] = useState("")
  const [secret, setSecret] = useState("")
  const [addToGitignore, setAddToGitignore] = useState(true)
  const [storeInKeychain, setStoreInKeychain] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const width = Math.max(46, Math.min(86, terminalWidth - 4))
  const height = Math.max(14, Math.min(28, terminalHeight - 2))
  const choices = useMemo<Array<string | null>>(
    () => [null, ...environments.map((environment) => environment.name)],
    [environments],
  )

  const create = useCallback(async () => {
    if (busy) return
    setBusy(true)
    setError("")
    try {
      await onCreate({
        environmentName,
        variableName,
        value: secret,
        addToGitignore,
        storeInKeychain,
      })
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }, [
    addToGitignore,
    busy,
    environmentName,
    onClose,
    onCreate,
    secret,
    storeInKeychain,
    variableName,
  ])

  const select = useCallback(
    (name: string | null) => {
      onSelect(name)
      onClose()
    },
    [onClose, onSelect],
  )

  const handleCreateKey = useCallback(
    (event: EnvironmentKeyEvent) => {
      const focused = renderer.currentFocusedRenderable?.id ?? ""
      switch (resolveEnvironmentCreateCommand(event, focused)) {
        case "toggle-keychain":
          consume(event)
          setStoreInKeychain((current) => !current)
          break
        case "blur-input":
          consume(event)
          renderer.currentFocusedRenderable?.blur()
          modalRef.current?.focus()
          break
        case "save":
          consume(event)
          void create()
          break
        case "close":
          onClose()
          break
        case "toggle-gitignore":
          setAddToGitignore((current) => !current)
          break
        case "back":
          setScreen("list")
          break
      }
    },
    [create, onClose, renderer],
  )

  const handleListKey = useCallback(
    (event: EnvironmentKeyEvent) => {
      if (event.name === "escape") return onClose()
      if (event.name === "n") return setScreen("create")
      if (event.name === "w") return onOpenWorkspaceSettings()
      if (event.name === "up" || event.name === "k") {
        return setSelection((current) => (current - 1 + choices.length) % choices.length)
      }
      if (event.name === "down" || event.name === "j") {
        return setSelection((current) => (current + 1) % choices.length)
      }
      if (event.name === "enter" || event.name === "return") select(choices[selection] ?? null)
    },
    [choices, onClose, onOpenWorkspaceSettings, select, selection],
  )

  const handleKey = useCallback(
    (event: EnvironmentKeyEvent) => {
      if (screen === "create") handleCreateKey(event)
      else handleListKey(event)
    },
    [handleCreateKey, handleListKey, screen],
  )

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: OpenTUI has no dialog role and this focusable box owns modal keyboard input.
    <box
      ref={modalRef}
      id="http-environment-manager-modal"
      focusable
      onKeyDown={handleKey}
      style={{
        position: "absolute",
        left: Math.max(0, Math.floor((terminalWidth - width) / 2)),
        top: Math.max(0, Math.floor((terminalHeight - height) / 2)),
        width,
        height,
        zIndex: 125,
        ...panelBorder(COLORS.http),
        backgroundColor: COLORS.panelRaised,
        paddingLeft: 1,
        paddingRight: 1,
      }}
    >
      <box
        style={{ height: 1, flexShrink: 0, flexDirection: "row", justifyContent: "space-between" }}
      >
        <text content={translateUi("AMBIENTES HTTP")} style={{ fg: COLORS.http }} />
        <InlineButton
          id="http-environment-close"
          label="[Esc] Fechar"
          accent={COLORS.http}
          onPress={onClose}
        />
      </box>
      {screen === "list" ? (
        <HttpEnvironmentList
          environments={environments}
          activeName={activeName}
          selection={selection}
          onSelect={select}
          onCreate={() => setScreen("create")}
          onOpenWorkspaceSettings={onOpenWorkspaceSettings}
        />
      ) : (
        <HttpPrivateEnvironmentForm
          environmentName={environmentName}
          variableName={variableName}
          secret={secret}
          addToGitignore={addToGitignore}
          storeInKeychain={storeInKeychain}
          busy={busy}
          error={error}
          privateEnvironmentPath={privateEnvironmentPath}
          onEnvironmentNameChange={setEnvironmentName}
          onVariableNameChange={setVariableName}
          onSecretChange={setSecret}
          onToggleGitignore={() => setAddToGitignore((current) => !current)}
          onToggleKeychain={() => setStoreInKeychain((current) => !current)}
          onBack={() => setScreen("list")}
          onSave={() => void create()}
        />
      )}
    </box>
  )
}
