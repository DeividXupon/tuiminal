import type { RGBA, ScrollBoxRenderable } from "@opentui/core"
import { Button } from "@tuiparts/react/button"
import { displayWidth, translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { COLORS, type TerminalRemoteCodexProfile } from "@xupon/tuiminal-core/settings/theme"
import type { RefObject } from "react"

function TerminalRemoteProfileRow({
  profile,
  active,
  loaded,
  cursor,
  activeLabel,
  inactiveLabel,
  editingLabel,
  stateWidth,
  editingWidth,
  availableDetailsWidth,
  nameWidth,
  showEndpoint,
  highlight,
  onSelect,
}: {
  profile: TerminalRemoteCodexProfile
  active: boolean
  loaded: boolean
  cursor: boolean
  activeLabel: string
  inactiveLabel: string
  editingLabel: string
  stateWidth: number
  editingWidth: number
  availableDetailsWidth: number
  nameWidth: number
  showEndpoint: boolean
  highlight: RGBA
  onSelect: (profile: TerminalRemoteCodexProfile) => void
}) {
  const endpoint = `${profile.user}@${profile.host}:${profile.port}`
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
            content={active ? activeLabel : inactiveLabel}
            style={{
              width: stateWidth,
              flexShrink: 0,
              fg: active ? COLORS.success : COLORS.muted,
            }}
          />
          <text
            id={`configuration-terminal-remote-profile-editing-${profile.id}`}
            content={loaded ? editingLabel : ""}
            style={{ width: editingWidth, flexShrink: 0, fg: COLORS.terminal }}
          />
          <text
            content={truncateDisplay(profile.name, nameWidth)}
            style={{ width: nameWidth + 1, flexShrink: 0, fg: COLORS.text }}
          />
          {showEndpoint ? (
            <text
              content={truncateDisplay(
                endpoint,
                Math.max(1, availableDetailsWidth - nameWidth - 1),
              )}
              style={{ flexGrow: 1, fg: COLORS.muted }}
            />
          ) : null}
        </box>
      )}
    </Button>
  )
}

export function TerminalRemoteProfileList({
  profiles,
  activeProfileId,
  loadedProfileId,
  cursorProfileId,
  contentWidth,
  dense,
  highlight,
  scrollRef,
  onSelect,
}: {
  profiles: TerminalRemoteCodexProfile[]
  activeProfileId: string | null
  loadedProfileId: string
  cursorProfileId: string | null
  contentWidth: number
  dense: boolean
  highlight: RGBA
  scrollRef: RefObject<ScrollBoxRenderable | null>
  onSelect: (profile: TerminalRemoteCodexProfile) => void
}) {
  const listHeight = dense ? 1 : Math.max(1, Math.min(3, profiles.length))
  const activeLabel = `● ${translateUi("ATIVO")}`
  const inactiveLabel = `○ ${translateUi("INATIVO")}`
  const editingLabel = `◆ ${translateUi("EDITANDO")}`
  const stateWidth = Math.max(displayWidth(activeLabel), displayWidth(inactiveLabel)) + 1
  const editingWidth = displayWidth(editingLabel) + 1
  const availableDetailsWidth = Math.max(1, contentWidth - stateWidth - editingWidth - 4)
  const showEndpoint = availableDetailsWidth >= 18
  const nameWidth = showEndpoint
    ? Math.max(8, Math.min(20, Math.floor(availableDetailsWidth * 0.46)))
    : availableDetailsWidth
  return (
    <box id="configuration-terminal-remote-profiles" style={{ flexShrink: 0 }}>
      {dense ? null : (
        <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
          <text content={translateUi("Perfis Codex remotos")} style={{ fg: COLORS.terminal }} />
          {contentWidth < 60 ? null : (
            <text content={`  ${translateUi("▶ cursor")}`} style={{ fg: COLORS.muted }} />
          )}
        </box>
      )}
      {profiles.length ? (
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
              loaded={profile.id === loadedProfileId}
              cursor={profile.id === cursorProfileId}
              activeLabel={activeLabel}
              inactiveLabel={inactiveLabel}
              editingLabel={editingLabel}
              stateWidth={stateWidth}
              editingWidth={editingWidth}
              availableDetailsWidth={availableDetailsWidth}
              nameWidth={nameWidth}
              showEndpoint={showEndpoint}
              highlight={highlight}
              onSelect={onSelect}
            />
          ))}
        </scrollbox>
      ) : (
        <text
          content={translateUi("Nenhum perfil remoto salvo.")}
          style={{ height: 1, flexShrink: 0, fg: COLORS.muted }}
        />
      )}
    </box>
  )
}
