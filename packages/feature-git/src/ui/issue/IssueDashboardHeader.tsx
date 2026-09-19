import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { COLORS, panelBorder } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import type { IssuePreviewConfig } from "../../model/issue/config"
import { remoteHeaderControlsFit } from "../shared/remote-dashboard-layout"
import { IssueSectionStrip } from "./IssueSectionStrip"
import type { IssueDashboardPresentation } from "./presentation"

export function IssueDashboardHeader({
  presentation,
  terminalWidth,
  refreshing,
  demo,
  canCreate,
  previewVisible,
  previewPosition,
  onCreate,
  onSelectSection,
  onEditQuery,
  onTogglePreview,
  onCyclePreviewPosition,
}: {
  presentation: IssueDashboardPresentation
  terminalWidth: number
  refreshing: boolean
  demo: boolean
  canCreate: boolean
  previewVisible: boolean
  previewPosition: IssuePreviewConfig["position"]
  onCreate: () => void
  onSelectSection: (index: number) => void
  onEditQuery: () => void
  onTogglePreview: () => void
  onCyclePreviewPosition: () => void
}) {
  const previewLabel = `[P] ${translateUi("Prévia")}: ${translateUi(previewVisible ? "visível" : "oculta")}`
  const positionLabel = `[Shift+P] ${translateUi("Posição")}: ${translateUi(previewPosition)}`
  const createLabel = translateUi("[Ctrl+N] Criar issue")
  const packControls = remoteHeaderControlsFit({
    terminalWidth,
    sections: presentation.sections,
    counts: presentation.counts,
    actionLabels: [...(canCreate ? [createLabel] : []), previewLabel, positionLabel],
  })
  const sections = (
    <IssueSectionStrip
      sections={presentation.sections}
      activeIndex={presentation.sections.indexOf(presentation.section)}
      counts={presentation.counts}
      onSelect={onSelectSection}
    />
  )
  const actions = (
    <box
      id="git-issue-header-actions"
      style={{ height: 1, flexShrink: 0, flexDirection: "row", justifyContent: "flex-end" }}
    >
      {canCreate ? (
        <InlineButton
          id="git-issue-create"
          label={createLabel}
          accent={COLORS.git}
          onPress={onCreate}
        />
      ) : null}
      <InlineButton
        id="git-issue-toggle-preview"
        label={previewLabel}
        accent={COLORS.git}
        onPress={onTogglePreview}
      />
      <InlineButton
        id="git-issue-preview-position"
        label={positionLabel}
        accent={COLORS.git}
        onPress={onCyclePreviewPosition}
      />
    </box>
  )
  return (
    <>
      <box
        id="git-issue-title"
        style={{
          ...panelBorder(),
          backgroundColor: COLORS.panel,
          height: 1,
          flexShrink: 0,
          flexDirection: "row",
          justifyContent: "space-between",
          paddingLeft: 1,
          paddingRight: 1,
        }}
      >
        <text content={translateUi(presentation.title)} style={{ fg: COLORS.git }} />
        <text
          content={`${translateUi(presentation.meta)}${refreshing ? ` · ${translateUi("ATUALIZANDO TODAS AS SEÇÕES…")}` : ""}`}
          style={{ fg: demo ? COLORS.warning : COLORS.muted }}
        />
      </box>
      {packControls ? (
        <box
          id="git-issue-header-controls"
          style={{
            height: 1,
            flexShrink: 0,
            flexDirection: "row",
            justifyContent: "space-between",
          }}
        >
          {sections}
          {actions}
        </box>
      ) : (
        <>
          {actions}
          {sections}
        </>
      )}
      <box
        style={{
          height: 1,
          flexShrink: 0,
          flexDirection: "row",
          justifyContent: "space-between",
          backgroundColor: COLORS.panel,
        }}
      >
        <InlineButton
          id="git-issue-query"
          label={`[/] ${presentation.section.query}`}
          accent={COLORS.git}
          onPress={onEditQuery}
        />
        <text content={translateUi(presentation.scope)} style={{ fg: COLORS.muted }} />
      </box>
    </>
  )
}
