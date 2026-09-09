import type { InputRenderable } from "@opentui/core"
import { useRef } from "react"
import { COLORS } from "../../../core/settings/theme"
import { translateUi } from "../../../shared/i18n/index"
import { InlineButton } from "../../../shared/ui/InlineButton"
import { createHttpAssertionDraft } from "../model/automation"
import { cycleHttpRequestRedirects, cycleHttpRequestTimeout } from "../model/request-options"
import type {
  HttpAssertionDefinition,
  HttpRequestDefinition,
  HttpRequestMoreView,
} from "../model/types"
import type { HttpPreparedRequestPreview as PreparedPreview } from "../services/request-preview"
import { HttpPreparedRequestPreview } from "./HttpPreparedRequestPreview"
import { HttpRequestChainingEditor } from "./HttpRequestChainingEditor"

function MoreViewTabs({
  view,
  dense,
  onChange,
}: {
  view: HttpRequestMoreView
  dense: boolean
  onChange: (view: HttpRequestMoreView) => void
}) {
  const buttons = (
    [
      ["options", "[1] Opções"],
      ["assertions", "[2] Assertions"],
      ["chaining", "[3] Chaining"],
      ["preview", "[4] Preview"],
    ] as const
  ).map(([candidate, label]) => (
    <InlineButton
      key={candidate}
      label={label}
      accent={COLORS.http}
      active={view === candidate}
      onPress={() => onChange(candidate)}
    />
  ))
  if (dense) {
    return <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>{buttons}</box>
  }
  return (
    <box style={{ height: 2, flexShrink: 0 }}>
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>{buttons.slice(0, 2)}</box>
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>{buttons.slice(2)}</box>
    </box>
  )
}

function RequestOptions({
  request,
  dense,
  onNameChange,
  onMethodChange,
  onOptionsChange,
  onImportCurl,
  onExportCurl,
  onDuplicate,
  onMove,
  onDelete,
  onFocus,
}: {
  request: HttpRequestDefinition
  dense: boolean
  onNameChange: (name: string) => void
  onMethodChange: (method: string) => void
  onOptionsChange: (options: HttpRequestDefinition["options"]) => void
  onImportCurl: () => void
  onExportCurl: () => void
  onDuplicate: () => void
  onMove: () => void
  onDelete: () => void
  onFocus: () => void
}) {
  const nameInputRef = useRef<InputRenderable | null>(null)
  const methodInputRef = useRef<InputRenderable | null>(null)
  const proxyInputRef = useRef<InputRenderable | null>(null)
  return (
    <scrollbox scrollY viewportCulling={false} style={{ flexGrow: 1, paddingTop: dense ? 0 : 1 }}>
      <text content={translateUi("OPÇÕES DA REQUISIÇÃO")} style={{ fg: COLORS.text }} />
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
        <InlineButton
          label={
            request.options.timeoutExplicit
              ? `[T] Timeout: ${request.options.timeoutMs / 1_000}s`
              : "[T] Timeout: herdar"
          }
          accent={COLORS.http}
          active={request.options.timeoutExplicit === true}
          onPress={() => onOptionsChange(cycleHttpRequestTimeout(request.options))}
        />
        <InlineButton
          label={
            request.options.followRedirectsExplicit
              ? request.options.followRedirects
                ? "[R] Redirects: seguir"
                : "[R] Redirects: manual"
              : "[R] Redirects: herdar"
          }
          accent={COLORS.http}
          active={request.options.followRedirectsExplicit === true}
          onPress={() => onOptionsChange(cycleHttpRequestRedirects(request.options))}
        />
        <InlineButton
          id="http-request-cookie-jar"
          label={
            request.options.cookieJar === false ? "[C] Cookie jar: ignorar" : "[C] Cookie jar: usar"
          }
          accent={request.options.cookieJar === false ? COLORS.warning : COLORS.http}
          active={request.options.cookieJar === false}
          onPress={() =>
            onOptionsChange({ ...request.options, cookieJar: request.options.cookieJar === false })
          }
        />
      </box>
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
        <text
          content={translateUi("PROXY")}
          style={{ width: 12, flexShrink: 0, fg: COLORS.muted }}
        />
        <input
          ref={proxyInputRef}
          id={`http-request-proxy-${request.id}`}
          value={request.options.proxy ?? ""}
          placeholder={translateUi("http://proxy:8080 ou {{proxyUrl}}")}
          onInput={(proxy) => onOptionsChange({ ...request.options, proxy })}
          onMouseDown={() => {
            onFocus()
            proxyInputRef.current?.focus()
          }}
          style={{
            flexGrow: 1,
            backgroundColor: COLORS.canvas,
            focusedBackgroundColor: COLORS.panelRaised,
          }}
        />
      </box>
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
        <InlineButton
          label={
            request.options.noLog ? "[L] Histórico: não registrar" : "[L] Histórico: registrar"
          }
          accent={request.options.noLog ? COLORS.warning : COLORS.http}
          active={request.options.noLog === true}
          onPress={() => onOptionsChange({ ...request.options, noLog: !request.options.noLog })}
        />
        <InlineButton
          id="http-request-tls-verification"
          label={
            request.options.tlsVerification === "insecure"
              ? "[V] TLS INSEGURO"
              : "[V] TLS: verificar"
          }
          accent={request.options.tlsVerification === "insecure" ? COLORS.danger : COLORS.http}
          active={request.options.tlsVerification === "insecure"}
          onPress={() =>
            onOptionsChange({
              ...request.options,
              tlsVerification:
                request.options.tlsVerification === "insecure" ? "strict" : "insecure",
            })
          }
        />
      </box>
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
        <text content={translateUi("NOME")} style={{ width: 12, fg: COLORS.muted }} />
        <input
          ref={nameInputRef}
          id={`http-request-name-${request.id}`}
          value={request.name}
          width="70%"
          onInput={onNameChange}
          onMouseDown={() => {
            onFocus()
            nameInputRef.current?.focus()
          }}
          style={{ backgroundColor: COLORS.canvas, focusedBackgroundColor: COLORS.panelRaised }}
        />
      </box>
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
        <text content={translateUi("MÉTODO")} style={{ width: 12, fg: COLORS.muted }} />
        <input
          ref={methodInputRef}
          id={`http-custom-method-${request.id}`}
          value={request.method}
          width={16}
          onInput={(method) => onMethodChange(method.toUpperCase())}
          onMouseDown={() => {
            onFocus()
            methodInputRef.current?.focus()
          }}
          style={{ backgroundColor: COLORS.canvas, focusedBackgroundColor: COLORS.panelRaised }}
        />
        <text
          content={translateUi("Aceita métodos personalizados, como PROPFIND.")}
          style={{ fg: COLORS.muted }}
        />
      </box>
      <text
        content={
          request.source.kind === "file"
            ? `${translateUi("ARQUIVO")}  ${request.source.path}`
            : translateUi("SCRATCH NÃO SALVO")
        }
        style={{ fg: COLORS.muted }}
      />
      {request.source.kind === "file" && request.source.supported === false ? (
        <text
          content={translateUi("SOMENTE LEITURA · RECURSO .HTTP NÃO SUPORTADO")}
          style={{ fg: COLORS.warning }}
        />
      ) : null}
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
        <InlineButton label="[I] Importar cURL" accent={COLORS.http} onPress={onImportCurl} />
        <InlineButton label="[X] Exportar cURL" accent={COLORS.http} onPress={onExportCurl} />
        <InlineButton label="[D] Duplicar" accent={COLORS.http} onPress={onDuplicate} />
        {request.source.kind === "file" ? (
          <>
            <InlineButton label="[Ctrl+M] Mover" accent={COLORS.http} onPress={onMove} />
            <InlineButton label="[Ctrl+Delete] Excluir" accent={COLORS.danger} onPress={onDelete} />
          </>
        ) : null}
      </box>
    </scrollbox>
  )
}

function AssertionsEditor({
  requestId,
  assertions,
  onChange,
  onFocus,
}: {
  requestId: string
  assertions: HttpAssertionDefinition[]
  onChange: (assertions: HttpAssertionDefinition[]) => void
  onFocus: () => void
}) {
  const inputs = useRef(new Map<string, InputRenderable>())
  const patch = (id: string, expression: string) =>
    onChange(assertions.map((item) => (item.id === id ? { ...item, expression } : item)))
  const remove = (id: string) => onChange(assertions.filter((item) => item.id !== id))
  const add = () => {
    const next = createHttpAssertionDraft(requestId)
    onChange([...assertions, next])
    setTimeout(() => inputs.current.get(next.id)?.focus(), 0)
  }
  return (
    <box style={{ flexGrow: 1, paddingTop: 1 }}>
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
        <text
          content={translateUi("ASSERTIONS DO REQUEST")}
          style={{ flexGrow: 1, fg: COLORS.text }}
        />
        <InlineButton label="[N] Adicionar" accent={COLORS.http} onPress={add} />
      </box>
      <text
        content={translateUi("Verifique status, headers, body ou JSONPath após cada execução.")}
        style={{ fg: COLORS.muted }}
      />
      <text
        content={translateUi(
          "Exemplos: status == 200 · header Content-Type contains json · jsonpath $.id exists",
        )}
        style={{ fg: COLORS.muted }}
      />
      <scrollbox scrollY viewportCulling style={{ flexGrow: 1, backgroundColor: COLORS.canvas }}>
        {assertions.length ? (
          assertions.map((assertion) => (
            <box key={assertion.id} style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
              <input
                ref={(input) => {
                  if (input) inputs.current.set(assertion.id, input)
                  else inputs.current.delete(assertion.id)
                }}
                id={`http-automation-assertion-${assertion.id}`}
                value={assertion.expression}
                placeholder="status == 200"
                width="90%"
                onInput={(expression) => patch(assertion.id, expression)}
                onKeyDown={(event) => {
                  if (!event.ctrl || event.name !== "d") return
                  event.preventDefault()
                  event.stopPropagation()
                  remove(assertion.id)
                }}
                onMouseDown={() => {
                  onFocus()
                  inputs.current.get(assertion.id)?.focus()
                }}
                style={{
                  backgroundColor: COLORS.canvas,
                  focusedBackgroundColor: COLORS.panelRaised,
                }}
              />
              <InlineButton
                label="[×]"
                accent={COLORS.danger}
                onPress={() => remove(assertion.id)}
              />
            </box>
          ))
        ) : (
          <text
            content={translateUi("Nenhuma assertion configurada.")}
            style={{ fg: COLORS.muted }}
          />
        )}
      </scrollbox>
      <text content={translateUi("[Ctrl+D] exclui a linha focada.")} style={{ fg: COLORS.muted }} />
    </box>
  )
}

export function HttpRequestMoreEditor({
  document,
  dense,
  onSelectView,
  onNameChange,
  onMethodChange,
  onOptionsChange,
  onAssertionsChange,
  onChainChange,
  onImportCurl,
  onExportCurl,
  onDuplicate,
  onMove,
  onDelete,
  onFocus,
  preview,
}: {
  document: { request: HttpRequestDefinition; requestMoreView: HttpRequestMoreView }
  dense: boolean
  onSelectView: (view: HttpRequestMoreView) => void
  onNameChange: (name: string) => void
  onMethodChange: (method: string) => void
  onOptionsChange: (options: HttpRequestDefinition["options"]) => void
  onAssertionsChange: (assertions: HttpAssertionDefinition[]) => void
  onChainChange: (chain: NonNullable<HttpRequestDefinition["chain"]>) => void
  onImportCurl: () => void
  onExportCurl: () => void
  onDuplicate: () => void
  onMove: () => void
  onDelete: () => void
  onFocus: () => void
  preview: PreparedPreview | null
}) {
  const request = document.request
  return (
    <box style={{ flexGrow: 1 }}>
      <MoreViewTabs view={document.requestMoreView} dense={dense} onChange={onSelectView} />
      {document.requestMoreView === "options" ? (
        <RequestOptions
          request={request}
          dense={dense}
          onNameChange={onNameChange}
          onMethodChange={onMethodChange}
          onOptionsChange={onOptionsChange}
          onImportCurl={onImportCurl}
          onExportCurl={onExportCurl}
          onDuplicate={onDuplicate}
          onMove={onMove}
          onDelete={onDelete}
          onFocus={onFocus}
        />
      ) : document.requestMoreView === "assertions" ? (
        <AssertionsEditor
          requestId={request.id}
          assertions={request.assertions ?? []}
          onChange={onAssertionsChange}
          onFocus={onFocus}
        />
      ) : document.requestMoreView === "chaining" ? (
        <HttpRequestChainingEditor
          requestId={request.id}
          chain={request.chain ?? { extract: [] }}
          onChange={onChainChange}
          onFocus={onFocus}
        />
      ) : (
        <HttpPreparedRequestPreview preview={preview} />
      )}
    </box>
  )
}
