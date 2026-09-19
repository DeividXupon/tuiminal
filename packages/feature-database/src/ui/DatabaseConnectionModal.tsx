import { ShortcutText } from "@xupon/tuiminal-core/ui/ShortcutText"
import type { InputRenderable, ScrollBoxRenderable } from "@opentui/core"
import type { ButtonRenderable } from "@tuiparts/core/button"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { Button } from "@tuiparts/react/button"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type {
  DatabaseConnectionDraft,
  DatabaseConnectionProfile,
  DatabaseDriver,
} from "../model/types"
import {
  addDatabaseConnection,
  DATABASE_DRIVER_OPTIONS,
  databaseDriverLabel,
  defaultPort,
  removeDatabaseConnection,
  testDatabaseConnection,
  testSavedDatabaseConnection,
  updateDatabaseConnection,
} from "../services/database"
import { padDisplayEnd, translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { ModalSurface } from "@xupon/tuiminal-core/ui/ModalSurface"
import { useNotificationFromValue } from "@xupon/tuiminal-core/notifications/index"
import type { PasswordInputRenderable } from "@xupon/tuiminal-core/ui/PasswordInput"
import "@xupon/tuiminal-core/ui/PasswordInput"

type DatabaseConnectionModalProps = {
  open: boolean
  connections: DatabaseConnectionProfile[]
  selectedConnectionId: string | null
  startInForm: boolean
  onClose: () => void
  onSelect: (profile: DatabaseConnectionProfile) => void
  onCreated: (profile: DatabaseConnectionProfile, notice: string) => void
  onDeleted: (connectionId: string) => void
}

type ModalScreen = "connections" | "form"

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
    filename: profile.filename,
    command: profile.command,
    ssl: profile.ssl,
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

function ConnectionCard({
  id,
  profile,
  selected,
  onPress,
}: {
  id: string
  profile: DatabaseConnectionProfile
  selected: boolean
  onPress: () => void
}) {
  const endpoint =
    profile.filename ||
    (profile.host
      ? `${profile.host}:${profile.port ?? ""}/${profile.database ?? ""}`
      : undefined) ||
    profile.command ||
    "configuração externa"
  return (
    <Button id={id} onPress={onPress} height={3} flexShrink={0}>
      {(state) => (
        <box
          style={{
            height: 3,
            flexShrink: 0,
            paddingLeft: 1,
            paddingRight: 1,
            backgroundColor: selected || state.focused ? COLORS.panelRaised : COLORS.panel,
          }}
        >
          <box style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <text
              content={`${selected ? "◆" : "◇"} ${profile.name}`}
              style={{ fg: selected ? COLORS.database : COLORS.text }}
            />
            <text
              content={`${databaseDriverLabel(profile.driver)} · ${profile.writeEnabled ? "RW" : "RO"}`}
              style={{ fg: profile.writeEnabled ? COLORS.warning : COLORS.database }}
            />
          </box>
          <text content={endpoint} style={{ fg: COLORS.muted }} />
          <text
            content={
              profile.source === "saved"
                ? "perfil salvo"
                : profile.source === "mcp"
                  ? "descoberto automaticamente"
                  : "variável de ambiente"
            }
            style={{ fg: COLORS.muted }}
          />
        </box>
      )}
    </Button>
  )
}

export function DatabaseConnectionModal({
  open,
  connections,
  selectedConnectionId,
  startInForm,
  onClose,
  onSelect,
  onCreated,
  onDeleted,
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

  const formRefs = useMemo(() => {
    if (draft.driver === "sqlite") return [nameRef, filenameRef]
    if (draft.driver === "mcp-mysql") return [nameRef, commandRef]
    return [nameRef, hostRef, portRef, databaseRef, usernameRef, passwordRef]
  }, [draft.driver])

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
    if (draft.driver === "mysql" || draft.driver === "postgres") {
      controls.push(tlsRef.current, keychainRef.current)
    }
    if (draft.driver !== "mcp-mysql") controls.push(accessRef.current)
    controls.push(testRef.current, saveRef.current)
    if (connections.length) controls.push(backRef.current)
    return controls.filter((control): control is InputRenderable | ButtonRenderable =>
      Boolean(control),
    )
  }, [connections.length, draft.driver, formRefs])

  const backFromForm = useCallback(() => {
    if (connections.length > 0) {
      setEditingConnectionId(null)
      setScreen("connections")
    } else {
      onClose()
    }
  }, [connections.length, onClose])

  const chooseDriver = useCallback((driver: DatabaseDriver) => {
    setDraft((current) => ({
      ...createDraft(driver),
      name: current.name || createDraft(driver).name,
      writeEnabled: driver === "mcp-mysql" ? false : current.writeEnabled,
    }))
    setPassword("")
    setNotice("")
  }, [])

  const startCreate = useCallback(() => {
    setEditingConnectionId(null)
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
    setDraft(draftFromProfile(profile))
    setPassword("")
    setPersistPassword(true)
    setDeleteConfirmationId(null)
    setNotice("")
    setScreen("form")
  }, [])

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
  }, [draft, editingConnectionId, onCreated, password, persistPassword])

  const removeSelected = useCallback(async () => {
    const profile = connections[selectedIndex]
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
  }, [connections, deleteConfirmationId, onDeleted, selectedIndex])

  useEffect(() => {
    if (!open) return
    const nextScreen = startInForm || connections.length === 0 ? "form" : "connections"
    setScreen(nextScreen)
    setNotice("")
    setDeleteConfirmationId(null)
    if (nextScreen === "form") {
      setEditingConnectionId(null)
      setDraft(createDraft())
      setPassword("")
    }
    const selected = connections.findIndex((profile) => profile.id === selectedConnectionId)
    setSelectedIndex(Math.max(0, selected))
    if (nextScreen === "form") setTimeout(() => focusFormInput(nameRef), 0)
  }, [connections, focusFormInput, open, selectedConnectionId, startInForm])

  useEffect(() => {
    if (open && screen === "form") setTimeout(() => focusFormInput(nameRef), 0)
  }, [focusFormInput, open, screen])

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
  const activeScreen: ModalScreen = connections.length === 0 ? "form" : screen

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
      } else if (key.ctrl && key.name === "d") {
        consume()
        const currentIndex = DATABASE_DRIVER_OPTIONS.findIndex(
          (option) => option.id === draft.driver,
        )
        const next = DATABASE_DRIVER_OPTIONS[(currentIndex + 1) % DATABASE_DRIVER_OPTIONS.length]
        if (next) chooseDriver(next.id)
      } else if (
        key.ctrl &&
        key.name === "t" &&
        (draft.driver === "mysql" || draft.driver === "postgres")
      ) {
        consume()
        setDraft((current) => ({ ...current, ssl: !current.ssl }))
      } else if (
        key.ctrl &&
        key.name === "k" &&
        (draft.driver === "mysql" || draft.driver === "postgres")
      ) {
        consume()
        setPersistPassword((current) => !current)
      } else if (key.ctrl && key.name === "w" && draft.driver !== "mcp-mysql") {
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
      setSelectedIndex((current) => Math.min(connections.length - 1, current + 1))
    } else if (
      key.name === "enter" ||
      key.name === "return" ||
      key.name === "kpenter" ||
      key.name === "linefeed"
    ) {
      key.preventDefault()
      key.stopPropagation()
      const profile = connections[selectedIndex]
      if (profile) onSelect(profile)
    } else if (key.name === "c" || key.name === "n") {
      key.preventDefault()
      key.stopPropagation()
      startCreate()
    } else if (key.name === "e") {
      key.preventDefault()
      key.stopPropagation()
      const profile = connections[selectedIndex]
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
      ? Math.max(14, Math.min(26, connections.length * 3 + 10))
      : isNetworkDriver
        ? 22
        : 16
  const height = Math.min(
    desiredHeight,
    Math.max(10, terminal.height - 4),
    Math.max(6, terminal.height - 2),
  )
  const selectedDriver = DATABASE_DRIVER_OPTIONS.find((option) => option.id === draft.driver)
  const selectedProfile = connections[selectedIndex]
  const selectedProfileIsSaved = selectedProfile?.source === "saved"
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
          content={
            activeScreen === "form"
              ? editingConnectionId
                ? "◆ EDITAR CONEXÃO"
                : "◆ NOVA CONEXÃO"
              : "◆ CONEXÕES DE BANCO"
          }
          style={{ fg: COLORS.database }}
        />
        <InlineButton
          label={
            compact
              ? "[Esc]"
              : activeScreen === "form" && connections.length
                ? "[Esc] Voltar"
                : "[Esc] Fechar"
          }
          accent={COLORS.database}
          onPress={activeScreen === "form" ? backFromForm : onClose}
        />
      </box>

      {activeScreen === "connections" ? (
        <box style={{ flexGrow: 1 }}>
          <box
            style={{
              height: 2,
              flexShrink: 0,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <text content="Escolha um perfil para conectar" style={{ fg: COLORS.muted }} />
            <InlineButton label="[C] Nova conexão" accent={COLORS.database} onPress={startCreate} />
          </box>
          <scrollbox
            ref={connectionListRef}
            id="database-connection-list"
            scrollY
            viewportCulling
            style={{ flexGrow: 1, width: "100%" }}
            verticalScrollbarOptions={{
              trackOptions: { backgroundColor: COLORS.panel, foregroundColor: COLORS.border },
            }}
          >
            {connections.map((profile, index) => (
              <ConnectionCard
                key={profile.id}
                id={`database-connection-card-${index}`}
                profile={profile}
                selected={index === selectedIndex}
                onPress={() => {
                  setSelectedIndex(index)
                  setDeleteConfirmationId(null)
                  setNotice("")
                  onSelect(profile)
                }}
              />
            ))}
          </scrollbox>
          <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
            <InlineButton
              label="[Enter] Conectar"
              accent={COLORS.database}
              disabled={!selectedProfile || busy}
              onPress={() => {
                if (selectedProfile) onSelect(selectedProfile)
              }}
            />
            <InlineButton
              label="[E] Editar"
              accent={COLORS.database}
              disabled={!selectedProfileIsSaved || busy}
              onPress={() => {
                if (selectedProfile) startEdit(selectedProfile)
              }}
            />
            <InlineButton
              label={
                deleteConfirmationId === selectedProfile?.id
                  ? "[X] Confirmar exclusão"
                  : "[X] Excluir"
              }
              accent={COLORS.danger}
              disabled={!selectedProfileIsSaved || busy}
              onPress={() => void removeSelected()}
            />
          </box>
          <ShortcutText
            content={notice || "[↑↓/J/K] selecionar · [Enter] conectar · [E] editar · [X] excluir"}
            style={{ fg: notice ? COLORS.warning : COLORS.muted, marginTop: 1 }}
          />
        </box>
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
              {DATABASE_DRIVER_OPTIONS.map((option, index) => (
                <Button
                  key={option.id}
                  id={`db-connection-driver-${option.id}`}
                  ref={(button) => {
                    driverRefs.current[index] = button
                  }}
                  onPress={() => chooseDriver(option.id)}
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
                <ConnectionInput
                  label="Senha"
                  id="db-connection-password"
                  value={password}
                  placeholder={editingConnectionId ? "vazia mantém a atual" : "opcional"}
                  inputRef={passwordRef}
                  onInput={setPassword}
                  onSubmit={() => void test()}
                  masked
                />
                <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
                  <InlineButton
                    id="db-connection-tls"
                    buttonRef={tlsRef}
                    label={`[Ctrl+T] ${draft.ssl ? "◆" : "◇"} TLS`}
                    accent={COLORS.database}
                    active={draft.ssl}
                    onPress={() => updateDraft({ ssl: !draft.ssl })}
                  />
                  <InlineButton
                    id="db-connection-keychain"
                    buttonRef={keychainRef}
                    label={`[Ctrl+K] ${persistPassword ? "◆" : "◇"} Keychain`}
                    accent={COLORS.database}
                    active={persistPassword}
                    onPress={() => setPersistPassword((current) => !current)}
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
                  disabled={draft.driver === "mcp-mysql"}
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
                label={
                  busy
                    ? "[Ctrl+S] Aguarde…"
                    : compact
                      ? "[Ctrl+S]"
                      : editingConnectionId
                        ? "[Ctrl+S] Atualizar e conectar"
                        : "[Ctrl+S] Salvar e conectar"
                }
                accent={COLORS.database}
                disabled={busy}
                onPress={() => void save()}
              />
            </box>
            {connections.length > 0 ? (
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
