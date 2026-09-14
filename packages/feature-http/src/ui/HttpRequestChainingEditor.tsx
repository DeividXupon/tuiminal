import type { InputRenderable } from "@opentui/core"
import { useRef } from "react"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { createHttpExtractionDraft } from "../model/automation"
import type { HttpChainExtraction, HttpRequestDefinition } from "../model/types"

export function HttpRequestChainingEditor({
  requestId,
  chain,
  focused,
  onChange,
  onFocus,
}: {
  requestId: string
  chain: NonNullable<HttpRequestDefinition["chain"]>
  focused: boolean
  onChange: (chain: NonNullable<HttpRequestDefinition["chain"]>) => void
  onFocus: () => void
}) {
  const dependencyRef = useRef<InputRenderable | null>(null)
  const inputs = useRef(new Map<string, InputRenderable>())
  const patch = (index: number, value: Partial<HttpChainExtraction>) =>
    onChange({
      ...chain,
      extract: chain.extract.map((item, candidate) =>
        candidate === index ? { ...item, ...value } : item,
      ),
    })
  const remove = (index: number) =>
    onChange({ ...chain, extract: chain.extract.filter((_, candidate) => candidate !== index) })
  const add = () =>
    onChange({ ...chain, extract: [...chain.extract, createHttpExtractionDraft(requestId)] })
  return (
    <box style={{ flexGrow: 1, paddingTop: 1 }}>
      <text content={translateUi("CHAINING DO REQUEST")} style={{ fg: COLORS.text }} />
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
        <text content={translateUi("DEPENDÊNCIA")} style={{ width: 14, fg: COLORS.muted }} />
        <input
          ref={dependencyRef}
          id={`http-automation-dependency-${requestId}`}
          value={chain.dependsOn ?? ""}
          placeholder={translateUi("@name do request anterior")}
          width="70%"
          onInput={(dependsOn) => {
            const next = { ...chain }
            if (dependsOn) next.dependsOn = dependsOn
            else delete next.dependsOn
            onChange(next)
          }}
          onMouseDown={() => {
            onFocus()
            dependencyRef.current?.focus()
          }}
          style={{ backgroundColor: COLORS.canvas, focusedBackgroundColor: COLORS.panelRaised }}
        />
      </box>
      <text
        content={translateUi("O request dependente executa depois deste alvo.")}
        style={{ fg: COLORS.muted }}
      />
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
        <text content={translateUi("EXTRAÇÕES")} style={{ flexGrow: 1, fg: COLORS.text }} />
        {focused ? (
          <InlineButton
            id="http-extraction-add"
            label="[N] Adicionar"
            accent={COLORS.http}
            onPress={add}
          />
        ) : null}
      </box>
      <scrollbox scrollY viewportCulling style={{ flexGrow: 1, backgroundColor: COLORS.canvas }}>
        {chain.extract.length ? (
          chain.extract.map((extraction, index) => {
            const key = extraction.id ?? `${requestId}-extraction-${index}`
            return (
              <box key={key} style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
                <InlineButton
                  label={extraction.secret ? "● SECRETO" : "○ PÚBLICO"}
                  accent={extraction.secret ? COLORS.warning : COLORS.http}
                  active={extraction.secret}
                  onPress={() => patch(index, { secret: !extraction.secret })}
                />
                <input
                  ref={(input) => {
                    if (input) inputs.current.set(`${index}-name`, input)
                    else inputs.current.delete(`${index}-name`)
                  }}
                  id={`http-automation-extraction-name-${requestId}-${index}`}
                  value={extraction.name}
                  placeholder={translateUi("NOME DA VARIÁVEL")}
                  width="28%"
                  onInput={(name) => patch(index, { name })}
                  onKeyDown={(event) => {
                    if (!event.ctrl || event.name !== "d") return
                    event.preventDefault()
                    event.stopPropagation()
                    remove(index)
                  }}
                  onMouseDown={() => {
                    onFocus()
                    inputs.current.get(`${index}-name`)?.focus()
                  }}
                  style={{
                    backgroundColor: COLORS.canvas,
                    focusedBackgroundColor: COLORS.panelRaised,
                  }}
                />
                <input
                  ref={(input) => {
                    if (input) inputs.current.set(`${index}-path`, input)
                    else inputs.current.delete(`${index}-path`)
                  }}
                  id={`http-automation-extraction-path-${requestId}-${index}`}
                  value={extraction.jsonPath}
                  placeholder="$.token"
                  width="28%"
                  onInput={(jsonPath) => patch(index, { jsonPath })}
                  onKeyDown={(event) => {
                    if (!event.ctrl || event.name !== "d") return
                    event.preventDefault()
                    event.stopPropagation()
                    remove(index)
                  }}
                  onMouseDown={() => {
                    onFocus()
                    inputs.current.get(`${index}-path`)?.focus()
                  }}
                  style={{
                    backgroundColor: COLORS.canvas,
                    focusedBackgroundColor: COLORS.panelRaised,
                  }}
                />
                <InlineButton label="[×]" accent={COLORS.danger} onPress={() => remove(index)} />
              </box>
            )
          })
        ) : (
          <text
            content={translateUi("Nenhuma extração configurada.")}
            style={{ fg: COLORS.muted }}
          />
        )}
      </scrollbox>
      <text
        content={translateUi(
          "Extrações secretas ficam somente em memória e nunca entram em relatórios.",
        )}
        style={{ fg: COLORS.muted }}
      />
    </box>
  )
}
