import type { ScrollBoxRenderable } from "@opentui/core"
import { Button } from "@tuiparts/react/button"
import { useEffect, useRef } from "react"
import { COLORS } from "../../../../core/settings/theme"
import { formatUiDateTime, translateUi, truncateDisplay } from "../../../../shared/i18n"
import type { InboxNotification } from "../../model/inbox/types"

function updated(value: string) {
  return formatUiDateTime(value, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function InboxRow({
  item,
  index,
  width,
  selected,
  focused,
  saved,
  onSelect,
}: {
  item: InboxNotification
  index: number
  width: number
  selected: boolean
  focused: boolean
  saved: boolean
  onSelect: (index: number) => void
}) {
  const marker = item.unread ? "●" : "○"
  const suffix = `${item.subjectType} · ${updated(item.updatedAt)}${saved ? " · ★" : ""}`
  return (
    <box
      id={`git-inbox-row-${index}`}
      style={{
        height: 2,
        flexShrink: 0,
        backgroundColor: selected ? COLORS.panelRaised : COLORS.panel,
      }}
    >
      <Button height={1} width="100%" onPress={() => onSelect(index)}>
        <text
          content={`${selected ? "▶" : " "} ${marker} ${truncateDisplay(item.repository, Math.max(12, width - 7))}`}
          style={{
            fg: selected && focused ? COLORS.git : item.unread ? COLORS.text : COLORS.muted,
          }}
        />
      </Button>
      <Button height={1} width="100%" onPress={() => onSelect(index)}>
        <text
          content={`  ${truncateDisplay(`${item.title} · ${suffix}`, Math.max(8, width - 2))}`}
          style={{ fg: selected ? COLORS.text : COLORS.muted }}
        />
      </Button>
    </box>
  )
}

export function InboxList({
  items,
  selectedIndex,
  focused,
  width,
  savedIds,
  loadingMore,
  loadingFrame,
  onSelect,
}: {
  items: readonly InboxNotification[]
  selectedIndex: number
  focused: boolean
  width: number
  savedIds: ReadonlySet<string>
  loadingMore: boolean
  loadingFrame: string
  onSelect: (index: number) => void
}) {
  const listRef = useRef<ScrollBoxRenderable | null>(null)
  useEffect(() => {
    if (items.length) listRef.current?.scrollChildIntoView(`git-inbox-row-${selectedIndex}`)
  }, [items.length, selectedIndex])
  return (
    <box style={{ flexGrow: 1, width: "100%" }}>
      <text
        content={translateUi("  ESTADO · REPOSITÓRIO / ASSUNTO · ATUALIZAÇÃO")}
        style={{ fg: COLORS.muted, bg: COLORS.panelRaised }}
      />
      {items.length ? (
        <scrollbox ref={listRef} scrollY viewportCulling style={{ flexGrow: 1, width: "100%" }}>
          {items.map((item, index) => (
            <InboxRow
              key={item.id}
              item={item}
              index={index}
              width={width}
              selected={index === selectedIndex}
              focused={focused}
              saved={savedIds.has(item.id)}
              onSelect={onSelect}
            />
          ))}
          {loadingMore ? (
            <text
              id="git-inbox-page-loader"
              content={`${loadingFrame} ${translateUi("Carregando mais notificações…")}`}
              style={{ height: 1, flexShrink: 0, fg: COLORS.git }}
            />
          ) : null}
        </scrollbox>
      ) : (
        <text
          content={translateUi("Nenhuma notificação nesta seção.")}
          style={{ fg: COLORS.muted }}
        />
      )}
    </box>
  )
}
