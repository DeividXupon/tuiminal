import type { RGBA, ScrollBoxRenderable } from "@opentui/core"
import { Button } from "@tuiparts/react/button"
import { displayWidth, translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { COLORS, type TerminalRemoteCodexProfile } from "@xupon/tuiminal-core/settings/theme"
import type { RefObject } from "react"

function TerminalRemoteProfileRow({
  profile,
  active,
  cursor,
  stateWidth,
  highlight,
  onSelect,
}: {
  profile: TerminalRemoteCodexProfile
  active: boolean
  cursor: boolean
  stateWidth: number
  highlight: RGBA
  onSelect: (profile: TerminalRemoteCodexProfile) => void
}) {
  const state = active ? `● ${translateUi("ATIVO")}` : `○ ${translateUi("INATIVO")}`
  return (
    <Button
      id={`configuration-terminal-remote-profile-${profile.id}`}
      onPress={() => onSelect(profile)}
      width="100%"
      height={1}
      flexShrink={0}
    >
      {() => (
        <box
          style={{
            width: "100%",
            height: 1,
            flexDirection: "row",
            backgroundColor: cursor ? highlight : COLORS.panel,
            paddingLeft: 1,
            paddingRight: 1,
          }}
        >
          <text
            content={cursor ? "▶ " : "  "}
            style={{ width: 2, flexShrink: 0, fg: COLORS.terminal }}
          />
          <text
            id={`configuration-terminal-remote-profile-status-${profile.id}`}
            content={state}
            style={{
              width: stateWidth,
              flexShrink: 0,
              fg: active ? COLORS.success : COLORS.muted,
            }}
          />
          <text
            content={truncateDisplay(profile.host, Math.max(1, 80 - stateWidth))}
            style={{ flexGrow: 1, fg: COLORS.text }}
          />
        </box>
      )}
    </Button>
  )
}

export function TerminalRemoteProfileList({
  profiles,
  activeProfileId,
  cursorProfileId,
  loading,
  dense,
  highlight,
  scrollRef,
  onSelect,
}: {
  profiles: TerminalRemoteCodexProfile[]
  activeProfileId: string | null
  cursorProfileId: string | null
  loading: boolean
  dense: boolean
  highlight: RGBA
  scrollRef: RefObject<ScrollBoxRenderable | null>
  onSelect: (profile: TerminalRemoteCodexProfile) => void
}) {
  const activeLabel = `● ${translateUi("ATIVO")}`
  const inactiveLabel = `○ ${translateUi("INATIVO")}`
  const stateWidth = Math.max(displayWidth(activeLabel), displayWidth(inactiveLabel)) + 1
  const listHeight = dense ? 1 : Math.max(2, Math.min(8, profiles.length))
  return (
    <box
      id="configuration-terminal-remote-profiles"
      style={{ flexGrow: 1, minHeight: dense ? 1 : 2 }}
    >
      {dense ? null : (
        <text
          content={translateUi("Hosts SSH configurados")}
          style={{ height: 1, flexShrink: 0, fg: COLORS.terminal }}
        />
      )}
      {loading ? (
        <text content={translateUi("Carregando ~/.ssh/config…")} style={{ fg: COLORS.muted }} />
      ) : profiles.length ? (
        <scrollbox
          ref={scrollRef}
          scrollY
          style={{ height: listHeight, flexShrink: 0, width: "100%" }}
          verticalScrollbarOptions={{
            trackOptions: { backgroundColor: COLORS.panel, foregroundColor: COLORS.border },
          }}
        >
          {profiles.map((profile) => (
            <TerminalRemoteProfileRow
              key={profile.id}
              profile={profile}
              active={profile.id === activeProfileId}
              cursor={profile.id === cursorProfileId}
              stateWidth={stateWidth}
              highlight={highlight}
              onSelect={onSelect}
            />
          ))}
        </scrollbox>
      ) : (
        <text
          content={translateUi("Nenhum Host explícito foi encontrado em ~/.ssh/config.")}
          style={{ flexShrink: 0, fg: COLORS.muted }}
        />
      )}
    </box>
  )
}
