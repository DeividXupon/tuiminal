import { COLORS } from "../../../core/settings/theme"
import { translateUi } from "../../../shared/i18n/index"
import type {
  HttpPreparedHeaderOrigin,
  HttpPreparedRequestPreview as PreparedPreview,
} from "../services/request-preview"
import type { HttpVariableOrigin } from "../model/types"

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
    <box style={{ flexShrink: 0, flexDirection: "row" }}>
      <text content={translateUi(label)} style={{ width: 16, flexShrink: 0, fg: COLORS.muted }} />
      <text content={value} style={{ flexGrow: 1, fg: COLORS.text }} />
    </box>
  )
}

export function HttpPreparedRequestPreview({ preview }: { preview: PreparedPreview | null }) {
  if (!preview) {
    return <text content={translateUi("PREVIEW INDISPONÍVEL")} style={{ fg: COLORS.muted }} />
  }
  if (!preview.ok) {
    return (
      <box style={{ flexGrow: 1, paddingTop: 1 }}>
        <text content={translateUi("REQUISIÇÃO PREPARADA")} style={{ fg: COLORS.text }} />
        <text
          content={translateUi("O preview encontrou um erro de validação.")}
          style={{ fg: COLORS.warning }}
        />
        <text content={translateUi(preview.error)} style={{ fg: COLORS.danger }} />
      </box>
    )
  }

  return (
    <scrollbox scrollY viewportCulling style={{ flexGrow: 1, paddingTop: 1 }}>
      <text content={translateUi("REQUISIÇÃO PREPARADA")} style={{ fg: COLORS.text }} />
      <text
        content={translateUi("Valores privados permanecem mascarados neste preview.")}
        style={{ fg: COLORS.muted }}
      />
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

      <text
        content={`${translateUi("HEADERS PREPARADOS")} · ${preview.headers.length}`}
        style={{ fg: COLORS.http, marginTop: 1 }}
      />
      {preview.headers.length ? (
        preview.headers.map((header) => (
          <box key={header.id} style={{ flexShrink: 0, flexDirection: "row" }}>
            <text
              content={`[${translateUi(originLabel(header.origin))}]`}
              style={{
                width: 14,
                flexShrink: 0,
                fg: header.masked ? COLORS.warning : COLORS.muted,
              }}
            />
            <text
              content={`${header.name}: ${header.value}`}
              style={{ flexGrow: 1, fg: COLORS.text }}
            />
          </box>
        ))
      ) : (
        <text content={translateUi("Nenhum header será enviado.")} style={{ fg: COLORS.muted }} />
      )}

      <text
        content={`${translateUi("VARIÁVEIS RESOLVIDAS")} · ${preview.variables.length}`}
        style={{ fg: COLORS.http, marginTop: 1 }}
      />
      {preview.variables.length ? (
        preview.variables.map((variable) => (
          <box key={variable.name} style={{ flexShrink: 0, flexDirection: "row" }}>
            <text
              content={`[${translateUi(variableOriginLabel(variable.origin))}]`}
              style={{
                width: 14,
                flexShrink: 0,
                fg: variable.masked ? COLORS.warning : COLORS.muted,
              }}
            />
            <text
              content={`${variable.name}=${variable.value}`}
              style={{ flexGrow: 1, fg: COLORS.text }}
            />
          </box>
        ))
      ) : (
        <text content={translateUi("Nenhuma variável usada.")} style={{ fg: COLORS.muted }} />
      )}

      <text
        content={`${translateUi("BODY PREPARADO")} · ${preview.body.kind.toUpperCase()}`}
        style={{ fg: COLORS.http, marginTop: 1 }}
      />
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
    </scrollbox>
  )
}
