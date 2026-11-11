import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import type {
  HttpPreparedHeaderOrigin,
  HttpPreparedRequestPreview as PreparedPreview,
} from "../services/request-preview"
import type { HttpVariableOrigin } from "../model/types"
import { HttpRequestForm, HttpFormSection } from "./HttpRequestForm"

function originLabel(origin: HttpPreparedHeaderOrigin) {
  switch (origin) {
    case "request":
      return "REQUEST"
    case "collection":
      return "COLEÇÃO"
    case "workspace":
      return "WORKSPACE"
    case "auth":
      return "AUTH"
    case "automatic":
      return "AUTOMÁTICO"
  }
}

function variableOriginLabel(origin: HttpVariableOrigin) {
  switch (origin) {
    case "request":
      return "REQUEST"
    case "file":
      return "ARQUIVO"
    case "private":
      return "PRIVADO"
    case "public":
      return "PÚBLICO"
    case "built-in":
      return "INTERNO"
  }
}

function PreviewLine({ label, value }: { label: string; value: string }) {
  return (
    <box style={{ flexShrink: 0, flexDirection: "row", minWidth: 0 }}>
      <text
        content={translateUi(label)}
        style={{ width: 16, maxWidth: "50%", flexShrink: 0, fg: COLORS.muted }}
      />
      <text content={value} style={{ width: 0, minWidth: 0, flexGrow: 1, fg: COLORS.text }} />
    </box>
  )
}

export function HttpPreparedRequestPreview({
  requestId,
  preview,
}: {
  requestId: string
  preview: PreparedPreview | null
}) {
  if (!preview) {
    return <text content={translateUi("PREVIEW INDISPONÍVEL")} style={{ fg: COLORS.muted }} />
  }
  if (!preview.ok) {
    return (
      <HttpRequestForm id={`preview-${requestId}`}>
        <HttpFormSection first title="REQUISIÇÃO PREPARADA">
          <text
            content={translateUi("O preview encontrou um erro de validação.")}
            style={{ fg: COLORS.warning }}
          />
          <text content={translateUi(preview.error)} style={{ fg: COLORS.danger }} />
        </HttpFormSection>
      </HttpRequestForm>
    )
  }

  return (
    <HttpRequestForm id={`preview-${requestId}`}>
      <HttpFormSection
        first
        title="REQUISIÇÃO PREPARADA"
        description="Valores privados permanecem mascarados neste preview."
      >
        <PreviewLine label="MÉTODO" value={preview.method} />
        <PreviewLine label="URL RESOLVIDA" value={preview.url} />
        <PreviewLine label="TIMEOUT" value={`${preview.timeoutMs / 1_000}s`} />
        <PreviewLine
          label="REDIRECTS"
          value={translateUi(preview.followRedirects ? "seguir" : "manual")}
        />
        <PreviewLine
          label="COOKIE JAR"
          value={translateUi(preview.useCookieJar ? "usar" : "ignorar")}
        />
        <PreviewLine label="PROXY" value={preview.proxy ?? translateUi("direto")} />
        <PreviewLine
          label="VERIFICAÇÃO TLS"
          value={translateUi(preview.tlsVerification === "insecure" ? "TLS INSEGURO" : "verificar")}
        />
        <PreviewLine
          label="HISTÓRICO"
          value={translateUi(preview.noLog ? "não registrar" : "registrar")}
        />
      </HttpFormSection>
      <HttpFormSection
        title="HEADERS PREPARADOS"
        actions={<text content={String(preview.headers.length)} fg={COLORS.muted} />}
      >
        {preview.headers.length ? (
          preview.headers.map((header) => (
            <box key={header.id} style={{ flexShrink: 0, marginBottom: 1 }}>
              <text
                content={`${header.name} · ${translateUi(originLabel(header.origin))}`}
                style={{
                  flexShrink: 0,
                  fg: header.masked ? COLORS.warning : COLORS.muted,
                }}
              />
              <text content={header.value} style={{ minWidth: 0, fg: COLORS.text }} />
            </box>
          ))
        ) : (
          <text content={translateUi("Nenhum header será enviado.")} style={{ fg: COLORS.muted }} />
        )}
      </HttpFormSection>
      <HttpFormSection
        title="VARIÁVEIS RESOLVIDAS"
        actions={<text content={String(preview.variables.length)} fg={COLORS.muted} />}
      >
        {preview.variables.length ? (
          preview.variables.map((variable) => (
            <box key={variable.name} style={{ flexShrink: 0, marginBottom: 1 }}>
              <text
                content={`${variable.name} · ${translateUi(variableOriginLabel(variable.origin))}`}
                style={{
                  flexShrink: 0,
                  fg: variable.masked ? COLORS.warning : COLORS.muted,
                }}
              />
              <text content={variable.value} style={{ minWidth: 0, fg: COLORS.text }} />
            </box>
          ))
        ) : (
          <text content={translateUi("Nenhuma variável usada.")} style={{ fg: COLORS.muted }} />
        )}
      </HttpFormSection>
      <HttpFormSection
        title="BODY PREPARADO"
        actions={<text content={preview.body.kind.toUpperCase()} fg={COLORS.muted} />}
      >
        <text
          content={preview.body.content || translateUi("Nenhum body será enviado.")}
          style={{ fg: preview.body.content ? COLORS.text : COLORS.muted }}
        />
        {preview.body.truncated ? (
          <text
            content={translateUi("Preview do body limitado aos primeiros 4096 caracteres.")}
            style={{ fg: COLORS.warning }}
          />
        ) : null}
      </HttpFormSection>
    </HttpRequestForm>
  )
}
