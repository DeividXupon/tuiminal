import type { ScrollBoxRenderable } from "@opentui/core"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { ShortcutText } from "@xupon/tuiminal-core/ui/ShortcutText"
import type { DatabaseConnectionProfile, ExternalDatabaseConnectionCandidate } from "../model/types"
import { DatabaseConnectionCard } from "./DatabaseConnectionCard"

type ConnectionItem = DatabaseConnectionProfile | ExternalDatabaseConnectionCandidate

export function DatabaseConnectionList({
  items,
  selectedIndex,
  deleteConfirmationId,
  busy,
  notice,
  externalWarning,
  discoveringExternal,
  listRef,
  onCreate,
  onRefresh,
  onActivate,
  onEdit,
  onDelete,
}: {
  items: ConnectionItem[]
  selectedIndex: number
  deleteConfirmationId: string | null
  busy: boolean
  notice: string
  externalWarning?: string
  discoveringExternal: boolean
  listRef: React.RefObject<ScrollBoxRenderable | null>
  onCreate: () => void
  onRefresh: () => void
  onActivate: (profile: ConnectionItem, index: number) => void
  onEdit: () => void
  onDelete: () => void
}) {
  const selectedProfile = items[selectedIndex]
  const selectedProfileIsSaved = selectedProfile?.source === "saved"
  const feedback = notice || externalWarning

  return (
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
        <text
          content={translateUi("Escolha um perfil para conectar")}
          style={{ fg: COLORS.muted }}
        />
        <box style={{ flexDirection: "row" }}>
          <InlineButton label="[C] Nova conexão" accent={COLORS.database} onPress={onCreate} />
          <InlineButton
            label={translateUi(discoveringExternal ? "[R] Lendo…" : "[R] Recarregar")}
            accent={COLORS.database}
            disabled={discoveringExternal}
            onPress={onRefresh}
          />
        </box>
      </box>
      <scrollbox
        ref={listRef}
        id="database-connection-list"
        scrollY
        viewportCulling
        style={{ flexGrow: 1, width: "100%" }}
        verticalScrollbarOptions={{
          trackOptions: { backgroundColor: COLORS.panel, foregroundColor: COLORS.border },
        }}
      >
        {items.map((profile, index) => (
          <DatabaseConnectionCard
            key={profile.id}
            id={`database-connection-card-${index}`}
            profile={profile}
            selected={index === selectedIndex}
            onPress={() => onActivate(profile, index)}
          />
        ))}
      </scrollbox>
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
        <InlineButton
          label="[Enter] Conectar"
          accent={COLORS.database}
          disabled={!selectedProfile || busy}
          onPress={() => selectedProfile && onActivate(selectedProfile, selectedIndex)}
        />
        <InlineButton
          label="[E] Editar"
          accent={COLORS.database}
          disabled={!selectedProfileIsSaved || busy}
          onPress={onEdit}
        />
        <InlineButton
          label={
            deleteConfirmationId === selectedProfile?.id ? "[X] Confirmar exclusão" : "[X] Excluir"
          }
          accent={COLORS.danger}
          disabled={!selectedProfileIsSaved || busy}
          onPress={onDelete}
        />
      </box>
      {feedback ? (
        <text content={translateUi(feedback)} style={{ fg: COLORS.warning, marginTop: 1 }} />
      ) : (
        <ShortcutText
          content="[↑↓/J/K] selecionar · [Enter] conectar · [E] editar · [X] excluir"
          style={{ fg: COLORS.muted, marginTop: 1 }}
        />
      )}
    </box>
  )
}
