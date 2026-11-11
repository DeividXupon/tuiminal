import { useState } from "react"
import { Button } from "@tuiparts/react/button"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { cycleHttpRequestRedirects, cycleHttpRequestTimeout } from "../model/request-options"
import type { HttpRequestDefinition } from "../model/types"
import {
  useHttpOptionsNavigation,
  type HttpOptionsKeyRef,
} from "../hooks/use-http-options-navigation"
import { HttpOptionsSection, HttpOptionsInput } from "./HttpOptionsSection"

export function RequestOptions({
  request,
  focused,
  keyRef,
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
  focused: boolean
  keyRef: HttpOptionsKeyRef
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
  const [contentWidth, setContentWidth] = useState(1)
  const [identityWidth, setIdentityWidth] = useState(0)
  const nameWidth = Math.max(1, Math.floor((identityWidth - 1) / 2))
  const options = request.options
  const rows = [
    {
      id: "http-request-timeout",
      label: "Timeout",
      value: options.timeoutExplicit ? `${options.timeoutMs / 1_000}s` : "herdar",
      run: () => onOptionsChange(cycleHttpRequestTimeout(options)),
      reset: () => onOptionsChange({ ...options, timeoutMs: 30_000, timeoutExplicit: false }),
    },
    {
      id: "http-request-redirects",
      label: "Redirects",
      value: options.followRedirectsExplicit
        ? options.followRedirects
          ? "seguir"
          : "manual"
        : "herdar",
      run: () => onOptionsChange(cycleHttpRequestRedirects(options)),
      reset: () =>
        onOptionsChange({ ...options, followRedirects: true, followRedirectsExplicit: false }),
    },
    {
      id: "http-request-cookie-jar",
      label: "Cookie jar",
      value: options.cookieJar === false ? "ignorar" : "usar",
      accent: options.cookieJar === false ? COLORS.warning : COLORS.text,
      run: () => onOptionsChange({ ...options, cookieJar: options.cookieJar === false }),
      reset: () => onOptionsChange({ ...options, cookieJar: true }),
    },
    {
      id: "http-request-history",
      label: "Histórico",
      value: options.noLog ? "não registrar" : "registrar",
      accent: options.noLog ? COLORS.warning : COLORS.text,
      run: () => onOptionsChange({ ...options, noLog: !options.noLog }),
      reset: () => onOptionsChange({ ...options, noLog: false }),
    },
    {
      id: "http-request-tls-verification",
      label: "TLS",
      value: options.tlsVerification === "insecure" ? "TLS INSEGURO" : "verificar",
      accent: options.tlsVerification === "insecure" ? COLORS.danger : COLORS.text,
      run: () =>
        onOptionsChange({
          ...options,
          tlsVerification: options.tlsVerification === "insecure" ? "strict" : "insecure",
        }),
      reset: () => onOptionsChange({ ...options, tlsVerification: "strict" }),
    },
  ]
  const actions = [
    { id: "http-request-import-curl", label: "Importar cURL", run: onImportCurl },
    { id: "http-request-export-curl", label: "[W] Exportar cURL", run: onExportCurl },
    { id: "http-request-duplicate", label: "Duplicar", run: onDuplicate },
    ...(request.source.kind === "file"
      ? [
          { id: "http-request-move", label: "Mover", run: onMove },
          { id: "http-request-delete", label: "Excluir", run: onDelete, accent: COLORS.danger },
        ]
      : []),
  ]
  const navigation = useHttpOptionsNavigation({
    requestId: request.id,
    focused,
    keyRef,
    optionActions: rows,
    actions,
    onFocus,
  })
  return (
    <box flexGrow={1} minHeight={0}>
      <scrollbox
        id={`http-automation-form-options-${request.id}`}
        ref={navigation.scroll}
        scrollY
        viewportCulling={false}
        viewportOptions={{
          onSizeChange() {
            setContentWidth(Math.max(1, this.width - 1))
            navigation.reveal()
          },
        }}
        style={{ flexGrow: 1, minHeight: 1, backgroundColor: COLORS.canvas }}
      >
        <HttpOptionsSection section="options" title="OPÇÕES DA REQUISIÇÃO" navigation={navigation}>
          {rows.map((row, index) => {
            const selected =
              focused &&
              navigation.section === "options" &&
              navigation.mode !== "block" &&
              navigation.option === index
            return (
              <box
                key={row.id}
                height={1}
                flexShrink={0}
                width={contentWidth}
                flexDirection="row"
                backgroundColor={
                  selected ? COLORS.diffModifiedBg : index % 2 ? COLORS.panelAlt : COLORS.panel
                }
              >
                <Button
                  id={row.id}
                  height={1}
                  width={0}
                  flexGrow={1}
                  minWidth={0}
                  onPress={() => {
                    navigation.select("options", index)
                    row.run()
                  }}
                >
                  <box
                    flexDirection="row"
                    width="100%"
                    height={1}
                    backgroundColor={
                      selected ? COLORS.diffModifiedBg : index % 2 ? COLORS.panelAlt : COLORS.panel
                    }
                  >
                    <text
                      content={` ${translateUi(row.label)}`}
                      width={Math.floor(contentWidth * 0.4)}
                      flexShrink={0}
                      wrapMode="none"
                      fg={selected ? COLORS.http : COLORS.muted}
                    />
                    <text
                      content={translateUi(row.value)}
                      flexGrow={1}
                      width={0}
                      wrapMode="none"
                      fg={row.accent ?? COLORS.text}
                    />
                  </box>
                </Button>
                {selected ? (
                  <InlineButton
                    id={`${row.id}-reset`}
                    label="[R] Padrão"
                    accent={COLORS.http}
                    backgroundColor={COLORS.diffModifiedBg}
                    onPress={() => {
                      navigation.select("options", index)
                      row.reset()
                    }}
                  />
                ) : null}
              </box>
            )
          })}
          <HttpOptionsInput
            id={`http-request-proxy-${request.id}`}
            width={contentWidth}
            label="PROXY"
            value={options.proxy ?? ""}
            placeholder="http://proxy:8080 ou {{proxyUrl}}"
            section="options"
            index={rows.length}
            navigation={navigation}
            onInput={(proxy) => onOptionsChange({ ...options, proxy })}
          />
        </HttpOptionsSection>
        <box height={1} flexShrink={0} />
        <HttpOptionsSection section="identity" title="IDENTIFICAÇÃO" navigation={navigation}>
          <box
            flexDirection="row"
            height={1}
            flexShrink={0}
            gap={1}
            onSizeChange={function () {
              setIdentityWidth(this.width)
            }}
          >
            <HttpOptionsInput
              id={`http-request-name-${request.id}`}
              width={nameWidth}
              label="NOME"
              value={request.name}
              section="identity"
              index={0}
              navigation={navigation}
              onInput={onNameChange}
            />
            <HttpOptionsInput
              id={`http-custom-method-${request.id}`}
              width={Math.max(1, identityWidth - nameWidth - 1)}
              label="MÉTODO"
              value={request.method}
              section="identity"
              index={1}
              navigation={navigation}
              onInput={(method) => onMethodChange(method.toUpperCase())}
            />
          </box>
          <text
            content={translateUi("Aceita métodos personalizados, como PROPFIND.")}
            fg={COLORS.muted}
          />
          <text content={requestOrigin(request)} fg={COLORS.muted} />
        </HttpOptionsSection>
      </scrollbox>
      <HttpOptionsSection section="actions" title="AÇÕES DA REQUISIÇÃO" navigation={navigation}>
        <scrollbox
          ref={navigation.actionScroll}
          scrollX
          scrollY={false}
          height={1}
          horizontalScrollbarOptions={{ visible: false }}
          viewportCulling={false}
          viewportOptions={{ onSizeChange: navigation.reveal }}
          contentOptions={{ flexDirection: "row" }}
        >
          {actions.map((action, index) => (
            <InlineButton
              key={action.id}
              id={action.id}
              label={action.label}
              selected={focused && navigation.section === "actions" && navigation.action === index}
              accent={"accent" in action ? action.accent : COLORS.http}
              backgroundColor={index % 2 ? COLORS.panelAlt : COLORS.panel}
              onPress={() => {
                navigation.select("actions", index)
                action.run()
              }}
            />
          ))}
        </scrollbox>
      </HttpOptionsSection>
    </box>
  )
}

function requestOrigin(request: HttpRequestDefinition) {
  if (request.source.kind !== "file") return translateUi("SCRATCH NÃO SALVO")
  if (request.source.postman) return `Postman  ${request.source.postman.collectionName}`
  return `${translateUi("ARQUIVO")}  ${request.source.path}`
}
