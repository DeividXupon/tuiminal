import type { BoxRenderable } from "@opentui/core"
import { useRenderer } from "@opentui/react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { COLORS, panelBorder } from "@xupon/tuiminal-core/settings/theme"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import {
  COMMON_HTTP_HEADER_NAMES,
  createHttpKeyValueEntry,
  httpKeyValueTextInputOwnsKeyboard,
} from "../model/key-value"
import type { HttpKeyValue } from "../model/types"
import type { HttpWorkspaceConfig } from "../storage/config"
import type { HttpEnvironment } from "../storage/environments"
import { HttpKeyValueEditor } from "./HttpKeyValueEditor"

const WORKSPACE_TIMEOUTS = [undefined, 5_000, 10_000, 30_000, 60_000, 120_000] as const
const WORKSPACE_REDIRECTS = [undefined, true, false] as const

function configHeaders(config: HttpWorkspaceConfig): HttpKeyValue[] {
  return Object.entries(config.headers).map(([name, value], index) => ({
    id: `workspace-header-${index}`,
    enabled: true,
    name,
    value,
    sensitivity: "normal",
  }))
}

function withoutDefaultEnvironment(config: HttpWorkspaceConfig) {
  const { defaultEnvironment: _defaultEnvironment, ...rest } = config
  return rest
}

function timeoutLabel(value: number | undefined) {
  return value === undefined ? "padrão do request" : `${value / 1_000}s`
}

function redirectsLabel(value: boolean | undefined) {
  return value === undefined ? "padrão do request" : value ? "seguir" : "manual"
}

function toggleHistoryMetadata(config: HttpWorkspaceConfig): HttpWorkspaceConfig {
  return {
    ...config,
    history: {
      persistMetadata: !config.history.persistMetadata,
      persistBodies: config.history.persistMetadata ? false : config.history.persistBodies,
    },
  }
}

function toggleHistoryBodies(config: HttpWorkspaceConfig): HttpWorkspaceConfig {
  return {
    ...config,
    history: {
      persistMetadata: config.history.persistMetadata || !config.history.persistBodies,
      persistBodies: !config.history.persistBodies,
    },
  }
}

type WorkspaceSettingsCommand =
  | "add-header"
  | "close"
  | "cycle-environment"
  | "cycle-redirects"
  | "cycle-timeout"
  | "ignore"
  | "save"
  | "toggle-bodies"
  | "toggle-metadata"

function resolveWorkspaceSettingsCommand(
  event: {
    name: string
    ctrl?: boolean
    shift?: boolean
    option?: boolean
    meta?: boolean
  },
  focusedId: string,
): WorkspaceSettingsCommand {
  if (httpKeyValueTextInputOwnsKeyboard(focusedId)) {
    return event.ctrl && event.name === "s" ? "save" : "ignore"
  }
  if (event.name === "escape") return "close"
  if (event.ctrl && event.name === "s") return "save"
  if (event.name === "n" && !event.ctrl && !event.shift && !event.option && !event.meta) {
    return "add-header"
  }
  return (
    (
      {
        e: "cycle-environment",
        t: "cycle-timeout",
        r: "cycle-redirects",
        m: "toggle-metadata",
        b: "toggle-bodies",
      } as const
    )[event.name] ?? "ignore"
  )
}

export function HttpWorkspaceSettingsModal({
  config: initialConfig,
  sourceHash,
  sourceError,
  environments,
  terminalWidth,
  terminalHeight,
  onSave,
  onClose,
}: {
  config: HttpWorkspaceConfig
  sourceHash: string | null
  sourceError: string
  environments: HttpEnvironment[]
  terminalWidth: number
  terminalHeight: number
  onSave: (config: HttpWorkspaceConfig, expectedHash: string | null) => Promise<unknown>
  onClose: () => void
}) {
  const renderer = useRenderer()
  const modalRef = useRef<BoxRenderable | null>(null)
  const initialHash = useRef(sourceHash)
  const [config, setConfig] = useState(() => structuredClone(initialConfig))
  const [headers, setHeaders] = useState(() => configHeaders(initialConfig))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const width = Math.max(50, Math.min(100, terminalWidth - 4))
  const height = Math.max(16, Math.min(32, terminalHeight - 2))
  const initialSerialized = useRef(JSON.stringify({ config: initialConfig, headers }))
  const dirty = initialSerialized.current !== JSON.stringify({ config, headers })
  const environmentChoices = useMemo(
    () => [undefined, ...environments.map((environment) => environment.name)],
    [environments],
  )

  useEffect(() => {
    const timer = setTimeout(() => modalRef.current?.focus(), 0)
    return () => clearTimeout(timer)
  }, [])

  const cycleEnvironment = useCallback(() => {
    const current = environmentChoices.indexOf(config.defaultEnvironment)
    const next = environmentChoices[(current + 1) % environmentChoices.length]
    setConfig((value) =>
      next
        ? { ...value, defaultEnvironment: next }
        : (withoutDefaultEnvironment(value) as HttpWorkspaceConfig),
    )
  }, [config.defaultEnvironment, environmentChoices])

  const cycleTimeout = useCallback(() => {
    const current = WORKSPACE_TIMEOUTS.findIndex((value) => value === config.options.timeoutMs)
    const timeoutMs = WORKSPACE_TIMEOUTS[(current + 1) % WORKSPACE_TIMEOUTS.length]
    setConfig((value) => {
      const options = { ...value.options }
      if (timeoutMs === undefined) delete options.timeoutMs
      else options.timeoutMs = timeoutMs
      return { ...value, options }
    })
  }, [config.options.timeoutMs])

  const cycleRedirects = useCallback(() => {
    const current = WORKSPACE_REDIRECTS.indexOf(config.options.followRedirects)
    const followRedirects = WORKSPACE_REDIRECTS[(current + 1) % WORKSPACE_REDIRECTS.length]
    setConfig((value) => {
      const options = { ...value.options }
      if (followRedirects === undefined) delete options.followRedirects
      else options.followRedirects = followRedirects
      return { ...value, options }
    })
  }, [config.options.followRedirects])

  const save = useCallback(async () => {
    if (busy) return
    const enabledHeaders = headers.filter((header) => header.enabled && header.name.trim())
    const names = enabledHeaders.map((header) => header.name.trim().toLowerCase())
    if (new Set(names).size !== names.length) {
      setError("Headers de workspace não podem ter nomes duplicados.")
      return
    }
    setBusy(true)
    setError("")
    try {
      await onSave(
        {
          ...config,
          headers: Object.fromEntries(
            enabledHeaders.map((header) => [header.name.trim(), header.value]),
          ),
        },
        initialHash.current,
      )
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }, [busy, config, headers, onClose, onSave])

  const toggleMetadata = useCallback(() => setConfig(toggleHistoryMetadata), [])
  const toggleBodies = useCallback(() => setConfig(toggleHistoryBodies), [])

  const handleKey = useCallback(
    (event: {
      name: string
      ctrl?: boolean
      shift?: boolean
      option?: boolean
      meta?: boolean
      preventDefault(): void
      stopPropagation(): void
    }) => {
      const focused = renderer.currentFocusedRenderable?.id ?? ""
      switch (resolveWorkspaceSettingsCommand(event, focused)) {
        case "add-header":
          setHeaders((current) => [...current, createHttpKeyValueEntry("workspace-header")])
          break
        case "close":
          onClose()
          break
        case "save":
          void save()
          break
        case "cycle-environment":
          cycleEnvironment()
          break
        case "cycle-timeout":
          cycleTimeout()
          break
        case "cycle-redirects":
          cycleRedirects()
          break
        case "toggle-metadata":
          toggleMetadata()
          break
        case "toggle-bodies":
          toggleBodies()
          break
      }
    },
    [
      cycleEnvironment,
      cycleRedirects,
      cycleTimeout,
      onClose,
      renderer,
      save,
      toggleBodies,
      toggleMetadata,
    ],
  )

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: OpenTUI has no dialog role and this focusable box owns modal keyboard input.
    <box
      ref={modalRef}
      id="http-workspace-settings-modal"
      focusable
      onKeyDown={handleKey}
      style={{
        position: "absolute",
        left: Math.max(0, Math.floor((terminalWidth - width) / 2)),
        top: Math.max(0, Math.floor((terminalHeight - height) / 2)),
        width,
        height,
        zIndex: 126,
        ...panelBorder(COLORS.http),
        backgroundColor: COLORS.panelRaised,
        paddingLeft: 1,
        paddingRight: 1,
      }}
    >
      <box
        style={{ height: 1, flexShrink: 0, flexDirection: "row", justifyContent: "space-between" }}
      >
        <text content={translateUi("DEFAULTS DO WORKSPACE HTTP")} style={{ fg: COLORS.http }} />
        <text
          content={translateUi(dirty ? "● MODIFICADO" : "SALVO")}
          style={{ flexGrow: 1, fg: dirty ? COLORS.warning : COLORS.muted }}
        />
        <InlineButton label="[Esc] Fechar" accent={COLORS.http} onPress={onClose} />
      </box>
      <text
        content={translateUi("Aplicados quando o request não define um valor próprio.")}
        style={{ fg: COLORS.muted }}
      />
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
        <InlineButton
          id="http-workspace-default-environment"
          label={`[E] Ambiente padrão: ${config.defaultEnvironment ?? "nenhum"}`}
          accent={COLORS.http}
          onPress={cycleEnvironment}
        />
        <InlineButton
          id="http-workspace-default-timeout"
          label={`[T] Timeout: ${timeoutLabel(config.options.timeoutMs)}`}
          accent={COLORS.http}
          onPress={cycleTimeout}
        />
      </box>
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
        <InlineButton
          id="http-workspace-default-redirects"
          label={`[R] Redirects: ${redirectsLabel(config.options.followRedirects)}`}
          accent={COLORS.http}
          onPress={cycleRedirects}
        />
        <InlineButton
          id="http-workspace-history-metadata"
          label={`[M] ${config.history.persistMetadata ? "◆" : "◇"} Histórico persistente`}
          accent={COLORS.http}
          active={config.history.persistMetadata}
          onPress={toggleMetadata}
        />
      </box>
      <InlineButton
        id="http-workspace-history-bodies"
        label={`[B] ${config.history.persistBodies ? "◆" : "◇"} Persistir bodies`}
        accent={config.history.persistBodies ? COLORS.warning : COLORS.http}
        active={config.history.persistBodies}
        onPress={toggleBodies}
      />
      <text
        content={translateUi(
          "Com segredos conhecidos, bodies ficam só na sessão. Outros bodies podem conter dados privados.",
        )}
        style={{ fg: config.history.persistBodies ? COLORS.warning : COLORS.muted }}
      />
      <HttpKeyValueEditor
        idPrefix="workspace"
        title="HEADERS NÃO SECRETOS"
        entries={headers}
        onChange={setHeaders}
        detectSensitiveNames
        nameSuggestions={COMMON_HTTP_HEADER_NAMES}
      />
      {sourceError ? (
        <text content={translateUi(sourceError)} style={{ fg: COLORS.warning }} />
      ) : null}
      {error ? <text content={translateUi(error)} style={{ fg: COLORS.danger }} /> : null}
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row", justifyContent: "flex-end" }}>
        <InlineButton
          id="http-workspace-settings-save"
          label={busy ? "SALVANDO…" : "[Ctrl+S] Salvar defaults"}
          accent={COLORS.http}
          disabled={busy || !dirty}
          onPress={() => void save()}
        />
      </box>
    </box>
  )
}
