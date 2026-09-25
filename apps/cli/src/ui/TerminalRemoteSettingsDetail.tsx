import type { BoxRenderable, InputRenderable, ScrollBoxRenderable } from "@opentui/core"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { focusedRenderableId } from "@xupon/tuiminal-core/keyboard/scope"
import {
  COLORS,
  type TerminalRemoteCodexProfile,
  terminalRemoteProfileValidationError,
} from "@xupon/tuiminal-core/settings/theme"
import { useCallback, useEffect, useRef, useState } from "react"
import { ConfigurationDetailHeader } from "./ConfigurationDetailHeader"
import { TerminalRemoteActionBar, type TerminalRemoteStatus } from "./TerminalRemoteActionBar"
import { TerminalRemoteProfileForm } from "./TerminalRemoteProfileForm"
import { TerminalRemoteProfileList } from "./TerminalRemoteProfileList"
import { TerminalRemoteReadinessPanel } from "./TerminalRemoteReadinessPanel"
import { TerminalRemoteSettingsPreview } from "./TerminalRemoteSettingsPreview"
import {
  createDraft,
  FIELD_IDS,
  type FieldId,
  profileFromDraft,
  type RemoteProfileDraft,
  remoteFieldHighlight,
  remoteFormKeyAction,
  resultMessage,
  runRemoteFormKeyAction,
  type TerminalRemoteSettingsDetailProps,
} from "./terminal-remote-settings"

export function TerminalRemoteSettingsDetail({
  profiles,
  activeProfileId,
  notice,
  compact,
  contentWidth,
  onBack,
  onActiveProfileChange,
  onChange,
  onTest,
  onCheckReadiness,
  onConfigureServer,
}: TerminalRemoteSettingsDetailProps) {
  const renderer = useRenderer()
  const terminal = useTerminalDimensions()
  const dense = terminal.height <= 20
  const [selectedId, setSelectedId] = useState(profiles[0]?.id ?? "")
  const [selectedProfileCursor, setSelectedProfileCursor] = useState<string | null>(
    profiles[0]?.id ?? null,
  )
  const [selectedField, setSelectedField] = useState<FieldId>("name")
  const [draft, setDraft] = useState<RemoteProfileDraft>(() => createDraft(profiles[0]))
  const [status, setStatus] = useState<TerminalRemoteStatus>(null)
  const [testing, setTesting] = useState(false)
  const [checkingReadiness, setCheckingReadiness] = useState(false)
  const [readiness, setReadiness] = useState<Awaited<ReturnType<typeof onCheckReadiness>> | null>(
    null,
  )
  const [editingField, setEditingField] = useState<FieldId | null>(null)
  const [formFocused, setFormFocused] = useState(
    () =>
      focusedRenderableId(renderer.currentFocusedRenderable)?.startsWith(
        "configuration-terminal-remote-",
      ) ?? false,
  )
  const view = useRef<BoxRenderable | null>(null)
  const inputs = useRef(new Map<FieldId, InputRenderable>())
  const profileScroll = useRef<ScrollBoxRenderable | null>(null)
  const fieldScroll = useRef<ScrollBoxRenderable | null>(null)
  const operationController = useRef<AbortController | null>(null)
  const formOwnedFocus = useRef(formFocused)
  const enteringForm = useRef(false)
  const fieldHighlight = remoteFieldHighlight()

  useEffect(() => {
    const selected = profiles.find((profile) => profile.id === selectedId)
    if (selected) setDraft(createDraft(selected))
  }, [profiles, selectedId])
  useEffect(() => {
    fieldScroll.current?.scrollChildIntoView(`configuration-terminal-remote-field-${selectedField}`)
  }, [selectedField])
  useEffect(() => () => operationController.current?.abort(), [])
  useEffect(() => {
    const update = () => {
      const focusedId = focusedRenderableId(renderer.currentFocusedRenderable)
      const ownsForm = focusedId?.startsWith("configuration-terminal-remote-") ?? false
      if (focusedId === "configuration-terminal-remote-view" && !formOwnedFocus.current)
        enteringForm.current = true
      formOwnedFocus.current = ownsForm
      setFormFocused(ownsForm)
      setEditingField(
        FIELD_IDS.find((field) => focusedId === `configuration-terminal-remote-${field}`) ?? null,
      )
    }
    update()
    renderer.on("focused_renderable", update)
    return () => {
      renderer.off("focused_renderable", update)
    }
  }, [renderer])

  const selectField = useCallback((field: FieldId) => {
    setSelectedProfileCursor(null)
    setSelectedField(field)
  }, [])
  const focusField = useCallback(
    (field: FieldId) => {
      selectField(field)
      inputs.current.get(field)?.focus()
    },
    [selectField],
  )
  const focusView = useCallback(() => {
    for (const input of inputs.current.values()) input.blur()
    view.current?.focus()
  }, [])
  const cancelOperation = useCallback(() => {
    operationController.current?.abort()
    operationController.current = null
    setTesting(false)
    setCheckingReadiness(false)
  }, [])
  const leaveForm = useCallback(() => {
    cancelOperation()
    onBack()
    const navigationTarget =
      renderer.root.findDescendantById("configuration-section-remoteConnection") ??
      renderer.root.findDescendantById("configuration-category-open")
    navigationTarget?.focus()
  }, [cancelOperation, onBack, renderer])
  const updateField = useCallback(
    (field: FieldId, value: string) => {
      cancelOperation()
      setDraft((current) => ({ ...current, [field]: value }))
      setStatus(null)
      setReadiness(null)
    },
    [cancelOperation],
  )
  const save = useCallback(() => {
    const profile = profileFromDraft(draft)
    const invalid = terminalRemoteProfileValidationError(profile)
    if (invalid) {
      setStatus({
        message: translateUi("Preencha todos os campos com valores válidos."),
        ok: false,
      })
      focusField(invalid)
      return
    }
    onChange([...profiles.filter((item) => item.id !== profile.id), profile])
    setSelectedId(profile.id)
    setStatus({ message: translateUi("Perfil remoto salvo."), ok: true })
  }, [draft, focusField, onChange, profiles])
  const test = useCallback(async () => {
    operationController.current?.abort()
    focusView()
    const controller = new AbortController()
    operationController.current = controller
    setTesting(true)
    setStatus({ message: translateUi("Testando conexão SSH…") })
    try {
      const result = await onTest(profileFromDraft(draft), controller.signal)
      if (controller.signal.aborted) return
      setStatus({ message: translateUi(resultMessage(result)), ok: result.ok })
    } catch {
      if (!controller.signal.aborted)
        setStatus({ message: translateUi("O teste de conexão SSH falhou."), ok: false })
    } finally {
      if (operationController.current === controller) {
        operationController.current = null
        setTesting(false)
      }
    }
  }, [draft, focusView, onTest])
  const verifyReadiness = useCallback(async () => {
    const profile = profileFromDraft(draft)
    const invalid = terminalRemoteProfileValidationError(profile)
    if (invalid) {
      setStatus({
        message: translateUi("Preencha todos os campos com valores válidos."),
        ok: false,
      })
      focusField(invalid)
      return
    }
    operationController.current?.abort()
    focusView()
    const controller = new AbortController()
    operationController.current = controller
    setCheckingReadiness(true)
    setStatus({ message: translateUi("Verificando servidor…") })
    try {
      const report = await onCheckReadiness(profile, controller.signal)
      if (controller.signal.aborted) return
      setReadiness(report)
      const ready = report.githubSsh.ready && report.codex.ready
      setStatus({
        message: translateUi(
          ready ? "Servidor pronto para o agente remoto." : "O servidor precisa ser configurado.",
        ),
        ok: ready,
      })
    } catch {
      if (!controller.signal.aborted)
        setStatus({ message: translateUi("Não foi possível verificar o servidor."), ok: false })
    } finally {
      if (operationController.current === controller) {
        operationController.current = null
        setCheckingReadiness(false)
      }
    }
  }, [draft, focusField, focusView, onCheckReadiness])
  const configureServer = useCallback(() => {
    const profile = profileFromDraft(draft)
    const invalid = terminalRemoteProfileValidationError(profile)
    if (invalid) {
      setStatus({
        message: translateUi("Preencha todos os campos com valores válidos."),
        ok: false,
      })
      focusField(invalid)
      return
    }
    cancelOperation()
    onConfigureServer(profile)
  }, [cancelOperation, draft, focusField, onConfigureServer])
  const createNew = useCallback(() => {
    cancelOperation()
    setSelectedId("")
    setDraft(createDraft())
    setStatus(null)
    setReadiness(null)
    setTimeout(() => focusField("name"), 0)
  }, [cancelOperation, focusField])
  const selectProfile = useCallback(
    (profile: TerminalRemoteCodexProfile) => {
      cancelOperation()
      setSelectedId(profile.id)
      setDraft(createDraft(profile))
      setStatus(null)
      setReadiness(null)
      selectField("name")
      focusView()
    },
    [cancelOperation, focusView, selectField],
  )
  const moveField = useCallback(
    (direction: -1 | 1) => {
      const items = [...profiles.map((profile) => profile.id), ...FIELD_IDS]
      const current = items.indexOf(selectedProfileCursor ?? selectedField)
      const next = items[(current + direction + items.length) % items.length]
      const profile = profiles.find((candidate) => candidate.id === next)
      if (profile) {
        setSelectedProfileCursor(profile.id)
        profileScroll.current?.scrollChildIntoView(
          `configuration-terminal-remote-profile-${profile.id}`,
        )
      } else if (next) selectField(next as FieldId)
    },
    [profiles, selectField, selectedField, selectedProfileCursor],
  )
  const activateSelection = useCallback(() => {
    const profile = profiles.find((candidate) => candidate.id === selectedProfileCursor)
    if (profile) selectProfile(profile)
    else focusField(selectedField)
  }, [focusField, profiles, selectProfile, selectedField, selectedProfileCursor])
  const activateProfile = useCallback(() => {
    const profileId = selectedProfileCursor ?? selectedId
    if (!profiles.some((profile) => profile.id === profileId)) return
    onActiveProfileChange(profileId)
    setStatus({ message: translateUi("Perfil remoto ativo."), ok: true })
  }, [onActiveProfileChange, profiles, selectedId, selectedProfileCursor])
  const registerInput = useCallback((field: FieldId, input: InputRenderable | null) => {
    if (input) inputs.current.set(field, input)
    else inputs.current.delete(field)
  }, [])

  useKeyboard((key) => {
    if (key.defaultPrevented || !formFocused) return
    if (enteringForm.current) {
      enteringForm.current = false
      if (key.name === "enter" || key.name === "return") return
    }
    const action = remoteFormKeyAction(
      key,
      [...inputs.current.values()].some((input) => input.focused),
      testing || checkingReadiness,
    )
    if (!action) return
    key.preventDefault()
    key.stopPropagation()
    runRemoteFormKeyAction(action, {
      activate: activateProfile,
      blur: focusView,
      close: leaveForm,
      edit: activateSelection,
      previous: () => moveField(-1),
      next: () => moveField(1),
      new: createNew,
      save,
      test: () => void test(),
      verify: () => void verifyReadiness(),
      configure: configureServer,
    })
  })

  return (
    <box
      ref={view}
      id="configuration-terminal-remote-view"
      focusable
      style={{ width: "100%", height: "100%", flexGrow: 1 }}
    >
      {formFocused ? (
        <ConfigurationDetailHeader
          section="remoteConnection"
          notice={notice}
          hint="[J/K/↑/↓] navegar · [Enter] editar · [Esc] desfocar"
          compact={compact}
          contentWidth={contentWidth}
        />
      ) : (
        <TerminalRemoteSettingsPreview
          profiles={profiles}
          activeProfileId={activeProfileId}
          notice={notice}
          compact={compact}
          contentWidth={contentWidth}
        />
      )}
      {formFocused ? (
        <box
          id="configuration-terminal-remote-form"
          style={{ width: "100%", flexGrow: 1, minHeight: 1 }}
        >
          <TerminalRemoteProfileList
            profiles={profiles}
            activeProfileId={activeProfileId}
            loadedProfileId={selectedId}
            cursorProfileId={selectedProfileCursor}
            contentWidth={contentWidth}
            dense={dense}
            highlight={fieldHighlight}
            scrollRef={profileScroll}
            onSelect={selectProfile}
          />
          {dense ? null : (
            <text
              id="configuration-terminal-remote-loaded"
              content={truncateDisplay(
                selectedId
                  ? `${translateUi("EDITANDO")}: ${draft.name}`
                  : translateUi("NOVO PERFIL"),
                contentWidth,
              )}
              style={{ height: 1, flexShrink: 0, fg: COLORS.terminal }}
            />
          )}
          <TerminalRemoteProfileForm
            draft={draft}
            compact={compact}
            dense={dense}
            selectedField={selectedField}
            editingField={editingField}
            highlight={fieldHighlight}
            scrollRef={fieldScroll}
            registerInput={registerInput}
            onSelectField={focusField}
            onChange={updateField}
            onSubmitLast={save}
          />
          <TerminalRemoteReadinessPanel
            report={readiness}
            checking={checkingReadiness}
            dense={dense}
          />
          <TerminalRemoteActionBar
            contentWidth={contentWidth}
            dense={dense}
            status={status}
            testing={testing}
            checkingReadiness={checkingReadiness}
            canActivate={Boolean(selectedProfileCursor || selectedId)}
            canConfigure={!terminalRemoteProfileValidationError(profileFromDraft(draft))}
            onBack={leaveForm}
            onNew={createNew}
            onSave={save}
            onActivate={activateProfile}
            onTest={() => void test()}
            onVerify={() => void verifyReadiness()}
            onConfigure={configureServer}
          />
        </box>
      ) : null}
    </box>
  )
}
