import { useMemo, useState } from "react"
import { Button } from "@tuiparts/react/button"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { ShortcutText } from "@xupon/tuiminal-core/ui/ShortcutText"
import { httpChainPlan } from "../model/chaining"
import { previewHttpExtractions } from "../model/chain-extractions"
import type {
  HttpProjectRequestItem,
  HttpRequestDefinition,
  HttpResponseSnapshot,
} from "../model/types"
import {
  useHttpChainingNavigation,
  type HttpChainingKeyRef,
} from "../hooks/use-http-chaining-navigation"
import { HttpChainingRow } from "./HttpChainingRow"
import { HttpChainDependencyPicker } from "./HttpChainDependencyPicker"
import { HttpFormSection } from "./HttpRequestForm"

export function HttpRequestChainingEditor({
  request,
  requests,
  response,
  focused,
  keyRef,
  onChange,
  onFocus,
}: {
  request: HttpRequestDefinition
  requests: HttpProjectRequestItem[]
  response?: HttpResponseSnapshot | undefined
  focused: boolean
  keyRef: HttpChainingKeyRef
  onChange: (chain: NonNullable<HttpRequestDefinition["chain"]>) => void
  onFocus: () => void
}) {
  const [contentWidth, setContentWidth] = useState(1)
  const chain = request.chain ?? { extract: [] }
  const nav = useHttpChainingNavigation({
    requestId: request.id,
    chain,
    focused,
    keyRef,
    onChange,
    onFocus,
  })
  const plan = useMemo(() => httpChainPlan(request, requests), [request, requests])
  const previews = useMemo(
    () => previewHttpExtractions(chain.extract, response),
    [chain.extract, response],
  )
  const chooseDependency = (dependsOn: string | undefined) => {
    const next = { ...chain }
    if (dependsOn) next.dependsOn = dependsOn
    else delete next.dependsOn
    onChange(next)
  }
  return (
    <>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: OpenTUI box owns keyboard selection for this form. */}
      <box id={nav.selectionId} focusable flexGrow={1} minHeight={0} onKeyDown={nav.keyDown}>
        <HttpFormSection
          first
          title="CHAINING DO REQUEST"
          actions={
            <InlineButton
              id="http-extraction-add"
              label={focused ? "[N] Adicionar" : "Adicionar"}
              accent={COLORS.http}
              onPress={nav.add}
            />
          }
        >
          {null}
        </HttpFormSection>
        <scrollbox
          id={`http-automation-form-chaining-${request.id}`}
          ref={nav.scroll}
          scrollY
          viewportCulling={false}
          viewportOptions={{
            onSizeChange() {
              setContentWidth(Math.max(1, this.width - 1))
              nav.setViewport(`${this.width}:${this.height}`)
            },
          }}
          style={{ flexGrow: 1, minHeight: 1, backgroundColor: COLORS.canvas }}
        >
          <box width={contentWidth} flexShrink={0}>
            <box
              id={`http-chain-dependency-${request.id}`}
              flexShrink={0}
              border={["left"]}
              borderColor={focused && nav.row < 0 ? COLORS.http : COLORS.border}
            >
              <text content={translateUi("ANTES DO ENVIO")} fg={COLORS.http} height={1} />
              <Button
                id={`http-chain-choose-${request.id}`}
                width="100%"
                height={1}
                onPress={() => {
                  nav.select(-1, 0)
                  nav.setPickerOpen(true)
                }}
              >
                <text
                  content={
                    request.chain?.dependsOn
                      ? (plan.items.at(-2)?.request.name ?? request.chain.dependsOn)
                      : translateUi("Nenhuma dependência")
                  }
                  wrapMode="none"
                  fg={COLORS.text}
                  bg={focused && nav.row < 0 ? COLORS.diffModifiedBg : COLORS.panelAlt}
                />
              </Button>
              {plan.error ? (
                <text content={translateUi(plan.error)} fg={COLORS.danger} />
              ) : (
                <text
                  content={plan.items
                    .map((item) => `${item.request.method} ${item.request.name}`)
                    .join(" → ")}
                  fg={COLORS.muted}
                  wrapMode="none"
                  height={1}
                />
              )}
            </box>
            <text
              content={translateUi("APÓS A RESPOSTA")}
              fg={COLORS.http}
              marginTop={1}
              height={1}
              flexShrink={0}
            />
            <text
              content={translateUi("PRÉVIA DA ÚLTIMA RESPOSTA")}
              fg={COLORS.muted}
              height={1}
              flexShrink={0}
            />
            {chain.extract.length ? (
              chain.extract.map((item, index) => (
                <HttpChainingRow
                  key={item.id ?? index}
                  requestId={request.id}
                  item={item}
                  index={index}
                  focused={focused}
                  navigation={nav}
                  preview={previews[index] ?? { error: null, value: "" }}
                />
              ))
            ) : (
              <text
                content={translateUi("Extraia um valor e use {{variavel}} no próximo request.")}
                fg={COLORS.muted}
              />
            )}
          </box>
        </scrollbox>
        <box
          id={`http-chain-footer-${request.id}`}
          flexShrink={0}
          backgroundColor={COLORS.panelAlt}
        >
          <text
            content={translateUi("Variáveis valem para esta execução; segredos ficam em memória.")}
            fg={COLORS.muted}
          />
          {focused ? (
            <ShortcutText
              content={
                nav.editing
                  ? "[Tab] Campos · [Esc/Enter] Selecionar · [Ctrl+D] Excluir"
                  : "[J/K/↑/↓] Itens · [H/L/←/→] Campos · [Enter] Abrir"
              }
              style={{ fg: COLORS.muted }}
            />
          ) : null}
        </box>
      </box>
      {nav.pickerOpen ? (
        <HttpChainDependencyPicker
          request={request}
          requests={requests}
          onChange={chooseDependency}
          onClose={nav.closePicker}
        />
      ) : null}
    </>
  )
}
