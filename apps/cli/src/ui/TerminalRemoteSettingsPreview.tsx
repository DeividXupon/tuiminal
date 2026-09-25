import { displayWidth, translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
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
  const activeLabel = `● ${translateUi("ATIVO")}`
  const inactiveLabel = `○ ${translateUi("INATIVO")}`
  const stateWidth = Math.max(displayWidth(activeLabel), displayWidth(inactiveLabel)) + 1
  return (
    <box id="configuration-terminal-remote-preview" style={{ flexShrink: 0 }}>
      <ConfigurationDetailHeader
        section="remoteConnection"
        notice={notice}
        hint="[Enter] configurar"
        compact={compact}
        contentWidth={contentWidth}
      />
      <text
        content={translateUi("Perfis Codex remotos")}
        style={{ fg: COLORS.terminal, height: 1 }}
      />
      <text
        content={translateUi(
          "Salva a conexão SSH e testa o acesso. O Codex remoto ainda não será iniciado.",
        )}
        style={{ fg: COLORS.muted, flexShrink: 0 }}
      />
      {profiles.length ? (
        <box style={{ paddingTop: 1, flexShrink: 0 }}>
          {profiles.map((profile) => {
            const active = profile.id === activeProfileId
            return (
              <box key={profile.id} style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
                <text
                  content={active ? activeLabel : inactiveLabel}
                  style={{
                    width: stateWidth,
                    flexShrink: 0,
                    fg: active ? COLORS.success : COLORS.muted,
                  }}
                />
                <text
                  content={truncateDisplay(
                    `${profile.name} · ${profile.user}@${profile.host}:${profile.port}`,
                    Math.max(1, contentWidth - stateWidth),
                  )}
                  style={{ fg: COLORS.text, flexGrow: 1 }}
                />
              </box>
            )
          })}
        </box>
      ) : (
        <text
          content={translateUi("Nenhum perfil remoto salvo.")}
          style={{ fg: COLORS.muted, height: 1, marginTop: 1 }}
        />
      )}
    </box>
  )
}
