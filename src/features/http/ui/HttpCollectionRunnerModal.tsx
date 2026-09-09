import type { InputRenderable } from "@opentui/core"
import { useEffect, useRef } from "react"
import { COLORS, panelBorder } from "../../../core/settings/theme"
import { translateUi, truncateDisplay } from "../../../shared/i18n/index"
import { InlineButton } from "../../../shared/ui/InlineButton"
import type { HttpRunCase } from "../services/collection-runner"
import type { HttpInsecureTlsApproval } from "../model/tls-policy"

function runItemPassed(item: HttpRunCase["items"][number]) {
  return (
    Boolean(item.response) &&
    !item.error &&
    (item.response?.assertions ?? []).every((assertion) => assertion.passed)
  )
}

function RunnerResults({ cases, width }: { cases: HttpRunCase[]; width: number }) {
  if (!cases.length) {
    return (
      <text content={translateUi("Os resultados aparecerão aqui.")} style={{ fg: COLORS.muted }} />
    )
  }
  return (
    <scrollbox scrollY viewportCulling style={{ flexGrow: 1, paddingTop: 1 }}>
      {cases.flatMap((testCase) => {
        const passed = testCase.items.filter(runItemPassed).length
        const casePassed = passed === testCase.items.length && Boolean(testCase.items.length)
        return [
          <text
            key={`case-${testCase.name}`}
            content={truncateDisplay(
              `${casePassed ? "✓" : "×"} ${testCase.name} · ${passed}/${testCase.items.length}`,
              width,
            )}
            style={{ fg: casePassed ? COLORS.success : COLORS.danger }}
          />,
          ...testCase.items.map((item) => {
            const itemPassed = runItemPassed(item)
            const detail = item.error
              ? translateUi(item.error.message)
              : `${item.response?.status ?? "—"} · ${item.method} ${item.requestName}`
            return (
              <text
                key={`${testCase.name}-${item.requestId}`}
                content={truncateDisplay(`  ${itemPassed ? "✓" : "×"} ${detail}`, width)}
                style={{ fg: itemPassed ? COLORS.text : COLORS.warning }}
              />
            )
          }),
        ]
      })}
    </scrollbox>
  )
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
  const datasetRef = useRef<InputRenderable | null>(null)
  const width = Math.min(86, Math.max(42, terminalWidth - 4))
  const height = Math.min(24, Math.max(12, terminalHeight - 4))
  const contentWidth = width - 4
  useEffect(() => {
    if (status !== "idle") return
    const timer = setTimeout(() => datasetRef.current?.focus(), 0)
    return () => clearTimeout(timer)
  }, [status])
  const statusLabel = {
    idle: "PRONTO",
    running: "EXECUTANDO…",
    complete: "CONCLUÍDO",
    cancelled: "CANCELADO",
  }[status]

  return (
    <box
      id="http-collection-runner-modal"
      style={{
        position: "absolute",
        left: Math.max(0, Math.floor((terminalWidth - width) / 2)),
        top: Math.max(0, Math.floor((terminalHeight - height) / 2) - 1),
        width,
        height,
        zIndex: 110,
        ...panelBorder(COLORS.http),
        backgroundColor: COLORS.panelRaised,
        paddingLeft: 1,
        paddingRight: 1,
      }}
    >
      <box
        style={{ height: 1, flexShrink: 0, flexDirection: "row", justifyContent: "space-between" }}
      >
        <text content={translateUi("EXECUTAR COLEÇÃO")} style={{ fg: COLORS.http }} />
        <InlineButton label="[Esc] Fechar" accent={COLORS.http} onPress={onClose} />
      </box>
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
        <InlineButton
          label={targetName ? `[T] Alvo: ${targetName}` : "[T] Alvo: TODOS"}
          accent={COLORS.http}
          onPress={onCycleTarget}
        />
        <InlineButton
          label={`[C] Concorrência: ${concurrency}`}
          accent={COLORS.http}
          onPress={onCycleConcurrency}
        />
      </box>
      <text content={translateUi("DATASET OPCIONAL NO PROJETO")} style={{ fg: COLORS.muted }} />
      <input
        ref={datasetRef}
        id="http-collection-runner-dataset"
        value={datasetPath}
        placeholder={translateUi("data.json ou data.csv")}
        onInput={onDatasetPathChange}
        onSubmit={onRun}
        onMouseDown={() => datasetRef.current?.focus()}
        style={{
          backgroundColor: COLORS.canvas,
          focusedBackgroundColor: COLORS.panelRaised,
        }}
      />
      <text
        content={`${translateUi("STATUS")}  ${translateUi(statusLabel)}`}
        style={{ fg: status === "running" ? COLORS.warning : COLORS.muted }}
      />
      {error ? <text content={translateUi(error)} style={{ fg: COLORS.danger }} /> : null}
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
      <RunnerResults cases={cases} width={contentWidth} />
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row", justifyContent: "flex-end" }}>
        <InlineButton
          id="http-collection-runner-run"
          label={status === "running" ? "[X] Cancelar" : "[Ctrl+Enter] Executar"}
          accent={status === "running" ? COLORS.danger : COLORS.http}
          onPress={onRun}
        />
      </box>
    </box>
  )
}
