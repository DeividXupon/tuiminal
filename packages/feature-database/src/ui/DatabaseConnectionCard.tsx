import { Button } from "@tuiparts/react/button"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import type { DatabaseConnectionProfile } from "../model/types"
import { databaseDriverLabel } from "../services/database"

function externalSourceLabel(profile: DatabaseConnectionProfile) {
  if (profile.externalSource === "mysql-option-file") return ".my.cnf"
  if (profile.externalSource === "mysql-login-path") return "mysql_config_editor"
  if (profile.externalSource === "postgres-service") return "PostgreSQL service"
  if (profile.externalSource === "postgres-passfile") return ".pgpass"
  return translateUi("configuração externa")
}

function connectionSourceLabel(profile: DatabaseConnectionProfile) {
  if (profile.source === "saved") return translateUi("perfil salvo")
  if (profile.source === "mcp") return translateUi("descoberto automaticamente")
  if (profile.source === "environment") return translateUi("variável de ambiente")
  return `${translateUi("configuração externa")} · ${externalSourceLabel(profile)}`
}

export function DatabaseConnectionCard({
  id,
  profile,
  selected,
  onPress,
}: {
  id: string
  profile: DatabaseConnectionProfile
  selected: boolean
  onPress: () => void
}) {
  const endpoint =
    profile.filename ||
    profile.socket ||
    (profile.host
      ? `${profile.host}:${profile.port ?? ""}/${profile.database ?? ""}`
      : undefined) ||
    profile.command ||
    translateUi("configuração externa")

  return (
    <Button id={id} onPress={onPress} height={3} flexShrink={0}>
      {(state) => (
        <box
          style={{
            height: 3,
            flexShrink: 0,
            paddingLeft: 1,
            paddingRight: 1,
            backgroundColor: selected || state.focused ? COLORS.panelRaised : COLORS.panel,
          }}
        >
          <box style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <text
              content={`${selected ? "◆" : "◇"} ${profile.name}`}
              style={{ fg: selected ? COLORS.database : COLORS.text }}
            />
            <text
              content={`${databaseDriverLabel(profile.driver)} · ${profile.writeEnabled ? "RW" : "RO"}`}
              style={{ fg: profile.writeEnabled ? COLORS.warning : COLORS.database }}
            />
          </box>
          <text content={endpoint} style={{ fg: COLORS.muted }} />
          <text content={connectionSourceLabel(profile)} style={{ fg: COLORS.muted }} />
        </box>
      )}
    </Button>
  )
}
