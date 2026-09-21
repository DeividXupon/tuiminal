import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { ShortcutText } from "@xupon/tuiminal-core/ui/ShortcutText"
import { liveDiffTotals, type LiveDiffFile } from "../model/live-diff"

export function LiveDiffInfo({
  files,
  rootsCount,
  lastProject,
  error,
  showDiffAuto,
  codeFocused,
}: {
  files: readonly LiveDiffFile[]
  rootsCount: number
  lastProject: string
  error: string
  showDiffAuto: boolean
  codeFocused: boolean
}) {
  const totals = liveDiffTotals(files)
  return (
    <box style={{ height: 5, flexShrink: 0, border: ["top"], borderColor: COLORS.border }}>
      <text wrapMode="none">
        <span fg={COLORS.terminal}>{translateUi("Info")}</span>
        <span fg={COLORS.muted}> · </span>
        <span fg={COLORS.graphAccent}>{totals.files}</span>
        <span fg={COLORS.muted}>{` ${translateUi("arquivos")} · `}</span>
        <span fg={COLORS.graphAccent}>{`+${totals.additions}`}</span>
        <span fg={COLORS.muted}> </span>
        <span fg={COLORS.danger}>{`−${totals.deletions}`}</span>
        {totals.unknown > 0 && <span fg={COLORS.warning}> · —</span>}
      </text>
      <text wrapMode="none">
        <span fg={COLORS.muted}>{`${translateUi("Último projeto")}: `}</span>
        <span fg={lastProject ? COLORS.focus : COLORS.muted}>{lastProject || "—"}</span>
      </text>
      <box
        style={{ height: 1, flexShrink: 0, flexDirection: "row", justifyContent: "space-between" }}
      >
        <text wrapMode="none" style={{ flexShrink: 0 }}>
          <span fg={COLORS.muted}>{`${translateUi("Show diff auto")}: `}</span>
          <span fg={showDiffAuto ? COLORS.success : COLORS.warning}>
            {showDiffAuto ? "true" : "false"}
          </span>
        </text>
        {codeFocused && (
          <ShortcutText
            content={showDiffAuto ? "[Esc] Voltar à lista" : "[Esc] Ativar diff auto"}
            wrapMode="none"
            style={{ fg: COLORS.muted, flexShrink: 1 }}
          />
        )}
      </box>
      <text wrapMode="none">
        {error ? (
          <span fg={COLORS.warning}>{error}</span>
        ) : (
          <>
            <span fg={COLORS.graphAccent}>{rootsCount}</span>
            <span fg={COLORS.muted}>
              {` ${translateUi("projetos observados")} · ${translateUi("atualização a cada 500 ms")}`}
            </span>
          </>
        )}
      </text>
    </box>
  )
}
