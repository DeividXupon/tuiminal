import type { KeyEvent } from "@opentui/core"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { FocusSelectionOverlay } from "@xupon/tuiminal-core/ui/FocusSelectionOverlay"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { ShortcutText } from "@xupon/tuiminal-core/ui/ShortcutText"
import type { HttpAssertionDefinition } from "../model/types"
import {
  useHttpAssertionsNavigation,
  type HttpAssertionsKeyRef,
} from "../hooks/use-http-assertions-navigation"
import { consumeHttpRequestTableKey } from "../hooks/use-http-request-tables"
import { HttpFormSection } from "./HttpRequestForm"

export function AssertionsEditor({
  requestId,
  assertions,
  focused,
  keyRef,
  onChange,
  onFocus,
}: {
  requestId: string
  assertions: HttpAssertionDefinition[]
  focused: boolean
  keyRef: HttpAssertionsKeyRef
  onChange: (assertions: HttpAssertionDefinition[]) => void
  onFocus: () => void
}) {
  const navigation = useHttpAssertionsNavigation({
    requestId,
    assertions,
    focused,
    keyRef,
    onChange,
    onFocus,
  })
  const handleKey = (key: KeyEvent) => {
    if (!key.defaultPrevented) consumeHttpRequestTableKey(key, navigation.handleKey)
  }
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: OpenTUI box is the native focusable row selector.
    <box id={navigation.selectionId} focusable flexGrow={1} minHeight={0} onKeyDown={handleKey}>
      <HttpFormSection
        first
        title="ASSERTIONS DO REQUEST"
        description="Verifique status, headers, body ou JSONPath após cada execução."
        actions={
          <InlineButton
            id="http-assertion-add"
            label={focused ? "[N] Adicionar" : "Adicionar"}
            accent={COLORS.http}
            onPress={navigation.add}
          />
        }
      >
        {null}
      </HttpFormSection>
      <scrollbox
        id={`http-automation-form-assertions-${requestId}`}
        ref={navigation.scroll}
        scrollY
        viewportCulling={false}
        viewportOptions={{
          onSizeChange() {
            navigation.setViewportSize(`${this.width}:${this.height}`)
          },
        }}
        style={{ flexGrow: 1, minHeight: 1, backgroundColor: COLORS.canvas }}
      >
        {assertions.length ? (
          assertions.map((assertion, index) => (
            <box
              id={`http-assertion-row-${assertion.id}`}
              key={assertion.id}
              flexShrink={0}
              paddingLeft={1}
              paddingRight={1}
            >
              <box height={1} flexDirection="row">
                <text content={`#${index + 1}`} flexGrow={1} fg={COLORS.muted} />
                <InlineButton
                  id={`http-assertion-delete-${assertion.id}`}
                  label="[×]"
                  accent={COLORS.danger}
                  onPress={() => navigation.remove(assertion.id)}
                />
              </box>
              <box
                id={`http-assertion-field-${assertion.id}`}
                height={3}
                flexShrink={0}
                position="relative"
              >
                <text content={translateUi("EXPRESSÃO")} height={1} fg={COLORS.muted} />
                <input
                  id={`http-automation-assertion-${assertion.id}`}
                  value={assertion.expression}
                  placeholder="status == 200"
                  width="100%"
                  onKeyDown={handleKey}
                  onMouseDown={() => navigation.select(assertion.id, true)}
                  onInput={(expression) =>
                    onChange(
                      assertions.map((item) =>
                        item.id === assertion.id ? { ...item, expression } : item,
                      ),
                    )
                  }
                  style={{
                    backgroundColor: COLORS.panelAlt,
                    focusedBackgroundColor: COLORS.panelRaised,
                    textColor: COLORS.text,
                    focusedTextColor: COLORS.text,
                    cursorColor: COLORS.http,
                  }}
                />
                {focused && !navigation.editing ? (
                  <FocusSelectionOverlay
                    id={`http-assertion-field-${assertion.id}`}
                    selected={navigation.selectedId === assertion.id}
                    onFocus={() => navigation.select(assertion.id, true)}
                  />
                ) : null}
              </box>
            </box>
          ))
        ) : (
          <text content={translateUi("Nenhuma assertion configurada.")} fg={COLORS.muted} />
        )}
      </scrollbox>
      <box
        id={`http-assertions-footer-${requestId}`}
        flexShrink={0}
        backgroundColor={COLORS.panelAlt}
      >
        <text
          content={`${translateUi("EXEMPLOS")} · status == 200 · header Content-Type contains json · jsonpath $.id exists`}
          fg={COLORS.muted}
        />
        {focused ? (
          <ShortcutText
            content={translateUi(
              navigation.editing
                ? "[Esc/Enter] Selecionar · [Tab] Próximo · [Ctrl+D] Excluir"
                : "[J/K/↑/↓] Selecionar · [Enter] Editar · [Ctrl+D] Excluir",
            )}
            style={{ fg: COLORS.muted }}
          />
        ) : null}
      </box>
    </box>
  )
}
