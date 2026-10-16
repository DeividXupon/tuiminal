import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { remoteHeaderControlsFit } from "../shared/remote-dashboard-layout"
import type { PullRequestDashboardPresentation } from "./presentation"
import { SectionStrip } from "./SectionStrip"

export function PullRequestDashboardHeader({
  presentation,
  terminalWidth,
  refreshing,
  demo,
  canCreate,
  onCreate,
  onSelectSection,
  onEditQuery,
  onOpenActions,
}: {
  presentation: PullRequestDashboardPresentation
  terminalWidth: number
  refreshing: boolean
  demo: boolean
  canCreate: boolean
  onCreate: () => void
  onSelectSection: (index: number) => void
  onEditQuery: () => void
  onOpenActions: () => void
}) {
  const createLabel = translateUi("[Ctrl+N] Criar PR")
  const packControls =
    !canCreate ||
    remoteHeaderControlsFit({
      terminalWidth,
      sections: presentation.sections,
      counts: presentation.counts,
      actionLabels: canCreate ? [createLabel] : [],
    })
  const sections = (
    <SectionStrip
      sections={presentation.sections}
      activeIndex={presentation.sections.indexOf(presentation.section)}
      counts={presentation.counts}
      onSelect={onSelectSection}
    />
  )
  const actions = (
    <box
      id="git-pr-header-actions"
      style={{ height: 1, flexShrink: 0, flexDirection: "row", justifyContent: "flex-end" }}
    >
      {canCreate ? (
        <InlineButton
          id="git-pr-create"
          label={createLabel}
          accent={COLORS.git}
          onPress={onCreate}
        />
      ) : null}
    </box>
  )
  return (
    <>
      <box
        id="git-pr-title"
        style={{
          backgroundColor: COLORS.panel,
          height: 1,
          flexShrink: 0,
          flexDirection: "row",
          justifyContent: "space-between",
          paddingLeft: 1,
          paddingRight: 1,
        }}
      >
        <box style={{ flexDirection: "row", height: 1, gap: 1, minWidth: 0 }}>
          <text
            id="git-pr-title-label"
            content={translateUi(presentation.title)}
            wrapMode="none"
            truncate
            style={{ fg: COLORS.git, minWidth: 0 }}
          />
          <InlineButton
            id="git-pr-open-actions"
            label="[?] Ações"
            accent={COLORS.git}
            onPress={onOpenActions}
          />
        </box>
        <text
          content={`${translateUi(presentation.meta)}${refreshing ? ` · ${translateUi("ATUALIZANDO TODAS AS SEÇÕES…")}` : ""}`}
          wrapMode="none"
          truncate
          style={{ fg: demo ? COLORS.warning : COLORS.muted, minWidth: 0, flexShrink: 1 }}
        />
      </box>
      {packControls ? (
        <box
          id="git-pr-header-controls"
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
          id="git-pr-query"
          label={`[/] ${presentation.section.query}`}
          accent={COLORS.git}
          onPress={onEditQuery}
        />
        <text content={translateUi(presentation.scope)} style={{ fg: COLORS.muted }} />
      </box>
    </>
  )
}
