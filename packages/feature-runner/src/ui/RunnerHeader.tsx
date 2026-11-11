import { COLORS, LAYOUT, panelBorder } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import type { RunnerProjectSummary } from "../model/status"
import { EMPTY_RUNNER_SUMMARY, runnerProjectStatus } from "../model/status"
import type { RunnerProject } from "../model/types"
import { RUNNER_PROJECT_TAB_SHORTCUTS } from "../model/workspace"
import type { RunnerColorPart } from "../rendering/status"
import { runnerColoredText } from "../rendering/status"
import { RunnerProjectTab } from "../ui/RunnerProjectTab"

export type RunnerHeaderProps = {
  projectTabAreaWidth: number
  openedProjects: RunnerProject[]
  projectRoot: string
  projectSummaries: Map<string, RunnerProjectSummary>
  projectTabWidth: number
  switchProject: (root: string) => void
  closeProject: (root: string) => void
  newProjectWidth: number
  newProjectLabel: "[N] Nova aba"
  openProjectPicker: () => Promise<void>
  summaryParts: RunnerColorPart[]
}
export function RunnerHeader({
  projectTabAreaWidth,
  openedProjects,
  projectRoot,
  projectSummaries,
  projectTabWidth,
  switchProject,
  closeProject,
  newProjectWidth,
  newProjectLabel,
  openProjectPicker,
  summaryParts,
}: RunnerHeaderProps) {
  return (
    <box
      key={LAYOUT.compact ? "runner-header-compact" : "runner-header-framed"}
      id="runner-header"
      style={{
        height: 3,
        flexShrink: 0,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        ...panelBorder(),
        backgroundColor: COLORS.panel,
        paddingLeft: 1,
        paddingRight: 1,
        marginBottom: 0,
      }}
    >
      <box
        id="runner-project-tabs"
        style={{
          maxWidth: projectTabAreaWidth + 11,
          flexShrink: 1,
          flexDirection: "row",
          alignItems: "center",
          overflow: "hidden",
        }}
      >
        <text content="▶ RUNNER / " style={{ fg: COLORS.runner }} />
        {openedProjects.map((project, index) => {
          const shortcut = RUNNER_PROJECT_TAB_SHORTCUTS[index]
          if (!shortcut) return null
          const selected = project.path === projectRoot
          return (
            <RunnerProjectTab
              key={project.path}
              project={project}
              index={index}
              shortcut={shortcut}
              selected={selected}
              status={runnerProjectStatus(
                projectSummaries.get(project.path) ?? EMPTY_RUNNER_SUMMARY,
              )}
              width={projectTabWidth}
              onSelect={() => switchProject(project.path)}
              onClose={() => closeProject(project.path)}
            />
          )
        })}
      </box>
      <box style={{ flexGrow: 1, minWidth: newProjectWidth, alignItems: "center" }}>
        <InlineButton
          id="runner-project-new"
          label={newProjectLabel}
          accent={COLORS.runner}
          onPress={() => void openProjectPicker()}
        />
      </box>
      <text
        id="runner-project-summary"
        content={runnerColoredText(summaryParts)}
        style={{
          fg: COLORS.muted,
          flexShrink: 0,
        }}
      />
    </box>
  )
}
