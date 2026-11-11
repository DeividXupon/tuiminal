import type { BoxRenderable } from "@opentui/core"
import { translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { createUiSyntaxStyle } from "@xupon/tuiminal-core/ui/syntax-style"
import { useEffect, useRef } from "react"
import type {
  HttpExternalConflictPreview,
  HttpExternalConflictResolution,
} from "../storage/conflicts"
import { HttpDialog } from "./HttpDialog"
import { HttpDialogNotice, HttpDialogSection } from "./HttpDialogDetails"

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
  const width = Math.max(1, Math.min(116, terminalWidth - 2))
  const height = Math.max(
    1,
    Math.min(
      34,
      terminalHeight - 2,
      14 + Math.max(1, conflict.diff.length) + (conflict.canUseExternal ? 0 : 2),
    ),
  )
  const content = conflictDiffContent(conflict)
  const short = terminalHeight < 20
  const diff = (
    <code
      content={content}
      filetype="diff"
      syntaxStyle={DIFF_SYNTAX}
      bg={COLORS.canvas}
      wrapMode="none"
      style={{ width: "100%", height: Math.max(1, content.split("\n").length), flexShrink: 0 }}
    />
  )
  useEffect(() => {
    const timer = setTimeout(() => modalRef.current?.focus(), 0)
    return () => clearTimeout(timer)
  }, [])
  return (
    <HttpDialog
      id="http-external-conflict-modal"
      scrollContent={short}
      title={"CONFLITO EXTERNO"}
      width={width}
      height={height}
      terminalWidth={terminalWidth}
      terminalHeight={terminalHeight}
      onClose={onClose}
      accent={COLORS.warning}
      dialogRef={modalRef}
      zIndex={130}
      closeLabel="[Esc] Voltar"
      closeId="http-external-conflict-close"
      actions={[
        {
          id: "http-external-conflict-reload",
          label: "[R] Recarregar externo",
          disabled: busy || !conflict.canUseExternal,
          onPress: () => onResolve("reload"),
        },
        {
          id: "http-external-conflict-apply-local",
          label: "[L] Aplicar versão local",
          accent: COLORS.warning,
          disabled: busy || !conflict.canUseExternal,
          onPress: () => onResolve("apply-local"),
        },
        {
          id: "http-external-conflict-save-copy",
          label: "[C] Salvar versão local como cópia",
          shortLabel: "[C] Salvar cópia",
          disabled: busy,
          onPress: () => onResolve("save-copy"),
        },
      ]}
    >
      <HttpDialogSection accent={COLORS.warning}>
        <text
          content={truncateDisplay(conflict.requestName, width - 7)}
          style={{ fg: COLORS.text }}
        />
        <text
          content={truncateDisplay(conflict.path, width - 7)}
          wrapMode="none"
          style={{ fg: COLORS.muted, height: 1 }}
        />
      </HttpDialogSection>
      <HttpDialogNotice
        text="O arquivo mudou fora do Tuiminal. Compare antes de escolher."
        warning
      />
      <text
        content={translateUi("− ARQUIVO EXTERNO · + VERSÃO LOCAL")}
        style={{ fg: COLORS.muted }}
      />
      {short ? (
        diff
      ) : (
        <scrollbox
          scrollY
          scrollX
          viewportCulling
          style={{ flexGrow: 1, minHeight: 1, backgroundColor: COLORS.canvas }}
        >
          {diff}
        </scrollbox>
      )}
      {!conflict.canUseExternal ? (
        <text
          content={translateUi("O request original foi removido; apenas uma cópia local é segura.")}
          style={{ fg: COLORS.danger, flexShrink: 0 }}
        />
      ) : null}
    </HttpDialog>
  )
}
