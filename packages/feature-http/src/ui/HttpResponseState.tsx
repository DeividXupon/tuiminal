import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import type { HttpDocumentState } from "../model/types"

export function HttpResponseState({ document }: { document: HttpDocumentState }) {
  const execution = document.execution
  if (execution.status === "running") {
    return (
      <box style={{ flexGrow: 1, alignItems: "center", justifyContent: "center" }}>
        <text content={translateUi("ENVIANDO · AGUARDANDO RESPOSTA")} style={{ fg: COLORS.http }} />
        <text content={translateUi("[X] Cancelar")} style={{ fg: COLORS.muted }} />
      </box>
    )
  }
  if (execution.status === "error") {
    const category = {
      url: "URL",
      dns: "DNS/CONEXÃO",
      network: "CONEXÃO",
      tls: "TLS",
      timeout: "TIMEOUT",
      cancelled: "CANCELAMENTO",
      redirect: "REDIRECT",
      body: "CORPO",
      parse: "PREPARAÇÃO",
    }[execution.kind]
    return (
      <box style={{ flexGrow: 1, alignItems: "center", justifyContent: "center" }}>
        <text
          content={`${translateUi("× FALHA")} · ${translateUi(category)}`}
          style={{ fg: COLORS.danger }}
        />
        <text content={translateUi(execution.message)} style={{ fg: COLORS.text }} />
      </box>
    )
  }
  if (execution.status === "cancelled") {
    return (
      <box style={{ flexGrow: 1, alignItems: "center", justifyContent: "center" }}>
        <text content={translateUi("REQUISIÇÃO CANCELADA")} style={{ fg: COLORS.warning }} />
      </box>
    )
  }
  return (
    <box style={{ flexGrow: 1, alignItems: "center", justifyContent: "center" }}>
      <text content={translateUi("PRONTO PARA ENVIAR")} style={{ fg: COLORS.text }} />
      <text
        content={translateUi("Informe uma URL e use [S] Enviar.")}
        style={{ fg: COLORS.muted }}
      />
    </box>
  )
}
