import { basename } from "node:path"
import { displayWidth, translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { ShortcutText } from "@xupon/tuiminal-core/ui/ShortcutText"
import { type LiveDiffFile, liveDiffTotals } from "../model/live-diff"

function projectRows(roots: readonly string[], firstWidth: number, fullWidth: number) {
  const rows: Array<Array<{ root: string; index: number; label: string }>> = [[]]
  let used = 0
  roots.forEach((root, index) => {
    const label = truncateDisplay(`/${basename(root)}`, Math.max(1, firstWidth - 1))
    const chipWidth = 1 + displayWidth(label)
    const available = rows.length === 1 ? firstWidth : fullWidth
    if (used && used + chipWidth + 1 > available) {
      rows.push([])
      used = 0
    }
    rows[rows.length - 1]!.push({ root, index, label })
    used += chipWidth + (used ? 1 : 0)
  })
  if (rows.length > 1 && rows.at(-1)!.length === 1 && rows.at(-2)!.length > 1) {
    const previous = rows.at(-2)!
    const last = rows.at(-1)!
    const moved = previous.at(-1)!
    const lastWidth = [moved, ...last].reduce((sum, chip) => sum + 1 + displayWidth(chip.label), 1)
    if (lastWidth <= fullWidth) {
      previous.pop()
      last.unshift(moved)
    }
  }
  return rows
}

export function LiveDiffInfo({
  sessionId,
  width,
  files,
  roots,
  selectedProject,
  hiddenRoots,
  onSelectProject,
  onAddProject,
  lastProject,
  error,
  showDiffAuto,
  codeFocused,
}: {
  sessionId: string
  width: number
  files: readonly LiveDiffFile[]
  roots: readonly string[]
  selectedProject: string | null
  hiddenRoots: readonly string[]
  onSelectProject: (root: string, event: { stopPropagation: () => void }) => void
  onAddProject: () => void
  lastProject: string
  error: string
  showDiffAuto: boolean
  codeFocused: boolean
}) {
  const totals = liveDiffTotals(files)
  const projectsLabel = `${translateUi("Observando")}: `
  const projectsLabelWidth = displayWidth(projectsLabel)
  const rows = projectRows(roots, Math.max(1, width - projectsLabelWidth - 1), width)
  const projectsHeight = rows.length
  const hintLabel = translateUi("[H/L] projeto · [N] visibilidade · [X] Fechar")
  const addLabel = translateUi("[A] Adicionar projeto")
  const sharedFooter = !error && displayWidth(hintLabel) + displayWidth(addLabel) + 3 <= width
  const footerHeight = sharedFooter ? 1 : 2
  const totalsWidth = displayWidth(
    `${totals.files} ${translateUi("arquivos")} · +${totals.additions} −${totals.deletions}${totals.unknown > 0 ? " · —" : ""}`,
  )
  const lastSpace = Math.max(1, width - totalsWidth - 1)
  const lastPrefix = `${translateUi("Último")}: `
  const lastName = lastProject ? basename(lastProject) : "—"
  const shortLastPrefix = truncateDisplay(lastPrefix, lastSpace)
  const shortLastName =
    lastSpace > displayWidth(lastPrefix)
      ? truncateDisplay(lastName, lastSpace - displayWidth(lastPrefix))
      : ""
  return (
    <box
      id={`live-diff-info-${sessionId}`}
      style={{
        height: 2 + projectsHeight + footerHeight,
        flexShrink: 0,
        border: ["top"],
        borderColor: COLORS.border,
      }}
    >
      <box
        style={{
          width: "100%",
          height: 1,
          flexShrink: 0,
          flexDirection: "row",
          justifyContent: "space-between",
        }}
      >
        <text wrapMode="none" style={{ flexShrink: 0 }}>
          <span fg={COLORS.graphAccent}>{totals.files}</span>
          <span fg={COLORS.muted}>{` ${translateUi("arquivos")} · `}</span>
          <span fg={COLORS.graphAccent}>{`+${totals.additions}`}</span>
          <span fg={COLORS.muted}> </span>
          <span fg={COLORS.danger}>{`−${totals.deletions}`}</span>
          {totals.unknown > 0 && <span fg={COLORS.warning}> · —</span>}
        </text>
        <text wrapMode="none" style={{ flexShrink: 0 }}>
          <span fg={COLORS.muted}>{shortLastPrefix}</span>
          <span fg={lastProject ? COLORS.focus : COLORS.muted}>{shortLastName}</span>
        </text>
      </box>
      <box
        id={`live-diff-projects-${sessionId}`}
        style={{ height: projectsHeight, flexShrink: 0, flexDirection: "column" }}
      >
        {rows.map((row, rowIndex) => (
          <box
            key={row[0]?.root ?? "empty"}
            style={{ height: 1, flexShrink: 0, flexDirection: "row", gap: 1 }}
          >
            {rowIndex === 0 && (
              <text
                content={projectsLabel}
                style={{ width: projectsLabelWidth, fg: COLORS.muted, flexShrink: 0 }}
              />
            )}
            {!row.length && <text content="—" style={{ fg: COLORS.muted }} />}
            {row.map(({ root, index, label }) => (
              // biome-ignore lint/a11y/noStaticElementInteractions: project selection also works with H/L.
              <box
                key={root}
                id={`live-diff-project-${index}`}
                onMouseDown={(event) => onSelectProject(root, event)}
                style={{
                  height: 1,
                  flexShrink: 0,
                  backgroundColor: hiddenRoots.includes(root) ? COLORS.panelAlt : COLORS.success,
                }}
              >
                <text
                  content={`${selectedProject === root ? "›" : " "}${label}`}
                  wrapMode="none"
                  style={{ fg: hiddenRoots.includes(root) ? COLORS.muted : COLORS.canvas }}
                />
              </box>
            ))}
          </box>
        ))}
      </box>
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
        {codeFocused ? (
          <ShortcutText
            content={
              showDiffAuto
                ? "[Esc] Voltar à lista · [X] Fechar"
                : "[Esc] Ativar diff auto · [X] Fechar"
            }
            wrapMode="none"
            style={{ fg: COLORS.muted }}
          />
        ) : error ? (
          <text content={error} style={{ fg: COLORS.warning }} />
        ) : (
          <ShortcutText
            content="[H/L] projeto · [N] visibilidade · [X] Fechar"
            wrapMode="none"
            style={{ fg: COLORS.muted }}
          />
        )}
        {sharedFooter && !codeFocused && (
          <InlineButton
            compact
            id={`live-diff-add-${sessionId}`}
            label="[A] Adicionar projeto"
            onPress={onAddProject}
          />
        )}
      </box>
      {!codeFocused && !sharedFooter && (
        <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
          <InlineButton
            compact
            id={`live-diff-add-${sessionId}`}
            label="[A] Adicionar projeto"
            onPress={onAddProject}
          />
        </box>
      )}
    </box>
  )
}
