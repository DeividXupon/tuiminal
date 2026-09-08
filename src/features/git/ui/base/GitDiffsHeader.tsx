import { memo } from "react"
import { COLORS, panelBorder } from "../../../../core/settings/theme"
import { translateUi } from "../../../../shared/i18n"
import { InlineButton } from "../../../../shared/ui/InlineButton"
import type { GitSnapshot } from "../../model/types"
import { LOADING_FRAMES } from "../../rendering/constants"
import { fitLine } from "../../rendering/diff"

export const GitDiffsHeader = memo(function GitDiffsHeader({
  snapshot,
  loading,
  motionFrame,
  stagedCount,
  unstagedCount,
  narrow,
  terminalWidth,
  onConfigure,
}: {
  snapshot: GitSnapshot | null
  loading: boolean
  motionFrame: number
  stagedCount: number
  unstagedCount: number
  narrow: boolean
  terminalWidth: number
  onConfigure?: (() => void) | undefined
}) {
  const repository = snapshot?.isRepository
    ? `◆ ${snapshot.repositoryName}  /  ${snapshot.branch}`
    : "◆ GIT WORKSPACE"
  const status = loading
    ? `${LOADING_FRAMES[motionFrame]} ATUALIZANDO`
    : snapshot?.isRepository
      ? narrow
        ? `●${stagedCount} ○${unstagedCount}`
        : `${snapshot.files.length} ALT  ●${stagedCount} ○${unstagedCount}  ↑${snapshot.ahead} ↓${snapshot.behind}`
      : "◇ FORA DE UM REPOSITÓRIO"
  return (
    <box
      id="git-diffs-header"
      style={{
        ...panelBorder(),
        backgroundColor: COLORS.panel,
        paddingLeft: 1,
        paddingRight: 1,
        flexDirection: "row",
        justifyContent: "space-between",
      }}
    >
      <box style={{ flexGrow: 1, flexDirection: "row" }}>
        <text
          content={fitLine(
            repository,
            narrow ? Math.max(10, terminalWidth - 34) : Math.max(18, terminalWidth - 72),
          )}
          style={{ fg: COLORS.git }}
        />
        <InlineButton
          id="git-open-local-configuration"
          label={translateUi(narrow ? "[Ctrl+P] Alterar" : "[Ctrl+P] Alterar projeto/branch")}
          accent={COLORS.git}
          disabled={!onConfigure}
          onPress={() => onConfigure?.()}
        />
      </box>
      <text content={status} style={{ fg: loading ? COLORS.git : COLORS.muted }} />
    </box>
  )
})
