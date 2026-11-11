import { HttpDialog } from "./HttpDialog"
import { HttpRunnerResults } from "./HttpRunnerResults"
import { useKeyboard, useRenderer } from "@opentui/react"
import type { InputRenderable, ScrollBoxRenderable } from "@opentui/core"
import { useEffect, useRef } from "react"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { ShortcutText } from "@xupon/tuiminal-core/ui/ShortcutText"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import type { HttpRunCase } from "../services/collection-runner"
import type { HttpInsecureTlsApproval } from "../model/tls-policy"

function runnerFocusFields(running: boolean, hasApproval: boolean, hasResults: boolean) {
  return [
    ...(!running ? ["target", "concurrency"] : []),
    "dataset",
    ...(hasApproval ? ["approve-tls"] : []),
    ...(hasResults ? ["content"] : []),
    "run",
    "modal-close",
  ].map((name) => `http-collection-runner-${name}`)
}

export function HttpCollectionRunnerModal({
  targetName,
  datasetPath,
  concurrency,
  status,
  cases,
  error,
  pendingTlsApproval,
  terminalWidth,
  terminalHeight,
  onDatasetPathChange,
  onCycleTarget,
  onCycleConcurrency,
  onRun,
  onApproveInsecureTls,
  onClose,
}: {
  targetName: string | null
  datasetPath: string
  concurrency: number
  status: "idle" | "running" | "complete" | "cancelled"
  cases: HttpRunCase[]
  error: string
  pendingTlsApproval: HttpInsecureTlsApproval | null
  terminalWidth: number
  terminalHeight: number
  onDatasetPathChange: (path: string) => void
  onCycleTarget: () => void
  onCycleConcurrency: () => void
  onRun: () => void
  onApproveInsecureTls: () => void
  onClose: () => void
}) {
  const renderer = useRenderer()
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)
  const datasetRef = useRef<InputRenderable | null>(null)
  const width = Math.min(80, Math.max(24, terminalWidth - 4))
  const contentWidth = width - 5
  const wide = contentWidth >= 64
  const height = Math.min(
    status === "idle" && !error && !cases.length ? (wide ? 15 : 18) : 26,
    terminalHeight - 2,
  )
  const running = status === "running"
  const focus = (id: string) => {
    renderer.root.findDescendantById(id)?.focus()
    scrollRef.current?.scrollChildIntoView(id)
  }
  useEffect(() => {
    if (status === "running") return
    const timer = setTimeout(
      () => renderer.root.findDescendantById("http-collection-runner-target")?.focus(),
      0,
    )
    return () => clearTimeout(timer)
  }, [renderer, status])
  useKeyboard((key) => {
    if (key.defaultPrevented) return
    const focused = renderer.currentFocusedRenderable?.id ?? ""
    if (!focused.startsWith("http-collection-runner-")) return
    if (key.name === "tab") {
      key.preventDefault()
      key.stopPropagation()
      const fields = runnerFocusFields(running, Boolean(pendingTlsApproval), cases.length > 0)
      const index = fields.indexOf(focused)
      focus(
        fields[(index + (key.shift ? fields.length - 1 : 1)) % fields.length] ??
          "http-collection-runner-run",
      )
    } else if (
      key.name === "d" &&
      !key.ctrl &&
      !key.meta &&
      !key.option &&
      focused !== "http-collection-runner-dataset"
    ) {
      key.preventDefault()
      key.stopPropagation()
      focus("http-collection-runner-dataset")
    }
  })
  const statusLabel = {
    idle: "PRONTO",
    running: "EXECUTANDO…",
    complete: "CONCLUÍDO",
    cancelled: "CANCELADO",
  }[status]

  return (
    <HttpDialog
      id="http-collection-runner-modal"
      title={"EXECUTAR COLEÇÃO"}
      width={width}
      height={height}
      terminalWidth={terminalWidth}
      terminalHeight={terminalHeight}
      closeLabel={running ? "[Esc] Cancelar" : "[Esc] Fechar"}
      onClose={onClose}
    >
      <scrollbox
        ref={scrollRef}
        id="http-collection-runner-content"
        scrollY
        viewportCulling={false}
        focusable
        style={{ flexGrow: 1, minHeight: 0, overflow: "hidden" }}
      >
        <box
          style={{
            flexDirection: wide ? "row" : "column",
            flexShrink: 0,
            gap: 1,
            paddingBottom: 1,
          }}
        >
          <box style={{ flexGrow: 1, minWidth: 0, width: wide ? "60%" : "100%", flexShrink: 0 }}>
            <text content={translateUi("REQUISIÇÕES A EXECUTAR")} style={{ fg: COLORS.muted }} />
            <box style={{ height: 1, flexDirection: "row" }}>
              <text
                id="http-collection-runner-target-name"
                content={truncateDisplay(
                  targetName ?? translateUi("Todas as requisições"),
                  (wide ? Math.floor(contentWidth * 0.6) : contentWidth) - 16,
                )}
                style={{ fg: COLORS.text, flexGrow: 1, minWidth: 0 }}
              />
              <InlineButton
                id="http-collection-runner-target"
                label="[T] Próxima"
                accent={COLORS.http}
                disabled={running}
                onPress={onCycleTarget}
              />
            </box>
          </box>
          <box style={{ flexShrink: 0 }}>
            <text content={translateUi("CASOS EM PARALELO")} style={{ fg: COLORS.muted }} />
            <InlineButton
              id="http-collection-runner-concurrency"
              label={`[C] ${concurrency} / 8`}
              accent={COLORS.http}
              disabled={running}
              onPress={onCycleConcurrency}
            />
          </box>
        </box>
        <text content={translateUi("DADOS DE TESTE · OPCIONAL")} style={{ fg: COLORS.muted }} />
        <box style={{ flexDirection: "row", height: 1, flexShrink: 0 }}>
          <input
            ref={datasetRef}
            id="http-collection-runner-dataset"
            value={datasetPath}
            placeholder={translateUi("data.json ou data.csv")}
            onInput={onDatasetPathChange}
            onSubmit={() => focus("http-collection-runner-run")}
            onMouseDown={() => datasetRef.current?.focus()}
            style={{
              flexGrow: 1,
              width: 0,
              minWidth: 0,
              backgroundColor: COLORS.canvas,
              focusedBackgroundColor: COLORS.panelRaised,
            }}
          />
          <InlineButton
            id="http-collection-runner-edit-dataset"
            label="[D] Editar"
            accent={COLORS.http}
            onPress={() => focus("http-collection-runner-dataset")}
          />
        </box>
        <text
          content={translateUi("JSON ou CSV da biblioteca HTTP. Vazio: um único caso.")}
          style={{ fg: COLORS.muted, flexShrink: 0 }}
        />
        {datasetPath ? (
          <text
            content={translateUi(
              "Cada linha é um caso; o paralelismo limita os casos simultâneos.",
            )}
            style={{ fg: COLORS.muted, flexShrink: 0 }}
          />
        ) : null}
        {error ? (
          <text
            id="http-collection-runner-error"
            content={translateUi(error)}
            style={{ fg: COLORS.danger, flexShrink: 0, marginTop: 1 }}
          />
        ) : null}
        {pendingTlsApproval ? (
          <box style={{ height: 2, flexShrink: 0 }}>
            <text
              content={truncateDisplay(
                `${translateUi("TLS INSEGURO")} · ${pendingTlsApproval.target}`,
                contentWidth,
              )}
              style={{ fg: COLORS.danger }}
            />
            <InlineButton
              id="http-collection-runner-approve-tls"
              label="[I] Autorizar nesta sessão"
              accent={COLORS.danger}
              onPress={onApproveInsecureTls}
            />
          </box>
        ) : null}
        {status !== "idle" || cases.length ? (
          <box style={{ flexShrink: 0, marginTop: 1 }}>
            <text content={translateUi("RESULTADOS")} style={{ fg: COLORS.muted }} />
            {running ? (
              <text
                content={translateUi("Execução em andamento. Você pode cancelar abaixo.")}
                style={{ fg: COLORS.text }}
              />
            ) : null}
            <HttpRunnerResults cases={cases} width={contentWidth} />
          </box>
        ) : null}
      </scrollbox>
      <box
        id="http-collection-runner-footer"
        style={{ flexShrink: 0, paddingTop: height >= 18 ? 1 : 0 }}
      >
        <ShortcutText
          content={translateUi("[Tab] Próximo campo · [Shift+Tab] Anterior")}
          style={{ fg: COLORS.muted, flexShrink: 0 }}
        />
        <box
          style={{
            minHeight: 1,
            flexShrink: 0,
            flexDirection: "row",
            flexWrap: "wrap",
            justifyContent: "space-between",
          }}
        >
          <text
            content={translateUi(statusLabel)}
            style={{ fg: running ? COLORS.warning : COLORS.muted }}
          />
          <InlineButton
            id="http-collection-runner-run"
            label={status === "running" ? "[Esc] Cancelar" : "[Ctrl+Enter] Executar"}
            accent={status === "running" ? COLORS.danger : COLORS.http}
            onPress={onRun}
          />
        </box>
      </box>
    </HttpDialog>
  )
}
