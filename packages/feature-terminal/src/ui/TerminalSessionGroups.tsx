import { Button } from "@tuiparts/react/button"
import { displayWidth, translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import {
  DEFAULT_FOLDER,
  EXTERNAL_FOLDER,
  terminalSections,
  type TerminalFolder,
  type TerminalSession,
} from "../model/sessions"
import {
  terminalSessionDetail,
  terminalStatusColor,
  terminalStatusLabel,
  terminalStatusMarker,
} from "../rendering/presentation"

type TerminalSection = ReturnType<typeof terminalSections>[number]

function TerminalPaneButton({
  pane,
  section,
  paneWidth,
  selected,
  cursor,
  separator,
  onActivate,
}: {
  pane: TerminalSession
  section: TerminalSection
  paneWidth: number
  selected: boolean
  cursor: boolean
  separator: boolean
  onActivate: (id: string) => void
}) {
  const status = translateUi(terminalStatusLabel(pane.status, pane.busy))
  const statusWidth = Math.min(
    displayWidth(status),
    Math.max(1, Math.min(Math.floor(paneWidth * 0.44), Math.max(1, paneWidth - 3))),
  )
  const titleColor = cursor ? COLORS.terminal : selected ? COLORS.text : COLORS.muted
  return (
    <box style={{ flexDirection: "row", flexGrow: 1, flexBasis: 0, minWidth: 0 }}>
      {separator && (
        <text
          id={`terminal-sidebar-separator-${section.id}-${pane.id}`}
          content={"│\n│"}
          style={{ fg: COLORS.border, width: 1 }}
        />
      )}
      <Button
        id={`terminal-sidebar-pane-${pane.id}`}
        height={2}
        flexGrow={1}
        onPress={() => onActivate(pane.id)}
      >
        <box
          style={{
            width: "100%",
            height: 2,
            backgroundColor: selected || cursor ? COLORS.panelRaised : "transparent",
          }}
        >
          <box style={{ height: 1, flexDirection: "row", width: "100%" }}>
            <text
              id={`terminal-sidebar-status-${pane.id}`}
              content={`${terminalStatusMarker(pane.status, pane.busy)} `}
              style={{ fg: terminalStatusColor(pane), flexShrink: 0 }}
            />
            <text
              id={`terminal-sidebar-title-${pane.id}`}
              content={truncateDisplay(pane.title, Math.max(1, paneWidth - statusWidth - 2))}
              style={{ fg: titleColor, flexGrow: 1 }}
            />
            <text
              id={`terminal-sidebar-state-${pane.id}`}
              content={truncateDisplay(status, statusWidth)}
              style={{ fg: terminalStatusColor(pane), width: statusWidth, flexShrink: 0 }}
            />
          </box>
          <text
            id={`terminal-sidebar-detail-${pane.id}`}
            content={`  ${truncateDisplay(terminalSessionDetail(pane), Math.max(1, paneWidth - 2))}`}
            style={{ fg: COLORS.muted }}
          />
        </box>
      </Button>
    </box>
  )
}

function TerminalSectionRow({
  section,
  number,
  activeSessionId,
  cursorId,
  width,
  onActivate,
}: {
  section: TerminalSection
  number: number
  activeSessionId: string | null
  cursorId: string | null
  width: number
  onActivate: (id: string) => void
}) {
  const active = section.panes.some((pane) => pane.id === activeSessionId)
  const paneWidth = Math.max(
    1,
    Math.floor((width - 5 - (section.panes.length - 1)) / section.panes.length),
  )
  return (
    <box
      id={`terminal-sidebar-section-${section.id}`}
      style={{ flexDirection: "row", height: 2, flexShrink: 0 }}
    >
      <text
        content={`${active ? "▌" : " "}${String(number).padStart(2, "0")} `}
        style={{ fg: active ? COLORS.terminal : COLORS.muted, width: 4, flexShrink: 0 }}
      />
      {section.panes.map((pane, index) => (
        <TerminalPaneButton
          key={pane.id}
          pane={pane}
          section={section}
          paneWidth={paneWidth}
          selected={activeSessionId === pane.id}
          cursor={cursorId === pane.id}
          separator={index > 0}
          onActivate={onActivate}
        />
      ))}
    </box>
  )
}

export function TerminalSessionGroups({
  folders,
  sections,
  selectedFolder,
  activeSessionId,
  cursorId,
  width,
  onSelectFolder,
  onActivate,
}: {
  folders: TerminalFolder[]
  sections: TerminalSection[]
  selectedFolder: string
  activeSessionId: string | null
  cursorId: string | null
  width: number
  onSelectFolder: (id: string) => void
  onActivate: (id: string) => void
}) {
  return folders.map((folder) => (
    <box key={folder.id} style={{ flexShrink: 0, marginTop: 1 }}>
      <Button
        id={`terminal-sidebar-folder-${folder.id}`}
        height={1}
        width="100%"
        onPress={() => onSelectFolder(folder.id)}
      >
        <text
          content={` ▾ ${truncateDisplay(
            folder.id === DEFAULT_FOLDER || folder.id === EXTERNAL_FOLDER
              ? translateUi(folder.name)
              : folder.name,
            width - 4,
          )}`}
          style={{
            fg: COLORS.text,
            bg: selectedFolder === folder.id ? COLORS.panelRaised : "transparent",
          }}
        />
      </Button>
      {sections
        .filter((section) => section.folderId === folder.id)
        .map((section) => (
          <TerminalSectionRow
            key={section.id}
            section={section}
            number={sections.indexOf(section) + 1}
            activeSessionId={activeSessionId}
            cursorId={cursorId}
            width={width}
            onActivate={onActivate}
          />
        ))}
    </box>
  ))
}
