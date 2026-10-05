import type { InputRenderable, ScrollBoxRenderable } from "@opentui/core"
import type { ButtonRenderable } from "@tuiparts/core/button"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { Button } from "@tuiparts/react/button"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type {
  DatabaseConnectionDraft,
  DatabaseConnectionProfile,
  DatabaseDriver,
  ExternalDatabaseConnectionCandidate,
} from "../model/types"
import {
  addDatabaseConnection,
  DATABASE_DRIVER_OPTIONS,
  databaseDriverLabel,
  defaultPort,
  normalizedDraft,
  removeDatabaseConnection,
  testDatabaseConnection,
  testSavedDatabaseConnection,
  updateDatabaseConnection,
} from "../services/database"
import { completeExternalDatabaseConnection } from "../services/external-database-connections"
import { padDisplayEnd, translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { ModalSurface } from "@xupon/tuiminal-core/ui/ModalSurface"
import { ShortcutText } from "@xupon/tuiminal-core/ui/ShortcutText"
import { useNotificationFromValue } from "@xupon/tuiminal-core/notifications/index"
import type { PasswordInputRenderable } from "@xupon/tuiminal-core/ui/PasswordInput"
import "@xupon/tuiminal-core/ui/PasswordInput"
import { DatabaseConnectionList } from "./DatabaseConnectionList"

type DatabaseConnectionModalProps = {
  open: boolean
  connections: DatabaseConnectionProfile[]
  externalCandidates?: ExternalDatabaseConnectionCandidate[]
  externalWarnings?: string[]
  discoveringExternal?: boolean
  selectedConnectionId: string | null
  startInForm: boolean
  onClose: () => void
  onSelect: (profile: DatabaseConnectionProfile) => void
  onCreated: (profile: DatabaseConnectionProfile, notice: string) => void
  onDeleted: (connectionId: string) => void
  onRefreshExternal?: () => void | Promise<void>
}

type ModalScreen = "connections" | "form"

function modalTitle(
  screen: ModalScreen,
  externalCandidate: ExternalDatabaseConnectionCandidate | null,
  editingConnectionId: string | null,
) {
  if (screen !== "form") return "CONEXÕES DE BANCO"
  if (externalCandidate) return "COMPLETAR CONEXÃO EXTERNA"
  return editingConnectionId ? "EDITAR CONEXÃO" : "NOVA CONEXÃO"
}

function modalBackLabel(compact: boolean, screen: ModalScreen, hasConnections: boolean) {
  if (compact) return "[Esc]"
  return screen === "form" && hasConnections ? "[Esc] Voltar" : "[Esc] Fechar"
}

function saveButtonLabel(
  busy: boolean,
  compact: boolean,
  externalCandidate: ExternalDatabaseConnectionCandidate | null,
  editingConnectionId: string | null,
) {
  if (busy) return "[Ctrl+S] Aguarde…"
  if (compact) return "[Ctrl+S]"
  if (externalCandidate) return "[Ctrl+S] Conectar nesta sessão"
  return editingConnectionId ? "[Ctrl+S] Atualizar e conectar" : "[Ctrl+S] Salvar e conectar"
}

function availableDriverOptions(
  externalCandidate: ExternalDatabaseConnectionCandidate | null,
  driver: DatabaseDriver,
) {
  return externalCandidate
    ? DATABASE_DRIVER_OPTIONS.filter((option) => option.id === driver)
    : DATABASE_DRIVER_OPTIONS
}

function createDraft(driver: DatabaseDriver = "mysql"): DatabaseConnectionDraft {
  return {
    name: translateUi(
      driver === "sqlite"
        ? "SQLite local"
        : driver === "mcp-mysql"
          ? "Banco via MCP"
          : "Conexão local",
    ),
    driver,
    host: driver === "sqlite" || driver === "mcp-mysql" ? undefined : "127.0.0.1",
    port: defaultPort(driver),
    database: "",
    username: driver === "mysql" ? "root" : driver === "postgres" ? "postgres" : undefined,
    filename: driver === "sqlite" ? "./database.sqlite" : undefined,
    command: driver === "mcp-mysql" ? "~/.codex/bin/mysql-rw-mcp" : undefined,
    ssl: false,
    credentialSource: "tuiminal",
    writeEnabled: false,
  }
}

function draftFromProfile(profile: DatabaseConnectionProfile): DatabaseConnectionDraft {
  return {
    name: profile.name,
    driver: profile.driver,
    host: profile.host,
    port: profile.port,
    database: profile.database,
    username: profile.username,
    socket: profile.socket,
    filename: profile.filename,
    command: profile.command,
    ssl: profile.ssl,
    tlsMode: profile.tlsMode,
    credentialSource: profile.credentialSource ?? "tuiminal",
    writeEnabled: profile.writeEnabled,
  }
}

function ConnectionInput({
  label,
  id,
  value,
  placeholder,
  width,
  inputRef,
  onInput,
  onSubmit,
  masked = false,
  maxLength = 256,
}: {
  label: string
  id: string
  value: string
  placeholder: string
  width?: number | "auto" | `${number}%`
  inputRef: React.RefObject<InputRenderable | null>
  onInput: (value: string) => void
  onSubmit: () => void
  masked?: boolean
  maxLength?: number
}) {
  const inputStyle = {
    flexGrow: width === undefined ? 1 : 0,
    backgroundColor: COLORS.panelRaised,
    focusedBackgroundColor: COLORS.panelRaised,
    textColor: masked ? COLORS.panelRaised : COLORS.text,
    focusedTextColor: masked ? COLORS.panelRaised : COLORS.text,
    selectionFg: masked ? COLORS.panelRaised : COLORS.text,
    cursorColor: COLORS.database,
    placeholderColor: COLORS.muted,
  }

  return (
    <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
      <text
        content={padDisplayEnd(translateUi(label), 12)}
        style={{ width: 12, flexShrink: 0, fg: COLORS.muted }}
      />
      {masked ? (
        <password-input
          ref={inputRef as React.RefObject<PasswordInputRenderable | null>}
          id={id}
          value={value}
          placeholder={translateUi(placeholder)}
          {...(width === undefined ? {} : { width })}
          maxLength={maxLength}
          onMouseDown={() => inputRef.current?.focus()}
          onInput={onInput}
          onSubmit={onSubmit}
          style={inputStyle}
        />
      ) : (
        <input
          ref={inputRef}
          id={id}
          value={value}
          placeholder={translateUi(placeholder)}
          {...(width === undefined ? {} : { width })}
          maxLength={maxLength}
          onMouseDown={() => inputRef.current?.focus()}
          onInput={onInput}
          onSubmit={onSubmit}
          style={inputStyle}
        />
      )}
    </box>
  )
}

function DatabasePasswordField({
  hidden,
  editing,
  value,
  inputRef,
  onInput,
  onSubmit,
}: {
  hidden: boolean
  editing: boolean
  value: string
  inputRef: React.RefObject<InputRenderable | null>
  onInput: (value: string) => void
  onSubmit: () => void
}) {
  if (hidden) return null
  return (
    <ConnectionInput
      label="Senha"
      id="db-connection-password"
      value={value}
      placeholder={editing ? "vazia mantém a atual" : "opcional"}
      inputRef={inputRef}
      onInput={onInput}
      onSubmit={onSubmit}
      masked
    />
  )
}

function DatabaseCredentialControl({
  external,
  postgres,
  usesPgpass,
  persistPassword,
  buttonRef,
  onTogglePgpass,
  onToggleKeychain,
}: {
  external: boolean
  postgres: boolean
  usesPgpass: boolean
  persistPassword: boolean
  buttonRef: React.RefObject<ButtonRenderable | null>
  onTogglePgpass: () => void
  onToggleKeychain: () => void
}) {
  if (external) return null
  if (postgres) {
    return (
      <InlineButton
        id="db-connection-keychain"
        buttonRef={buttonRef}
        label={`[Ctrl+K] ${usesPgpass ? "◆" : "◇"} ~/.pgpass`}
        accent={COLORS.database}
        active={usesPgpass}
        onPress={onTogglePgpass}
      />
    )
  }
  return (
    <InlineButton
      id="db-connection-keychain"
      buttonRef={buttonRef}
      label={`[Ctrl+K] ${persistPassword ? "◆" : "◇"} Keychain`}
      accent={COLORS.database}
      active={persistPassword}
      onPress={onToggleKeychain}
    />
  )
}

export function DatabaseConnectionModal({
  open,
  connections,
  externalCandidates = [],
  externalWarnings = [],
  discoveringExternal = false,
  selectedConnectionId,
  startInForm,
  onClose,
  onSelect,
  onCreated,
  onDeleted,
  onRefreshExternal,
}: DatabaseConnectionModalProps) {
  const renderer = useRenderer()
  const terminal = useTerminalDimensions()
  const [screen, setScreen] = useState<ModalScreen>(startInForm ? "form" : "connections")
  const [draft, setDraft] = useState<DatabaseConnectionDraft>(() => createDraft())
  const [password, setPassword] = useState("")
  const [persistPassword, setPersistPassword] = useState(true)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState("")
  const [editingConnectionId, setEditingConnectionId] = useState<string | null>(null)
  const [externalCandidate, setExternalCandidate] =
    useState<ExternalDatabaseConnectionCandidate | null>(null)
  const [deleteConfirmationId, setDeleteConfirmationId] = useState<string | null>(null)
  useNotificationFromValue(notice, { source: "Banco · Conexão" })
  const nameRef = useRef<InputRenderable | null>(null)
  const hostRef = useRef<InputRenderable | null>(null)
  const portRef = useRef<InputRenderable | null>(null)
  const databaseRef = useRef<InputRenderable | null>(null)
  const usernameRef = useRef<InputRenderable | null>(null)
  const passwordRef = useRef<InputRenderable | null>(null)
  const filenameRef = useRef<InputRenderable | null>(null)
  const commandRef = useRef<InputRenderable | null>(null)
  const driverRefs = useRef<Array<ButtonRenderable | null>>([])
  const tlsRef = useRef<ButtonRenderable | null>(null)
  const keychainRef = useRef<ButtonRenderable | null>(null)
  const accessRef = useRef<ButtonRenderable | null>(null)
  const testRef = useRef<ButtonRenderable | null>(null)
  const saveRef = useRef<ButtonRenderable | null>(null)
  const backRef = useRef<ButtonRenderable | null>(null)
  const formScrollRef = useRef<ScrollBoxRenderable | null>(null)
  const connectionListRef = useRef<ScrollBoxRenderable | null>(null)
  const connectionItems = useMemo(
    () => [...connections, ...externalCandidates],
    [connections, externalCandidates],
  )
  const usesPgpass = draft.driver === "postgres" && draft.credentialSource === "pgpass"
  const driverOptions = availableDriverOptions(externalCandidate, draft.driver)

  const formRefs = useMemo(() => {
    if (draft.driver === "sqlite") return [nameRef, filenameRef]
    if (draft.driver === "mcp-mysql") return [nameRef, commandRef]
    return [
      nameRef,
      hostRef,
      portRef,
      databaseRef,
      usernameRef,
      ...(usesPgpass ? [] : [passwordRef]),
    ]
  }, [draft.driver, usesPgpass])

  const focusFormInput = useCallback((target: React.RefObject<InputRenderable | null>) => {
    target.current?.focus()
    const id = target.current?.id
    if (id) {
      setTimeout(() => formScrollRef.current?.scrollChildIntoView(id), 0)
    }
  }, [])

  const focusFormControl = useCallback((target: InputRenderable | ButtonRenderable) => {
    target.focus()
    if (target.id) {
      setTimeout(() => formScrollRef.current?.scrollChildIntoView(target.id), 0)
    }
  }, [])

  const formControls = useCallback(() => {
    const controls: Array<InputRenderable | ButtonRenderable | null> = [
      ...driverRefs.current,
      ...formRefs.map((ref) => ref.current),
    ]
    if ((draft.driver === "mysql" || draft.driver === "postgres") && !externalCandidate) {
      controls.push(tlsRef.current, keychainRef.current)
    }
    if (draft.driver !== "mcp-mysql") controls.push(accessRef.current)
    controls.push(testRef.current, saveRef.current)
    if (connectionItems.length) controls.push(backRef.current)
    return controls.filter((control): control is InputRenderable | ButtonRenderable =>
      Boolean(control),
    )
  }, [connectionItems.length, draft.driver, externalCandidate, formRefs])

  const backFromForm = useCallback(() => {
    if (connectionItems.length > 0) {
      setEditingConnectionId(null)
      setExternalCandidate(null)
      setScreen("connections")
    } else {
      onClose()
    }
  }, [connectionItems.length, onClose])

  const chooseDriver = useCallback((driver: DatabaseDriver) => {
    setDraft((current) => ({
      ...createDraft(driver),
      name: current.name || createDraft(driver).name,
      writeEnabled: driver === "mcp-mysql" ? false : current.writeEnabled,
    }))
    setPassword("")
    setNotice("")
  }, [])

  const toggleCredentialSource = useCallback(() => {
    if (draft.driver === "postgres") {
      setDraft((current) => ({
        ...current,
        credentialSource: usesPgpass ? "tuiminal" : "pgpass",
      }))
    } else setPersistPassword((current) => !current)
  }, [draft.driver, usesPgpass])

  const startCreate = useCallback(() => {
    setEditingConnectionId(null)
    setExternalCandidate(null)
    setDraft(createDraft())
    setPassword("")
    setPersistPassword(true)
    setDeleteConfirmationId(null)
    setNotice("")
    setScreen("form")
  }, [])

  const startEdit = useCallback((profile: DatabaseConnectionProfile) => {
    if (profile.source !== "saved") {
      setNotice("Conexões descobertas pelo ambiente não podem ser editadas aqui.")
      return
    }
    setEditingConnectionId(profile.id)
    setExternalCandidate(null)
    setDraft(draftFromProfile(profile))
    setPassword("")
    setPersistPassword(true)
    setDeleteConfirmationId(null)
    setNotice("")
    setScreen("form")
  }, [])

  const startExternal = useCallback((candidate: ExternalDatabaseConnectionCandidate) => {
    setEditingConnectionId(null)
    setExternalCandidate(candidate)
    setDraft({ ...draftFromProfile(candidate), credentialSource: "tuiminal", writeEnabled: true })
    setPassword("")
    setDeleteConfirmationId(null)
    setNotice(translateUi("Complete os campos ausentes."))
    setScreen("form")
  }, [])

  const selectConnection = useCallback(
    (profile: DatabaseConnectionProfile | ExternalDatabaseConnectionCandidate) => {
      if ("missing" in profile) startExternal(profile)
      else onSelect(profile)
    },
    [onSelect, startExternal],
  )

  const focusNext = useCallback(
    (current: React.RefObject<InputRenderable | null>) => {
      const index = formRefs.indexOf(current)
      const next = formRefs[(index + 1) % formRefs.length]
      if (next) focusFormInput(next)
    },
    [focusFormInput, formRefs],
  )

  const test = useCallback(async () => {
    setBusy(true)
    setNotice("Testando conexão…")
    try {
      if (editingConnectionId) {
        await testSavedDatabaseConnection(editingConnectionId, draft, password)
      } else {
        await testDatabaseConnection(draft, password)
      }
      setNotice("✓ Conexão estabelecida com sucesso")
    } catch (error) {
      setNotice(error instanceof Error ? `Erro: ${error.message}` : "Não foi possível conectar.")
    } finally {
      setBusy(false)
    }
  }, [draft, editingConnectionId, password])

  const save = useCallback(async () => {
    setBusy(true)
    setNotice("Testando e salvando…")
    try {
      if (externalCandidate) {
        const normalized = normalizedDraft(draft)
        await testDatabaseConnection(normalized, password)
        const profile = completeExternalDatabaseConnection(externalCandidate, normalized, password)
        onCreated(profile, translateUi("Conexão externa disponível nesta sessão"))
        return
      }
      const result = editingConnectionId
        ? await updateDatabaseConnection(editingConnectionId, draft, password, persistPassword)
        : await addDatabaseConnection(draft, password, persistPassword)
      onCreated(
        result.profile,
        result.warning ?? (editingConnectionId ? "Conexão atualizada" : "Conexão adicionada"),
      )
      setDraft(createDraft())
      setPassword("")
      setEditingConnectionId(null)
      setNotice("")
    } catch (error) {
      setNotice(error instanceof Error ? `Erro: ${error.message}` : "Não foi possível salvar.")
    } finally {
      setBusy(false)
    }
  }, [draft, editingConnectionId, externalCandidate, onCreated, password, persistPassword])

  const removeSelected = useCallback(async () => {
    const profile = connectionItems[selectedIndex]
    if (profile?.source !== "saved") {
      setNotice("Apenas conexões salvas podem ser excluídas.")
      return
    }
    if (deleteConfirmationId !== profile.id) {
      setDeleteConfirmationId(profile.id)
      setNotice(`Confirme a exclusão de “${profile.name}”.`)
      return
    }
    setBusy(true)
    setNotice("Excluindo conexão…")
    try {
      await removeDatabaseConnection(profile.id)
      setDeleteConfirmationId(null)
      onDeleted(profile.id)
    } catch (error) {
      setNotice(error instanceof Error ? `Erro: ${error.message}` : "Não foi possível excluir.")
    } finally {
      setBusy(false)
    }
  }, [connectionItems, deleteConfirmationId, onDeleted, selectedIndex])

  useEffect(() => {
    if (!open) return
    const nextScreen = startInForm || connectionItems.length === 0 ? "form" : "connections"
    setScreen(nextScreen)
    setNotice("")
    setDeleteConfirmationId(null)
    setExternalCandidate(null)
    if (nextScreen === "form") {
      setEditingConnectionId(null)
      setDraft(createDraft())
      setPassword("")
    }
    const selected = connections.findIndex((profile) => profile.id === selectedConnectionId)
    setSelectedIndex(Math.max(0, selected))
    if (nextScreen === "form") setTimeout(() => focusFormInput(nameRef), 0)
  }, [connectionItems.length, connections, focusFormInput, open, selectedConnectionId, startInForm])

  useEffect(() => {
    if (open && screen === "form") setTimeout(() => focusFormInput(nameRef), 0)
  }, [focusFormInput, open, screen])

  useEffect(() => {
    if (open) void onRefreshExternal?.()
  }, [onRefreshExternal, open])

  useEffect(() => {
    if (!open) return
    return () => {
      const focused = renderer.currentFocusedRenderable
      if (
        focused &&
        (focused.id === "database-connection-list" || focused.id?.startsWith("db-connection-"))
      ) {
        focused.blur()
      }
    }
  }, [open, renderer])

  useEffect(() => {
    if (!deleteConfirmationId) return
    const timeout = setTimeout(() => {
      setDeleteConfirmationId(null)
      setNotice("")
    }, 8_000)
    return () => clearTimeout(timeout)
  }, [deleteConfirmationId])

  // With no profiles there is no useful connection-list screen. Deriving this
  // synchronously avoids flashing an empty list before the opening effect runs.
  const activeScreen: ModalScreen = connectionItems.length === 0 ? "form" : screen

  useEffect(() => {
    if (!open || activeScreen !== "connections") return
    connectionListRef.current?.scrollChildIntoView(`database-connection-card-${selectedIndex}`)
    const timeout = setTimeout(() => connectionListRef.current?.focus(), 0)
    return () => clearTimeout(timeout)
  }, [activeScreen, open, selectedIndex])

  useKeyboard((key) => {
    if (!open) return
    const focusedId = renderer.currentFocusedRenderable?.id
    const editing = formRefs.some((ref) => ref.current?.id === focusedId)

    if (key.name === "escape") {
      key.preventDefault()
      key.stopPropagation()
      if (activeScreen === "form" && editing) {
        renderer.currentFocusedRenderable?.blur()
        return
      }
      if (activeScreen === "form") backFromForm()
      else onClose()
      return
    }
    if (activeScreen === "form") {
      const consume = () => {
        key.preventDefault()
        key.stopPropagation()
      }
      if (key.name === "tab") {
        consume()
        const controls = formControls()
        const currentIndex = controls.findIndex((control) => control.id === focusedId)
        const direction = key.shift ? -1 : 1
        const nextIndex = (currentIndex + direction + controls.length) % controls.length
        const next = controls[nextIndex]
        if (next) focusFormControl(next)
      } else if (key.ctrl && key.name === "d" && !externalCandidate) {
        consume()
        const currentIndex = DATABASE_DRIVER_OPTIONS.findIndex(
          (option) => option.id === draft.driver,
        )
        const next = DATABASE_DRIVER_OPTIONS[(currentIndex + 1) % DATABASE_DRIVER_OPTIONS.length]
        if (next) chooseDriver(next.id)
      } else if (
        key.ctrl &&
        key.name === "t" &&
        (draft.driver === "mysql" || draft.driver === "postgres") &&
        !externalCandidate
      ) {
        consume()
        setDraft((current) => ({ ...current, ssl: !current.ssl }))
      } else if (
        key.ctrl &&
        key.name === "k" &&
        (draft.driver === "mysql" || draft.driver === "postgres") &&
        !externalCandidate
      ) {
        consume()
        toggleCredentialSource()
      } else if (
        key.ctrl &&
        key.name === "w" &&
        draft.driver !== "mcp-mysql" &&
        !externalCandidate
      ) {
        consume()
        setDraft((current) => ({ ...current, writeEnabled: !current.writeEnabled }))
      } else if (key.ctrl && key.name === "r" && !busy) {
        consume()
        void test()
      } else if (key.ctrl && key.name === "s" && !busy) {
        consume()
        void save()
      }
      return
    }

    if (key.name === "up" || key.name === "k") {
      key.preventDefault()
      key.stopPropagation()
      setSelectedIndex((current) => Math.max(0, current - 1))
    } else if (key.name === "down" || key.name === "j") {
      key.preventDefault()
      key.stopPropagation()
      setSelectedIndex((current) => Math.min(connectionItems.length - 1, current + 1))
    } else if (
      key.name === "enter" ||
      key.name === "return" ||
      key.name === "kpenter" ||
      key.name === "linefeed"
    ) {
      key.preventDefault()
      key.stopPropagation()
      const profile = connectionItems[selectedIndex]
      if (profile) selectConnection(profile)
    } else if (key.name === "c" || key.name === "n") {
      key.preventDefault()
      key.stopPropagation()
      startCreate()
    } else if (key.name === "e") {
      key.preventDefault()
      key.stopPropagation()
      const profile = connectionItems[selectedIndex]
      if (profile) startEdit(profile)
    } else if (key.name === "delete" || key.name === "x") {
      key.preventDefault()
      key.stopPropagation()
      void removeSelected()
    }
  })

  if (!open) return null
  const width = Math.min(84, Math.max(32, terminal.width - 8), Math.max(20, terminal.width - 2))
  const isNetworkDriver = draft.driver === "mysql" || draft.driver === "postgres"
  const desiredHeight =
    activeScreen === "connections"
      ? Math.max(14, Math.min(26, connectionItems.length * 3 + 10))
      : isNetworkDriver
        ? 22
        : 16
  const height = Math.min(
    desiredHeight,
    Math.max(10, terminal.height - 4),
    Math.max(6, terminal.height - 2),
  )
  const selectedDriver = DATABASE_DRIVER_OPTIONS.find((option) => option.id === draft.driver)
  const updateDraft = (patch: Partial<DatabaseConnectionDraft>) =>
    setDraft((current) => ({ ...current, ...patch }))
  const compact = width < 58

  return (
    <ModalSurface
      id="database-connection-modal"
      width={width}
      height={height}
      zIndex={920}
      borderColor={COLORS.database}
      backdropOpacity={0.88}
      horizontalPadding={compact ? 1 : 2}
      dialogFocusable={false}
      onBackdropPress={onClose}
    >
      <box
        style={{
          height: 2,
          flexShrink: 0,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          border: ["bottom"],
          borderColor: COLORS.border,
        }}
      >
        <text
          content={`◆ ${translateUi(modalTitle(activeScreen, externalCandidate, editingConnectionId))}`}
          style={{ fg: COLORS.database }}
        />
        <InlineButton
          label={modalBackLabel(compact, activeScreen, connectionItems.length > 0)}
          accent={COLORS.database}
          onPress={activeScreen === "form" ? backFromForm : onClose}
        />
      </box>

      {activeScreen === "connections" ? (
        <DatabaseConnectionList
          items={connectionItems}
          selectedIndex={selectedIndex}
          deleteConfirmationId={deleteConfirmationId}
          busy={busy}
          notice={notice}
          {...(externalWarnings[0] ? { externalWarning: externalWarnings[0] } : {})}
          discoveringExternal={discoveringExternal}
          listRef={connectionListRef}
          onCreate={startCreate}
          onRefresh={() => void onRefreshExternal?.()}
          onActivate={(profile, index) => {
            setSelectedIndex(index)
            setDeleteConfirmationId(null)
            setNotice("")
            selectConnection(profile)
          }}
          onEdit={() => {
            const profile = connectionItems[selectedIndex]
            if (profile) startEdit(profile)
          }}
          onDelete={() => void removeSelected()}
        />
      ) : (
        <box style={{ flexGrow: 1 }}>
          <scrollbox
            ref={formScrollRef}
            scrollY
            viewportCulling
            style={{ flexGrow: 1, width: "100%" }}
            verticalScrollbarOptions={{
              trackOptions: { backgroundColor: COLORS.panel, foregroundColor: COLORS.border },
            }}
          >
            <box style={{ height: 1, flexShrink: 0, flexDirection: "row", gap: 1 }}>
              {driverOptions.map((option, index) => (
                <Button
                  key={option.id}
                  id={`db-connection-driver-${option.id}`}
                  ref={(button) => {
                    driverRefs.current[index] = button
                  }}
                  onPress={() => {
                    if (!externalCandidate) chooseDriver(option.id)
                  }}
                  width="25%"
                  height={1}
                  flexShrink={1}
                >
                  {(state) => (
                    <box
                      style={{
                        height: 1,
                        paddingLeft: 1,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor:
                          draft.driver === option.id || state.focused
                            ? COLORS.panelRaised
                            : COLORS.panel,
                      }}
                    >
                      <text
                        content={`${draft.driver === option.id ? "◆" : "◇"} ${
                          compact
                            ? option.id === "postgres"
                              ? "PG"
                              : option.id === "mcp-mysql"
                                ? "MCP"
                                : option.label
                            : option.label
                        }`}
                        style={{
                          fg: draft.driver === option.id ? COLORS.database : COLORS.text,
                        }}
                      />
                    </box>
                  )}
                </Button>
              ))}
            </box>

            <ShortcutText
              content={truncateDisplay(
                `${translateUi(selectedDriver?.description ?? databaseDriverLabel(draft.driver))}  ·  ${translateUi("[Ctrl+D] alternar driver")}`,
                Math.max(8, width - (compact ? 4 : 6)),
              )}
              style={{ height: 1, flexShrink: 0, fg: COLORS.muted }}
            />
            <text
              content="DADOS DA CONEXÃO"
              style={{ height: 1, flexShrink: 0, fg: COLORS.database, marginTop: 1 }}
            />
            <ConnectionInput
              label="Nome"
              id="db-connection-name"
              value={draft.name}
              placeholder="ex.: Desenvolvimento"
              inputRef={nameRef}
              onInput={(name) => updateDraft({ name })}
              onSubmit={() => focusNext(nameRef)}
            />

            {draft.driver === "sqlite" ? (
              <ConnectionInput
                label="Arquivo"
                id="db-connection-filename"
                value={draft.filename ?? ""}
                placeholder="~/projeto/database.sqlite"
                inputRef={filenameRef}
                onInput={(filename) => updateDraft({ filename })}
                onSubmit={() => void test()}
              />
            ) : draft.driver === "mcp-mysql" ? (
              <ConnectionInput
                label="Executável"
                id="db-connection-command"
                value={draft.command ?? ""}
                placeholder="/caminho/para/mysql-mcp"
                inputRef={commandRef}
                onInput={(command) => updateDraft({ command })}
                onSubmit={() => void test()}
              />
            ) : (
              <>
                <ConnectionInput
                  label="Host"
                  id="db-connection-host"
                  value={draft.host ?? ""}
                  placeholder="127.0.0.1"
                  inputRef={hostRef}
                  onInput={(host) => updateDraft({ host })}
                  onSubmit={() => focusNext(hostRef)}
                />
                <ConnectionInput
                  label="Porta"
                  id="db-connection-port"
                  value={String(draft.port ?? "")}
                  placeholder={String(defaultPort(draft.driver) ?? "")}
                  inputRef={portRef}
                  onInput={(port) => {
                    const digits = port.replace(/\D/g, "")
                    updateDraft({ port: digits ? Number(digits) : undefined })
                  }}
                  onSubmit={() => focusNext(portRef)}
                  maxLength={5}
                />
                <ConnectionInput
                  label="Banco"
                  id="db-connection-database"
                  value={draft.database ?? ""}
                  placeholder="nome_do_banco"
                  inputRef={databaseRef}
                  onInput={(database) => updateDraft({ database })}
                  onSubmit={() => focusNext(databaseRef)}
                />
                <ConnectionInput
                  label="Usuário"
                  id="db-connection-username"
                  value={draft.username ?? ""}
                  placeholder="usuário"
                  inputRef={usernameRef}
                  onInput={(username) => updateDraft({ username })}
                  onSubmit={() => focusNext(usernameRef)}
                />
                <DatabasePasswordField
                  hidden={usesPgpass}
                  editing={Boolean(editingConnectionId)}
                  value={password}
                  inputRef={passwordRef}
                  onInput={setPassword}
                  onSubmit={() => void test()}
                />
                <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
                  <InlineButton
                    id="db-connection-tls"
                    buttonRef={tlsRef}
                    label={`[Ctrl+T] ${draft.ssl ? "◆" : "◇"} TLS`}
                    accent={COLORS.database}
                    active={draft.ssl}
                    disabled={Boolean(externalCandidate)}
                    onPress={() => updateDraft({ ssl: !draft.ssl })}
                  />
                  <DatabaseCredentialControl
                    external={Boolean(externalCandidate)}
                    postgres={draft.driver === "postgres"}
                    usesPgpass={usesPgpass}
                    persistPassword={persistPassword}
                    buttonRef={keychainRef}
                    onTogglePgpass={() =>
                      updateDraft({ credentialSource: usesPgpass ? "tuiminal" : "pgpass" })
                    }
                    onToggleKeychain={() => setPersistPassword((current) => !current)}
                  />
                </box>
              </>
            )}

            <box style={{ height: 2, flexShrink: 0, flexDirection: "column" }}>
              <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
                <text content="Acesso" style={{ width: 12, flexShrink: 0, fg: COLORS.muted }} />
                <InlineButton
                  id="db-connection-access"
                  buttonRef={accessRef}
                  label={
                    draft.writeEnabled
                      ? "[Ctrl+W] ◆ LEITURA + ESCRITA"
                      : "[Ctrl+W] ◇ SOMENTE LEITURA"
                  }
                  accent={draft.writeEnabled ? COLORS.warning : COLORS.database}
                  active={draft.writeEnabled}
                  disabled={draft.driver === "mcp-mysql" || Boolean(externalCandidate)}
                  onPress={() => updateDraft({ writeEnabled: !draft.writeEnabled })}
                />
              </box>
              <text
                content={
                  draft.driver === "mcp-mysql"
                    ? "            O conector MCP atual aceita somente leitura."
                    : "            RW permite inserir, editar e excluir registros."
                }
                style={{ fg: draft.writeEnabled ? COLORS.warning : COLORS.muted }}
              />
            </box>
          </scrollbox>

          <box
            style={{
              height: 2,
              flexShrink: 0,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              border: ["top"],
              borderColor: COLORS.border,
            }}
          >
            <box style={{ flexDirection: "row" }}>
              <InlineButton
                id="db-connection-test"
                buttonRef={testRef}
                label={busy ? "[Ctrl+R] Testando…" : compact ? "[Ctrl+R]" : "[Ctrl+R] Testar"}
                accent={COLORS.database}
                disabled={busy}
                onPress={() => void test()}
              />
              <InlineButton
                id="db-connection-save"
                buttonRef={saveRef}
                label={saveButtonLabel(busy, compact, externalCandidate, editingConnectionId)}
                accent={COLORS.database}
                disabled={busy}
                onPress={() => void save()}
              />
            </box>
            {connectionItems.length > 0 ? (
              <InlineButton
                id="db-connection-back"
                buttonRef={backRef}
                label={compact ? "[Esc]" : "[Esc] Voltar"}
                accent={COLORS.database}
                onPress={backFromForm}
              />
            ) : null}
          </box>
          <text
            content={
              notice ||
              (width < 76
                ? "Senha protegida pelo sistema."
                : "Senha protegida pelo gerenciador de credenciais do sistema.")
            }
            style={{ fg: notice.startsWith("Erro") ? COLORS.danger : COLORS.muted }}
          />
        </box>
      )}
    </ModalSurface>
  )
}
