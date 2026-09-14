import {
  COLORS,
  focusedPanelBorder,
  LAYOUT,
  panelBorder,
} from "@xupon/tuiminal-core/settings/theme"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { DirectionalButton } from "@xupon/tuiminal-core/ui/DirectionalButton"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { PlasmaLoadingOverlay } from "@xupon/tuiminal-core/ui/PlasmaLoadingOverlay"
import { ShortcutText } from "@xupon/tuiminal-core/ui/ShortcutText"
import type { InboxNotification, InboxSection } from "../../model/inbox/types"
import { InboxList } from "./InboxList"
import { InboxPreview } from "./InboxPreview"
import {
  GitHubAuthenticationPanel,
  GitHubCliRequirementPanel,
} from "../shared/GitHubCliRequirementPanel"
import type { InboxDashboardState } from "./useInboxDashboard"

export function inboxDashboardError(state: InboxDashboardState) {
  if (state.status === "error" || state.status === "config-error") return state.error
  if (state.status !== "requirements") return ""
  return state.capabilities.reason === "missing"
    ? "GitHub CLI não encontrado. Instale gh 2.40.0 ou mais recente."
    : "GitHub CLI desatualizado. Instale gh 2.40.0 ou mais recente."
}

type ReadyViewProps = {
  items: readonly InboxNotification[]
  selected: InboxNotification | null
  selectedIndex: number
  focus: "list" | "preview"
  wide: boolean
  listWidth: number
  savedIds: ReadonlySet<string>
  loadingMore: boolean
  loadingFrame: string
  onSelect: (index: number) => void
  onFocusList: () => void
  onOpen: () => void
  onRead: () => void
  onDone: () => void
  onSave: () => void
  onUnsubscribe: () => void
}

function InboxReadyView(props: ReadyViewProps) {
  return (
    <box style={{ flexGrow: 1, flexDirection: props.wide ? "row" : "column", gap: LAYOUT.gap }}>
      <box
        style={{
          ...focusedPanelBorder(props.focus === "list", COLORS.git),
          width: props.wide ? props.listWidth : "100%",
          flexGrow: props.wide ? 0 : 1,
          backgroundColor: COLORS.panel,
          paddingLeft: 1,
          paddingRight: 1,
        }}
      >
        <InboxList
          items={props.items}
          selectedIndex={props.selectedIndex}
          focused={props.focus === "list"}
          width={props.listWidth}
          savedIds={props.savedIds}
          loadingMore={props.loadingMore}
          loadingFrame={props.loadingFrame}
          onSelect={(index) => {
            props.onSelect(index)
            props.onFocusList()
          }}
        />
      </box>
      {props.wide || props.focus === "preview" ? (
        <box
          style={{
            ...focusedPanelBorder(props.focus === "preview", COLORS.git),
            flexGrow: 1,
            backgroundColor: COLORS.panel,
            paddingLeft: 1,
            paddingRight: 1,
          }}
        >
          <InboxPreview
            item={props.selected}
            saved={Boolean(props.selected && props.savedIds.has(props.selected.id))}
            onOpen={props.onOpen}
            onRead={props.onRead}
            onDone={props.onDone}
            onSave={props.onSave}
            onUnsubscribe={props.onUnsubscribe}
          />
        </box>
      ) : null}
    </box>
  )
}

function InboxStatePanel({
  active,
  state,
  onRetry,
}: {
  active: boolean
  state: InboxDashboardState
  onRetry: () => void
}) {
  if (state.status === "requirements") {
    return (
      <GitHubCliRequirementPanel
        active={active}
        capabilities={state.capabilities}
        onRetry={onRetry}
      />
    )
  }
  if (state.status === "authentication") {
    return <GitHubAuthenticationPanel active={active} host={state.host} onRetry={onRetry} />
  }
  const loading = state.status === "loading" || state.status === "idle"
  return (
    <box
      style={{
        ...panelBorder(),
        flexGrow: 1,
        backgroundColor: COLORS.panel,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <text
        content={translateUi(loading ? "CARREGANDO GITHUB…" : inboxDashboardError(state))}
        style={{ fg: loading ? COLORS.git : COLORS.danger }}
      />
      <InlineButton label="[R] Tentar novamente" accent={COLORS.git} onPress={onRetry} />
    </box>
  )
}

export function InboxDashboardView({
  active,
  state,
  refreshing,
  sections,
  sectionCounts,
  sectionIndex,
  onSelectSection,
  readyProps,
  onRetry,
}: {
  active: boolean
  state: InboxDashboardState
  refreshing: boolean
  sections: readonly InboxSection[]
  sectionCounts: readonly number[]
  sectionIndex: number
  onSelectSection: (index: number) => void
  readyProps: ReadyViewProps
  onRetry: () => void
}) {
  const ready = state.status === "ready" || state.status === "demo"
  return (
    <box
      style={{
        position: "relative",
        flexGrow: 1,
        backgroundColor: COLORS.canvas,
        padding: LAYOUT.outerPadding,
        gap: LAYOUT.gap,
      }}
    >
      <box
        style={{
          ...panelBorder(),
          height: 1,
          flexShrink: 0,
          flexDirection: "row",
          justifyContent: "space-between",
          paddingLeft: 1,
          paddingRight: 1,
          backgroundColor: COLORS.panel,
        }}
      >
        <text
          content={translateUi(state.status === "demo" ? "INBOX · DEMO" : "INBOX DO GITHUB")}
          style={{ fg: COLORS.git }}
        />
        {refreshing ? (
          <text
            content={translateUi("ATUALIZANDO TODAS AS NOTIFICAÇÕES…")}
            style={{ fg: COLORS.git }}
          />
        ) : null}
      </box>
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
        <DirectionalButton
          direction={-1}
          accent={COLORS.git}
          onPress={() => onSelectSection((sectionIndex - 1 + sections.length) % sections.length)}
        />
        {sections.map((section, index) => (
          <InlineButton
            key={section.id}
            id={`git-inbox-section-${index}`}
            label={`${section.title} ${sectionCounts[index] ?? 0}`}
            accent={COLORS.git}
            active={index === sectionIndex}
            onPress={() => onSelectSection(index)}
          />
        ))}
        <DirectionalButton
          direction={1}
          accent={COLORS.git}
          onPress={() => onSelectSection((sectionIndex + 1) % sections.length)}
        />
      </box>
      {ready ? (
        <InboxReadyView {...readyProps} />
      ) : (
        <InboxStatePanel active={active} state={state} onRetry={onRetry} />
      )}
      <PlasmaLoadingOverlay
        active={state.status === "loading" || state.status === "idle"}
        label="CARREGANDO GITHUB…"
        detail="Buscando suas notificações"
        accent={COLORS.git}
        background={COLORS.canvas}
      />
      <ShortcutText
        content="[J/K] Navegar  [H/L] Foco  [A←] [F→] Seção  [R] Atualizar  [O] Abrir  [M] Lida  [B] Salvar  [D] Concluir  [U] Parar de acompanhar"
        style={{ height: 1, flexShrink: 0, fg: COLORS.muted }}
      />
    </box>
  )
}
