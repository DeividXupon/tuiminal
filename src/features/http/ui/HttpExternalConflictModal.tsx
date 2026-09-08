import type { BoxRenderable } from "@opentui/core"
import { useEffect, useRef } from "react"
import { COLORS, panelBorder } from "../../../core/settings/theme"
import { translateUi, truncateDisplay } from "../../../shared/i18n/index"
import { InlineButton } from "../../../shared/ui/InlineButton"
import { createUiSyntaxStyle } from "../../../shared/ui/syntax-style"
import type {
  HttpExternalConflictPreview,
  HttpExternalConflictResolution,
} from "../storage/conflicts"

const DIFF_SYNTAX = createUiSyntaxStyle()

function conflictDiffContent(conflict: HttpExternalConflictPreview) {
  return conflict.diff
    .map((line) => `${line.kind === "add" ? "+" : line.kind === "remove" ? "-" : " "} ${line.text}`)
    .join("\n")
}

export function HttpExternalConflictModal({
  conflict,
  busy,
  terminalWidth,
  terminalHeight,
  onResolve,
  onClose,
}: {
  conflict: HttpExternalConflictPreview
  busy: boolean
  terminalWidth: number
  terminalHeight: number
  onResolve: (resolution: HttpExternalConflictResolution) => void
  onClose: () => void
}) {
  const modalRef = useRef<BoxRenderable | null>(null)
  const width = Math.max(46, Math.min(116, terminalWidth - 4))
  const height = Math.max(12, Math.min(34, terminalHeight - 2))
  const content = conflictDiffContent(conflict)
  useEffect(() => {
    const timer = setTimeout(() => modalRef.current?.focus(), 0)
    return () => clearTimeout(timer)
  }, [])
  return (
    <box
      ref={modalRef}
      id="http-external-conflict-modal"
      focusable
      style={{
        position: "absolute",
        left: Math.max(0, Math.floor((terminalWidth - width) / 2)),
        top: Math.max(0, Math.floor((terminalHeight - height) / 2)),
        width,
        height,
        zIndex: 130,
        ...panelBorder(COLORS.warning),
        backgroundColor: COLORS.panelRaised,
        paddingLeft: 1,
        paddingRight: 1,
      }}
    >
      <box
        style={{ height: 1, flexShrink: 0, flexDirection: "row", justifyContent: "space-between" }}
      >
        <text content={translateUi("CONFLITO EXTERNO")} style={{ fg: COLORS.warning }} />
        <InlineButton
          id="http-external-conflict-close"
          label="[Esc] Voltar"
          accent={COLORS.http}
          onPress={onClose}
        />
      </box>
      <text
        content={truncateDisplay(`${conflict.requestName} · ${conflict.path}`, width - 4)}
        style={{ fg: COLORS.text }}
      />
      <text
        content={translateUi("O arquivo mudou fora do Tuiminal. Compare antes de escolher.")}
        style={{ fg: COLORS.warning }}
      />
      <text
        content={translateUi("− ARQUIVO EXTERNO · + VERSÃO LOCAL")}
        style={{ fg: COLORS.muted }}
      />
      <scrollbox
        scrollY
        scrollX
        viewportCulling
        style={{ flexGrow: 1, backgroundColor: COLORS.canvas }}
      >
        <code
          content={content}
          filetype="diff"
          syntaxStyle={DIFF_SYNTAX}
          bg={COLORS.canvas}
          wrapMode="none"
          style={{ width: "100%", height: Math.max(1, content.split("\n").length) }}
        />
      </scrollbox>
      {!conflict.canUseExternal ? (
        <text
          content={translateUi("O request original foi removido; apenas uma cópia local é segura.")}
          style={{ fg: COLORS.danger }}
        />
      ) : null}
      <box style={{ height: 2, flexShrink: 0 }}>
        <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
          <InlineButton
            id="http-external-conflict-reload"
            label="[R] Recarregar externo"
            accent={COLORS.http}
            disabled={busy || !conflict.canUseExternal}
            onPress={() => onResolve("reload")}
          />
          <InlineButton
            id="http-external-conflict-apply-local"
            label="[L] Aplicar versão local"
            accent={COLORS.warning}
            disabled={busy || !conflict.canUseExternal}
            onPress={() => onResolve("apply-local")}
          />
        </box>
        <InlineButton
          id="http-external-conflict-save-copy"
          label="[C] Salvar versão local como cópia"
          accent={COLORS.http}
          disabled={busy}
          onPress={() => onResolve("save-copy")}
        />
      </box>
    </box>
  )
}
