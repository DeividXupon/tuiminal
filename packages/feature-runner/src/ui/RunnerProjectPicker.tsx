import type { InputRenderable, SelectRenderable } from "@opentui/core"
import { COLORS, LAYOUT, panelBorder } from "@xupon/tuiminal-core/settings/theme"
import { handleSelectMouseDown, handleSelectMouseScroll } from "@xupon/tuiminal-core/ui/selectMouse"
import type * as React from "react"
import type { RunnerDirectoryEntry, RunnerProject } from "../model/types"
import { RUNNER_DIRECTORY_PICKER_OPTION, RUNNER_USE_DIRECTORY_OPTION } from "../model/workspace"
import { RunnerLoadingOverlay } from "../ui/RunnerLoadingOverlay"

export type RunnerProjectPickerProps = {
  id?: string
  homeDirectory: string
  pickerMode: "projects" | "directories"
  filteredProjects: RunnerProject[]
  filteredDirectoryEntries: RunnerDirectoryEntry[]
  projectSearchRef: React.RefObject<InputRenderable | null>
  projectSearch: string
  setProjectSearch: React.Dispatch<React.SetStateAction<string>>
  directoryListRef: React.RefObject<SelectRenderable | null>
  projectListRef: React.RefObject<SelectRenderable | null>
  terminal: { width: number; height: number }
  projectPickerError: string | null
  projectOptions: { name: string; description: string; value: string }[]
  loadDirectory: (directory: string) => Promise<void>
  switchProject: (root: string) => void
  directoryOptions: { name: string; description: string; value: string }[]
  browserDirectory: string
  projectsLoading: boolean
  directoryLoading: boolean
}
export function RunnerProjectPicker({
  id,
  homeDirectory,
  pickerMode,
  filteredProjects,
  filteredDirectoryEntries,
  projectSearchRef,
  projectSearch,
  setProjectSearch,
  directoryListRef,
  projectListRef,
  terminal,
  projectPickerError,
  projectOptions,
  loadDirectory,
  switchProject,
  directoryOptions,
  browserDirectory,
  projectsLoading,
  directoryLoading,
}: RunnerProjectPickerProps) {
  return (
    <box
      id={id ?? "runner-project-picker"}
      key={LAYOUT.compact ? "runner-picker-compact" : "runner-picker-framed"}
      style={{
        position: "relative",
        flexGrow: 1,
        ...panelBorder(COLORS.runner),
        backgroundColor: COLORS.panel,
        paddingLeft: 2,
        paddingRight: 2,
      }}
    >
      <box
        style={{
          height: 2,
          flexShrink: 0,
          flexDirection: "row",
          justifyContent: "space-between",
        }}
      >
        <text
          content={pickerMode === "projects" ? "◆ PROJETOS" : "◇ NAVEGADOR DE PASTAS"}
          style={{ fg: COLORS.runner }}
        />
        <text
          content={
            pickerMode === "projects"
              ? `${filteredProjects.length} REPOSITÓRIOS GIT`
              : `${filteredDirectoryEntries.length} PASTAS`
          }
          style={{ fg: COLORS.muted }}
        />
      </box>
      <input
        ref={projectSearchRef}
        id="runner-project-search"
        value={projectSearch}
        placeholder="⌕ Filtrar por nome ou caminho…"
        onInput={setProjectSearch}
        onMouseDown={() => projectSearchRef.current?.focus()}
        onSubmit={() => {
          if (pickerMode === "directories") directoryListRef.current?.focus()
          else projectListRef.current?.focus()
        }}
        width={Math.max(30, terminal.width - 10)}
        style={{
          backgroundColor: COLORS.panelRaised,
          focusedBackgroundColor: COLORS.panelRaised,
          textColor: COLORS.text,
          focusedTextColor: COLORS.text,
          cursorColor: COLORS.runner,
          marginBottom: 1,
        }}
      />
      {projectPickerError ? (
        <box style={{ flexGrow: 1, alignItems: "center", justifyContent: "center" }}>
          <text content={projectPickerError} style={{ fg: COLORS.danger }} />
        </box>
      ) : pickerMode === "projects" ? (
        <select
          ref={projectListRef}
          id="runner-project-list"
          options={projectOptions}
          onSelect={(_index, option) => {
            if (typeof option?.value !== "string") return
            if (option.value === RUNNER_DIRECTORY_PICKER_OPTION) {
              setProjectSearch("")
              void loadDirectory(homeDirectory)
              return
            }
            switchProject(option.value)
          }}
          onMouseDown={(event) =>
            handleSelectMouseDown(event, projectListRef.current, {
              optionCount: projectOptions.length,
              showDescription: true,
              activateOnClick: true,
            })
          }
          onMouseScroll={(event) => handleSelectMouseScroll(event, projectListRef.current)}
          showDescription
          showScrollIndicator
          wrapSelection
          style={{
            flexGrow: 1,
            backgroundColor: COLORS.panel,
            focusedBackgroundColor: COLORS.panel,
            textColor: COLORS.muted,
            focusedTextColor: COLORS.text,
            selectedBackgroundColor: COLORS.panelRaised,
            selectedTextColor: COLORS.runner,
            descriptionColor: COLORS.muted,
            selectedDescriptionColor: COLORS.text,
          }}
        />
      ) : (
        <select
          ref={directoryListRef}
          id="runner-directory-list"
          options={directoryOptions}
          onSelect={(_index, option) => {
            if (typeof option?.value !== "string") return
            if (option.value === RUNNER_USE_DIRECTORY_OPTION) {
              switchProject(browserDirectory)
              return
            }
            setProjectSearch("")
            void loadDirectory(option.value)
          }}
          onMouseDown={(event) =>
            handleSelectMouseDown(event, directoryListRef.current, {
              optionCount: directoryOptions.length,
              showDescription: true,
              activateOnClick: true,
            })
          }
          onMouseScroll={(event) => handleSelectMouseScroll(event, directoryListRef.current)}
          showDescription
          showScrollIndicator
          wrapSelection
          style={{
            flexGrow: 1,
            backgroundColor: COLORS.panel,
            focusedBackgroundColor: COLORS.panel,
            textColor: COLORS.muted,
            focusedTextColor: COLORS.text,
            selectedBackgroundColor: COLORS.panelRaised,
            selectedTextColor: COLORS.runner,
            descriptionColor: COLORS.muted,
            selectedDescriptionColor: COLORS.text,
          }}
        />
      )}
      <RunnerLoadingOverlay
        active={projectsLoading || directoryLoading}
        kind={projectsLoading ? "projects" : "directory"}
      />
    </box>
  )
}
