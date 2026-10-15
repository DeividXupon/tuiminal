import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { COLORS, panelBorder } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { memo } from "react"
import type { GitSnapshot } from "../../model/types"
import { LOADING_FRAMES } from "../../rendering/constants"

export const GitDiffsHeader = memo(function GitDiffsHeader({
  snapshot,
  loading,
  motionFrame,
  narrow,
  onConfigure,
  actionsButtonId,
  onOpenActions,
}: {
  snapshot: GitSnapshot | null
  loading: boolean
  motionFrame: number
  narrow: boolean
  onConfigure?: (() => void) | undefined
  actionsButtonId: string
  onOpenActions: () => void
}) {
  const repository = snapshot?.isRepository
    ? `◆ ${snapshot.repositoryName}  /  ${snapshot.branch}`
    : "◆ GIT WORKSPACE"
  const status = loading
    ? `${LOADING_FRAMES[motionFrame]} ATUALIZANDO`
    : snapshot?.isRepository
      ? `↑${snapshot.ahead} ↓${snapshot.behind}`
      : "◇ FORA DE UM REPOSITÓRIO"
  return (
    <box
      id="git-diffs-header"
      style={{
        ...panelBorder(),
        backgroundColor: COLORS.panel,
        paddingLeft: 1,
        paddingRight: 1,
        flexShrink: 0,
        flexDirection: "row",
        justifyContent: "space-between",
      }}
    >
      <text
        content={repository}
        style={{
          fg: COLORS.git,
          flexGrow: 1,
          flexBasis: 0,
          minWidth: 0,
          height: 1,
          wrapMode: "none",
          truncate: true,
        }}
      />
      <InlineButton
        id="git-open-local-configuration"
        label={translateUi(narrow ? "[Ctrl+P] Alterar" : "[Ctrl+P] Alterar projeto/branch")}
        accent={COLORS.git}
        disabled={!onConfigure}
        onPress={() => onConfigure?.()}
      />
      <box
        style={{
          flexGrow: 1,
          flexBasis: 0,
          minWidth: 0,
          flexDirection: "row",
          justifyContent: "flex-end",
        }}
      >
        <text
          content={status}
          style={{
            fg: loading ? COLORS.git : COLORS.muted,
            flexShrink: 1,
            minWidth: 0,
            height: 1,
            wrapMode: "none",
            truncate: true,
          }}
        />
        <InlineButton
          id={actionsButtonId}
          label={narrow ? "[?]" : "[?] Ações"}
          accent={COLORS.git}
          onPress={onOpenActions}
        />
      </box>
    </box>
  )
})
