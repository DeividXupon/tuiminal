import { COLORS } from "../../../../core/settings/theme"
import { formatUiDateTime, translateUi } from "../../../../shared/i18n"
import { InlineButton } from "../../../../shared/ui/InlineButton"
import type { InboxNotification } from "../../model/inbox/types"

export function InboxPreview({
  item,
  saved,
  onOpen,
  onRead,
  onDone,
  onSave,
  onUnsubscribe,
}: {
  item: InboxNotification | null
  saved: boolean
  onOpen: () => void
  onRead: () => void
  onDone: () => void
  onSave: () => void
  onUnsubscribe: () => void
}) {
  if (!item) {
    return <text content={translateUi("Selecione uma notificação.")} style={{ fg: COLORS.muted }} />
  }
  return (
    <box style={{ flexGrow: 1, gap: 1 }}>
      <text content={item.title} style={{ fg: COLORS.git }} />
      <text content={`${item.repository} · ${item.subjectType}`} style={{ fg: COLORS.text }} />
      <text
        content={`${translateUi("Motivo")}: ${item.reason} · ${translateUi("Atualizada em")}: ${formatUiDateTime(item.updatedAt, { dateStyle: "short", timeStyle: "short" })}`}
        style={{ fg: COLORS.muted }}
      />
      <text content={item.url} style={{ fg: COLORS.muted }} />
      <box style={{ height: 2, flexShrink: 0, flexDirection: "row", flexWrap: "wrap" }}>
        <InlineButton id="git-inbox-open" label="[O] Abrir" accent={COLORS.git} onPress={onOpen} />
        {item.unread ? (
          <InlineButton
            id="git-inbox-read"
            label="[M] Marcar lida"
            accent={COLORS.git}
            onPress={onRead}
          />
        ) : null}
        <InlineButton
          id="git-inbox-done"
          label="[D] Concluir"
          accent={COLORS.git}
          onPress={onDone}
        />
        <InlineButton
          id="git-inbox-save"
          label={saved ? "[B] Remover salva" : "[B] Salvar"}
          accent={COLORS.git}
          onPress={onSave}
        />
        <InlineButton
          id="git-inbox-unsubscribe"
          label="[U] Parar de acompanhar"
          accent={COLORS.git}
          onPress={onUnsubscribe}
        />
      </box>
      <text
        content={translateUi(
          "Marcar como lida mantém a notificação; concluir remove da caixa de entrada.",
        )}
        style={{ fg: COLORS.muted }}
      />
    </box>
  )
}
