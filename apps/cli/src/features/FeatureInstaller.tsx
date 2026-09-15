import { FeatureChoice } from "./FeatureChoice"
import { FeaturePreview } from "./FeaturePreview"
import { FeatureUninstallModal } from "./FeatureUninstallModal"
import type { ScrollBoxRenderable } from "@opentui/core"
import { useKeyboard, useTerminalDimensions } from "@opentui/react"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { COLORS, LAYOUT } from "@xupon/tuiminal-core/settings/theme"
import { BRAND_COLOR } from "@xupon/tuiminal-core/ui/brand"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { ShortcutText } from "@xupon/tuiminal-core/ui/ShortcutText"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { FEATURE_IDS, type FeatureId } from "./model"
import type { FeatureState } from "./controller"

export function FeatureInstaller({
  onlyTool = null,
  state,
  selected,
  blocked,
  onInstall,
  onUninstall,
  onOpen,
  onCancel,
  onClose,
  onSettings,
  previewStep,
  modalOpenRef,
}: {
  onlyTool?: FeatureId | null
  state: FeatureState
  selected: FeatureId | null
  blocked: boolean
  onInstall: (ids: FeatureId[]) => void
  onUninstall: (id: FeatureId) => void
  onOpen: (id: FeatureId) => void
  onCancel: () => void
  onClose: () => void
  onSettings: () => void
  previewStep?: number
  modalOpenRef?: { current: boolean }
}) {
  const terminal = useTerminalDimensions()
  const narrow = terminal.width < 76
  const short = terminal.height < 22
  const compactPreview = terminal.width < 100 || short
  const list = useRef<ScrollBoxRenderable | null>(null)
  const revealSelection = useRef(true)
  const selectionOrigin = useRef<"keyboard" | "mouse">("keyboard")
  const [index, setIndex] = useState(selected ? FEATURE_IDS.indexOf(selected) : 0)
  const [checked, setChecked] = useState<FeatureId[]>([])
  const [removal, setRemoval] = useState<FeatureId | null>(null)
  useEffect(
    () => () => {
      if (modalOpenRef) modalOpenRef.current = false
    },
    [modalOpenRef],
  )
  const closeRemoval = () => {
    if (modalOpenRef) modalOpenRef.current = false
    setRemoval(null)
  }
  const requestRemoval = (id: FeatureId) => {
    if (!blocked && !state.busy && state.installed.includes(id)) {
      if (modalOpenRef) modalOpenRef.current = true
      setRemoval(id)
    }
  }
  useEffect(() => {
    if (selected) {
      revealSelection.current = true
      selectionOrigin.current = "keyboard"
      setIndex(FEATURE_IDS.indexOf(selected))
    }
  }, [selected])
  const current = FEATURE_IDS[index] ?? "database"
  // Reveal the committed selection, never the previous row during React reconciliation.
  // biome-ignore lint/correctness/useExhaustiveDependencies: A new selected row needs a native frame after commit.
  useLayoutEffect(() => {
    if (selectionOrigin.current === "mouse") return
    revealSelection.current = true
    list.current?.requestRender()
  }, [current])
  const revealCurrentRow = () => {
    if (!revealSelection.current) return
    revealSelection.current = false
    const scroll = list.current
    const row = scroll?.content.findDescendantById(`feature-option-${current}`)
    if (!scroll || !row) return
    // Measure after native layout; nearest-edge scrolling omits equal-height rows.
    if (row.height >= scroll.viewport.height) scroll.scrollBy(row.y - scroll.viewport.y)
    else scroll.scrollChildIntoView(row.id)
  }
  const toggle = (id: FeatureId) => {
    if (state.installed.includes(id) || state.busy) return
    setChecked((items) =>
      items.includes(id) ? items.filter((item) => item !== id) : [...items, id],
    )
  }
  const activate = (id: FeatureId) => {
    if (blocked || state.busy) return
    if (state.installed.includes(id)) {
      if (!onlyTool || onlyTool === id) onOpen(id)
    } else onInstall([id])
  }
  useKeyboard((key) => {
    if (blocked || removal || key.defaultPrevented) return
    if (key.ctrl || key.meta || key.option) return
    switch (key.name) {
      case "up":
      case "k":
        selectionOrigin.current = "keyboard"
        setIndex((value) => (value + 4) % 5)
        break
      case "down":
      case "j":
      case "tab":
        selectionOrigin.current = "keyboard"
        setIndex((value) => (value + 1) % 5)
        break
      case "enter":
      case "return":
        activate(current)
        break
      case "space":
        toggle(current)
        break
      case "i":
        if (!state.busy) onInstall(checked.length ? checked : [current])
        break
      case "d":
        if (!key.shift && !key.repeated) requestRemoval(current)
        break
      case "c":
        onCancel()
        break
      case "escape":
        onClose()
        break
      default:
        return
    }
    key.preventDefault()
    key.stopPropagation()
  })
  const progress = state.progress
    ? Math.floor((state.progress.received / state.progress.total) * 100)
    : null
  return (
    <box
      id="feature-installer"
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: "100%",
        height: "100%",
        backgroundColor: COLORS.canvas,
        padding: LAYOUT.compact || short ? 1 : 2,
      }}
    >
      <box
        style={{ flexDirection: "row", justifyContent: "space-between", height: 1, flexShrink: 0 }}
      >
        <text content="◆ TUIMINAL" style={{ fg: BRAND_COLOR }} />
        <InlineButton
          label="[,] Config"
          onPress={onSettings}
          disabled={blocked || Boolean(removal)}
          accent={COLORS.focus}
        />
      </box>
      <text
        content={translateUi("Instalar ferramentas oficiais")}
        style={{ fg: COLORS.text, marginTop: 1, flexShrink: 0 }}
      />
      {short ? null : (
        <text
          content={translateUi(
            "Escolha suas ferramentas. Instale outras depois nas configurações.",
          )}
          style={{ fg: COLORS.muted, marginBottom: 1, flexShrink: 0 }}
        />
      )}
      <box
        style={{
          flexDirection: compactPreview ? "column" : "row",
          flexGrow: 1,
          minHeight: 0,
          gap: 1,
        }}
      >
        <scrollbox
          ref={list}
          onSizeChange={() => {
            revealSelection.current = true
          }}
          renderAfter={revealCurrentRow}
          style={{ flexGrow: 1, minHeight: 0, minWidth: 0 }}
          viewportCulling={false}
        >
          {FEATURE_IDS.map((id, row) => (
            <FeatureChoice
              key={id}
              id={id}
              canOpen={!onlyTool || onlyTool === id}
              installed={state.installed.includes(id)}
              busy={state.busy === id}
              focused={row === index}
              blocked={blocked || Boolean(removal)}
              checked={checked.includes(id)}
              disabled={Boolean(state.busy)}
              progress={progress}
              removing={state.removing === id}
              onReflow={() => {
                if (row === index) revealSelection.current = true
              }}
              onSelect={() => {
                selectionOrigin.current = "mouse"
                revealSelection.current = false
                setIndex(row)
              }}
              onToggle={() => toggle(id)}
              onActivate={() => activate(id)}
              onUninstall={() => requestRemoval(id)}
            />
          ))}
        </scrollbox>
        <FeaturePreview
          id={current}
          compact={compactPreview}
          paused={blocked || Boolean(removal)}
          step={previewStep}
        />
      </box>
      {state.error ? (
        <text content={translateUi(state.error)} style={{ fg: COLORS.danger, flexShrink: 0 }} />
      ) : null}
      <box
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          flexShrink: 0,
          marginTop: 1,
        }}
      >
        <InlineButton
          label={state.progress ? "[C] Cancelar download" : "[I] Instalar selecionadas"}
          accent={BRAND_COLOR}
          disabled={blocked || Boolean(removal) || Boolean(state.busy && !state.progress)}
          onPress={() =>
            state.busy ? onCancel() : onInstall(checked.length ? checked : [current])
          }
        />
        <InlineButton
          label={state.installed.length ? "[Esc] Voltar" : "[Esc] Sair"}
          accent={COLORS.muted}
          disabled={blocked || Boolean(removal)}
          onPress={onClose}
        />
      </box>
      <ShortcutText
        content={
          narrow
            ? "[↑/↓/J/K]  [Space]  [Enter]"
            : "[↑/↓/J/K] Navegar  [Space] Selecionar  [Enter] Instalar / abrir"
        }
        style={{ fg: COLORS.muted, flexShrink: 0 }}
      />
      {removal ? (
        <FeatureUninstallModal
          id={removal}
          onClose={closeRemoval}
          onConfirm={() => {
            closeRemoval()
            setChecked((items) => items.filter((id) => id !== removal))
            onUninstall(removal)
          }}
        />
      ) : null}
    </box>
  )
}
