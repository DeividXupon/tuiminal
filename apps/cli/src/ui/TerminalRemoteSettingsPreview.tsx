import { translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { COLORS, type TerminalRemoteCodexProfile } from "@xupon/tuiminal-core/settings/theme"
import { ConfigurationDetailHeader } from "./ConfigurationDetailHeader"

export function TerminalRemoteSettingsPreview({
  profiles,
  activeProfileId,
  notice,
  compact,
  contentWidth,
}: {
  profiles: TerminalRemoteCodexProfile[]
  activeProfileId: string | null
  notice: string
  compact: boolean
  contentWidth: number
}) {
  const active = profiles.find((profile) => profile.id === activeProfileId)
  return (
    <box id="configuration-terminal-remote-preview" style={{ flexShrink: 0 }}>
      <ConfigurationDetailHeader
        section="remoteConnection"
        notice={notice}
        hint="[Enter] selecionar"
        compact={compact}
        contentWidth={contentWidth}
      />
      <text
        content={translateUi("Conexão gerenciada pelo OpenSSH")}
        style={{ fg: COLORS.terminal, height: 1 }}
      />
      <text
        content={translateUi(
          "O Tuiminal usa aliases Host de ~/.ssh/config; usuário, porta e identidade ficam no OpenSSH.",
        )}
        style={{ fg: COLORS.muted, flexShrink: 0 }}
      />
      <text
        content={
          active
            ? truncateDisplay(`${translateUi("ATIVO")}: ${active.host}`, contentWidth)
            : translateUi("Nenhum Host SSH está ativo.")
        }
        style={{ fg: active ? COLORS.success : COLORS.muted, height: 1, marginTop: 1 }}
      />
    </box>
  )
}
