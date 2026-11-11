import { translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import type { RemoteCodexTarget } from "../model/sessions"

export function RemoteProjectSyncRoute({
  localPath,
  remote,
  width,
}: {
  localPath: string
  remote?: RemoteCodexTarget | undefined
  width: number
}) {
  const textWidth = Math.max(1, width - 2)
  const clean = (value: string) => truncateDisplay(value.replace(/[\p{Cc}\p{Cf}]/gu, ""), textWidth)
  return (
    <box
      id="terminal-project-sync-route"
      style={{
        height: remote ? 3 : 2,
        flexShrink: 0,
        border: ["left"],
        borderColor: COLORS.terminal,
        paddingLeft: 1,
        backgroundColor: COLORS.panel,
      }}
    >
      <text
        content={clean(
          `${translateUi("Remoto → Local")}${remote ? ` · ${remote.profile.host}` : ""}`,
        )}
        wrapMode="none"
        style={{ height: 1, fg: COLORS.terminal }}
      />
      {remote && (
        <text
          id="terminal-project-sync-source"
          content={clean(remote.workingDirectory)}
          wrapMode="none"
          style={{ height: 1, fg: COLORS.muted }}
        />
      )}
      <text
        id="terminal-project-sync-destination"
        content={clean(`↓ ${localPath}`)}
        wrapMode="none"
        style={{ height: 1, fg: COLORS.text }}
      />
    </box>
  )
}
