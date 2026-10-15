import type { ScrollBoxRenderable } from "@opentui/core"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { formatUiDateTime, translateUi } from "@xupon/tuiminal-core/i18n/index"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { DirectionalButton } from "@xupon/tuiminal-core/ui/DirectionalButton"
import type { RefObject } from "react"
import type { InboxNotification } from "../../model/inbox/types"
import { InboxConversationContent } from "./InboxConversationContent"
import type { InboxConversationController } from "./useInboxConversation"

export function InboxPreview({
  item,
  saved,
  focused,
  scrollRef,
  conversation,
  onFocus,
  onOpen,
  onRead,
  onDone,
  onSave,
  onUnsubscribe,
}: {
  item: InboxNotification | null
  saved: boolean
  focused: boolean
  scrollRef: RefObject<ScrollBoxRenderable | null>
  conversation: InboxConversationController
  onFocus: () => void
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
    <box style={{ flexGrow: 1, width: "100%" }}>
      <text
        content={`${item.repository} · ${item.subjectType}`}
        wrapMode="none"
        truncate
        style={{ height: 1, flexShrink: 0, fg: focused ? COLORS.git : COLORS.text }}
      />
      <text
        id="git-inbox-preview-title"
        content={item.title}
        wrapMode="none"
        truncate
        style={{ height: 1, flexShrink: 0, fg: COLORS.text }}
      />
      <text
        content={`${translateUi("Motivo")}: ${item.reason} · ${translateUi("Atualizada em")}: ${formatUiDateTime(item.updatedAt, { dateStyle: "short", timeStyle: "short" })}`}
        wrapMode="none"
        truncate
        style={{ height: 1, flexShrink: 0, fg: COLORS.muted }}
      />
      {conversation.available ? (
        <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
          {focused ? (
            <DirectionalButton
              direction={-1}
              level="nested"
              accent={COLORS.git}
              onPress={() =>
                conversation.changeTab(conversation.tab === "overview" ? "activity" : "overview")
              }
            />
          ) : null}
          {(["overview", "activity"] as const).map((tab) => (
            <InlineButton
              key={tab}
              id={`git-inbox-preview-tab-${tab}`}
              label={tab === "overview" ? "VISÃO GERAL" : "ATIVIDADE"}
              active={conversation.tab === tab}
              accent={COLORS.git}
              onPress={() => {
                conversation.changeTab(tab)
                onFocus()
              }}
            />
          ))}
          {focused ? (
            <DirectionalButton
              direction={1}
              level="nested"
              accent={COLORS.git}
              onPress={() =>
                conversation.changeTab(conversation.tab === "overview" ? "activity" : "overview")
              }
            />
          ) : null}
        </box>
      ) : null}
      <box style={{ flexShrink: 0, flexDirection: "row", flexWrap: "wrap" }}>
        <InlineButton id="git-inbox-open" label="[O] Abrir" accent={COLORS.git} onPress={onOpen} />
        {item.unread ? (
          <InlineButton
            id="git-inbox-read"
            label="[Shift+M] Marcar lida"
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
      <scrollbox
        key={`${item.id}:${conversation.tab}`}
        id="git-inbox-preview-scroll"
        ref={scrollRef}
        scrollY
        viewportCulling
        style={{ flexGrow: 1, width: "100%" }}
      >
        {conversation.available ? (
          <InboxConversationContent conversation={conversation} onFocus={onFocus} />
        ) : (
          <>
            <text content={translateUi("DETALHES")} style={{ fg: COLORS.git }} />
            <text content={item.url} style={{ fg: COLORS.muted }} />
            <text
              content={translateUi(
                "Marcar como lida mantém a notificação; concluir remove da caixa de entrada.",
              )}
              style={{ fg: COLORS.muted, marginTop: 1 }}
            />
          </>
        )}
      </scrollbox>
    </box>
  )
}
