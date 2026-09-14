import { useTerminalDimensions } from "@opentui/react"
import { COLORS, LAYOUT, panelBorder } from "@xupon/tuiminal-core/settings/theme"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { ShortcutText } from "@xupon/tuiminal-core/ui/ShortcutText"

export function HttpTutorialDemo() {
  const terminal = useTerminalDimensions()
  const narrow = terminal.width < 92
  const noop = () => {}

  const collection = (
    <box
      id="tutorial-http-collection"
      style={{
        ...panelBorder(),
        width: narrow ? "100%" : "25%",
        height: narrow ? 5 : "100%",
        flexShrink: 0,
        backgroundColor: COLORS.panel,
      }}
    >
      <text content={translateUi("PROJETO")} style={{ fg: COLORS.http }} />
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
        <InlineButton label={translateUi("[I] Importar")} accent={COLORS.http} onPress={noop} />
        <InlineButton label={translateUi("[R] Rodar")} accent={COLORS.http} onPress={noop} />
      </box>
      <text content="▾ api" style={{ fg: COLORS.muted }} />
      <text content={`  ◆ ${translateUi("GET Buscar usuário")}`} style={{ fg: COLORS.text }} />
      <text content={`  ◇ ${translateUi("POST Criar usuário")}`} style={{ fg: COLORS.muted }} />
    </box>
  )

  return (
    <box style={{ flexGrow: 1, backgroundColor: COLORS.canvas, gap: LAYOUT.gap }}>
      <box
        id="tutorial-http-documents"
        style={{ height: 1, flexShrink: 0, flexDirection: "row", backgroundColor: COLORS.panel }}
      >
        <InlineButton
          label={`${translateUi("GET Buscar usuário")} ●`}
          accent={COLORS.http}
          active
          onPress={noop}
        />
        <InlineButton
          label={translateUi("POST Criar usuário")}
          accent={COLORS.http}
          onPress={noop}
        />
        <InlineButton label="[Ctrl+N]" accent={COLORS.http} onPress={noop} />
      </box>
      <box
        id="tutorial-http-omnibar"
        style={{
          ...panelBorder(COLORS.http),
          height: 3,
          flexShrink: 0,
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: COLORS.panel,
        }}
      >
        <InlineButton label="GET" accent={COLORS.http} active onPress={noop} />
        <text
          content="https://api.example.test/users/42"
          style={{ flexGrow: 1, fg: COLORS.text }}
        />
        <InlineButton label="[E] dev" accent={COLORS.http} onPress={noop} />
        <InlineButton
          label={translateUi("[S] Enviar")}
          accent={COLORS.http}
          active
          onPress={noop}
        />
      </box>
      <box
        style={{
          flexGrow: 1,
          flexDirection: narrow ? "column" : "row",
          gap: LAYOUT.gap,
        }}
      >
        {collection}
        <box style={{ flexGrow: 1, flexDirection: "row", gap: LAYOUT.gap }}>
          <box
            id="tutorial-http-request"
            style={{
              ...panelBorder(),
              width: "50%",
              backgroundColor: COLORS.panel,
            }}
          >
            <text content={translateUi("REQUISIÇÃO")} style={{ fg: COLORS.http }} />
            <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
              {["Parâmetros", "Headers", "Body", "Autenticação", "Mais"].map((label) => (
                <InlineButton
                  key={label}
                  label={translateUi(label)}
                  accent={COLORS.http}
                  onPress={noop}
                />
              ))}
            </box>
            <text content="id = 42" style={{ fg: COLORS.text }} />
            <text content="Accept: application/json" style={{ fg: COLORS.text }} />
            <box
              id="tutorial-http-automation"
              style={{
                ...panelBorder(COLORS.http),
                flexGrow: 1,
                marginTop: 1,
                backgroundColor: COLORS.panelRaised,
              }}
            >
              <text
                content={translateUi("ASSERTIONS · CHAINING · PREVIEW")}
                style={{ fg: COLORS.http }}
              />
              <text content="status == 200  ✓" style={{ fg: COLORS.success }} />
              <text
                content={translateUi("TOKEN EXTRAÍDO · VOLÁTIL")}
                style={{ fg: COLORS.warning }}
              />
              <text
                content={translateUi("TLS ESTRITO · PROXY DIRETO · COOKIE JAR")}
                style={{ fg: COLORS.muted }}
              />
            </box>
          </box>
          <box
            id="tutorial-http-response"
            style={{ ...panelBorder(COLORS.http), flexGrow: 1, backgroundColor: COLORS.panel }}
          >
            <text content={translateUi("RESPOSTA")} style={{ fg: COLORS.http }} />
            <text content="200 OK · 42 ms · 1.2 KB" style={{ fg: COLORS.success }} />
            <ShortcutText
              content={`${translateUi("Pretty")}  ${translateUi("Raw")}  ${translateUi("Headers")}  ${translateUi("Timing")}  ${translateUi("Mais")}  [Ctrl+F]`}
              style={{ height: 1, flexShrink: 0, fg: COLORS.muted }}
            />
            <text content={'{\n  "id": 42,\n  "name": "Ada"\n}'} style={{ fg: COLORS.text }} />
          </box>
        </box>
      </box>
    </box>
  )
}
