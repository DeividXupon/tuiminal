import { useHttpCollectionSettingsKeyboard } from "../hooks/use-http-collection-settings-keyboard"
import { useEffect, useMemo } from "react"
import { useRenderer } from "@opentui/react"
import { COLORS, focusedPanelBorder } from "@xupon/tuiminal-core/settings/theme"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { DirectionalButton } from "@xupon/tuiminal-core/ui/DirectionalButton"
import { useWorkspaceRepaint } from "@xupon/tuiminal-core/ui/workspace-repaint"
import type { HttpCollectionSettings } from "../hooks/use-http-collection-settings"
import type { HttpCollectionSettingsDocument } from "../model/collection-settings"
import { createScratchRequest } from "../model/workspace"
import { HttpAuthEditor } from "./HttpAuthEditor"
import { HttpRequestScripts } from "./HttpRequestScripts"
import { HttpCollectionVariables } from "./HttpCollectionVariables"

export function HttpCollectionSettingsPane({
  settings,
  document,
  active,
  position,
  onFocus,
  onBack,
}: {
  settings: HttpCollectionSettings
  document: HttpCollectionSettingsDocument
  active: boolean
  position: { left: number; top: number; width: number; height: number }
  onFocus: () => void
  onBack: () => void
}) {
  const renderer = useRenderer()
  const folder = Boolean(document.target.folderId)
  const tabs = folder
    ? (["authorization", "scripts"] as const)
    : (["authorization", "scripts", "variables"] as const)
  const labels = { authorization: "Authorization", scripts: "Scripts", variables: "Variáveis" }
  const unavailable = document.loading || !document.baseline
  const focus = () => {
    onFocus()
    renderer.root.findDescendantById("http-collection-settings-pane")?.focus()
  }
  const select = (tab: HttpCollectionSettingsDocument["tab"]) => {
    focus()
    settings.selectTab(document.id, tab)
  }
  const cycle = (direction: number) =>
    select(
      tabs[
        (tabs.findIndex((tab) => tab === document.tab) + direction + tabs.length) % tabs.length
      ]!,
    )
  useWorkspaceRepaint(`collection-settings:${document.id}:${document.tab}:${Boolean(unavailable)}`)
  useEffect(() => {
    if (!active) return
    const timer = setTimeout(
      () => renderer.root.findDescendantById("http-collection-settings-pane")?.focus(),
      0,
    )
    return () => clearTimeout(timer)
  }, [active, renderer])
  useHttpCollectionSettingsKeyboard({ active, document, settings, focus, cycle, onBack })
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: Native terminal pane focus follows mouse interaction.
    <box
      id="http-collection-settings-pane"
      focusable
      onMouseDown={onFocus}
      style={{
        position: "absolute",
        ...position,
        ...focusedPanelBorder(active, COLORS.http),
        backgroundColor: COLORS.panel,
        paddingLeft: 1,
        paddingRight: 1,
        overflow: "hidden",
      }}
    >
      <box flexDirection="row" height={1} flexShrink={0}>
        <text content={document.target.name} fg={COLORS.http} flexGrow={1} />
        <text content={translateUi("Configurações")} fg={COLORS.muted} />
      </box>
      <box flexDirection="row" flexWrap="wrap" flexShrink={0}>
        {active ? (
          <DirectionalButton direction={-1} accent={COLORS.http} onPress={() => cycle(-1)} />
        ) : null}
        {tabs.map((tab) => (
          <InlineButton
            key={tab}
            id={`http-collection-settings-tab-${tab}`}
            label={labels[tab]}
            accent={COLORS.http}
            active={document.tab === tab}
            onPress={() => select(tab)}
          />
        ))}
        {active ? (
          <DirectionalButton direction={1} accent={COLORS.http} onPress={() => cycle(1)} />
        ) : null}
        <box flexGrow={1} />
        <InlineButton
          id="http-collection-settings-save"
          label={document.busy ? "Salvando…" : "[Ctrl+S] Salvar"}
          disabled={Boolean(unavailable || document.busy)}
          accent={COLORS.http}
          onPress={() => void settings.save(document.id)}
        />
      </box>
      {document.loading ? <text content={translateUi("Carregando…")} fg={COLORS.muted} /> : null}
      {document.error ? (
        <text
          id="http-collection-settings-error"
          content={translateUi(document.error)}
          fg={COLORS.danger}
          flexShrink={0}
        />
      ) : null}
      {!document.loading && !document.baseline ? (
        <InlineButton
          id="http-collection-settings-retry"
          label="Tentar novamente"
          accent={COLORS.http}
          onPress={() => void settings.load(document.id)}
        />
      ) : null}
      {!unavailable ? (
        <box flexGrow={1} minHeight={0} position="relative">
          <HttpCollectionSettingsContent
            settings={settings}
            document={document}
            active={active}
            onFocus={onFocus}
          />
        </box>
      ) : null}
    </box>
  )
}

function HttpCollectionSettingsContent({
  settings,
  document,
  active,
  onFocus,
}: {
  settings: HttpCollectionSettings
  document: HttpCollectionSettingsDocument
  active: boolean
  onFocus: () => void
}) {
  const folder = Boolean(document.target.folderId)
  const request = useMemo(
    () => ({ ...createScratchRequest(document.id), scripts: document.scripts }),
    [document.id, document.scripts],
  )
  return (
    <>
      {document.tab === "authorization" ? (
        <>
          {document.auth.kind === "unsupported" ? (
            <text
              content={`${translateUi("Autenticação não suportada.")} ${document.auth.type}`}
              fg={COLORS.warning}
            />
          ) : null}
          <HttpAuthEditor
            requestId={document.id}
            auth={
              document.auth.kind === "inherit" || document.auth.kind === "unsupported"
                ? { kind: "none" }
                : document.auth
            }
            inherited={document.auth.kind === "inherit"}
            unsupported={document.auth.kind === "unsupported"}
            onInherit={
              folder ? () => settings.edit(document.id, { auth: { kind: "inherit" } }) : undefined
            }
            focused={active}
            onFocus={onFocus}
            onChange={(auth) => settings.edit(document.id, { auth })}
          />
        </>
      ) : document.tab === "scripts" ? (
        <HttpRequestScripts
          request={request}
          active={active}
          visible
          onFocus={onFocus}
          onChange={(scripts) => settings.edit(document.id, { scripts })}
        />
      ) : (
        <HttpCollectionVariables
          document={document}
          active={active}
          onFocus={onFocus}
          onChange={(variables) => settings.edit(document.id, { variables })}
        />
      )}
    </>
  )
}
