import { COLORS, panelBorder } from "../../../../core/settings/theme"
import { translateUi } from "../../../../shared/i18n"
import { InlineButton } from "../../../../shared/ui/InlineButton"
import { ISSUE_CONFIG_PATH } from "../../storage/issue/config"
import {
  GitHubAuthenticationPanel,
  GitHubCliRequirementPanel,
} from "../shared/GitHubCliRequirementPanel"
import type { IssueDashboardState } from "./useIssueDashboard"

function stateCopy(state: IssueDashboardState) {
  if (state.status === "loading" || state.status === "idle")
    return { title: "CARREGANDO GITHUB…", detail: "" }
  if (state.status === "requirements") {
    return state.capabilities.reason === "missing"
      ? { title: "GITHUB CLI NÃO ENCONTRADO", detail: "Instale gh 2.40.0 ou mais recente." }
      : { title: "GITHUB CLI DESATUALIZADO", detail: "Instale gh 2.40.0 ou mais recente." }
  }
  if (state.status === "config-error") return { title: "ERRO NA CONFIGURAÇÃO", detail: state.error }
  if (state.status === "error" && state.kind === "not-authenticated") {
    return {
      title: "AUTENTICAÇÃO GITHUB NECESSÁRIA",
      detail: "Execute gh auth login no terminal e tente novamente.",
    }
  }
  if (state.status === "error") return { title: "ERRO NO GITHUB", detail: state.error }
  return { title: "CARREGANDO GITHUB…", detail: "" }
}

export function IssueDashboardStatePanel({
  active,
  state,
  onRetry,
}: {
  active: boolean
  state: IssueDashboardState
  onRetry: () => void
}) {
  if (state.status === "requirements") {
    return (
      <GitHubCliRequirementPanel
        active={active}
        capabilities={state.capabilities}
        onRetry={onRetry}
      />
    )
  }
  if (state.status === "authentication") {
    return <GitHubAuthenticationPanel active={active} host={state.host} onRetry={onRetry} />
  }
  const copy = stateCopy(state)
  return (
    <box
      style={{
        ...panelBorder(),
        flexGrow: 1,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: COLORS.panel,
      }}
    >
      <text content={translateUi(copy.title)} style={{ fg: COLORS.git }} />
      {copy.detail ? (
        <text content={translateUi(copy.detail)} style={{ fg: COLORS.muted }} />
      ) : null}
      {state.status === "config-error" ? (
        <text content={ISSUE_CONFIG_PATH} style={{ fg: COLORS.muted }} />
      ) : null}
      <InlineButton
        label={translateUi("[R] Tentar novamente")}
        accent={COLORS.git}
        onPress={onRetry}
      />
    </box>
  )
}
