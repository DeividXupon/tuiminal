import type { BoxRenderable, InputRenderable, SelectRenderable } from "@opentui/core"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { Button } from "@tuiparts/react/button"
import { useEffect, useMemo, useRef, useState } from "react"
import { COLORS } from "../../../../core/settings/theme"
import { translateUi } from "../../../../shared/i18n"
import { InlineButton } from "../../../../shared/ui/InlineButton"
import { ShortcutText } from "../../../../shared/ui/ShortcutText"
import { handleSelectMouseDown, handleSelectMouseScroll } from "../../../../shared/ui/selectMouse"
import type { LocalGitProject, LocalGitTarget } from "../../services/local-target"

export type GitLocalTargetPickerKind = "project" | "branch"

export function GitLocalTargetPicker({
  kind,
  target,
  projects,
  projectsLoading,
  projectError,
  onClose,
  onSelectProject,
  onSelectBranch,
}: {
  kind: GitLocalTargetPickerKind
  target: LocalGitTarget
  projects: readonly LocalGitProject[]
  projectsLoading: boolean
  projectError: string
  onClose: () => void
  onSelectProject: (root: string) => Promise<boolean>
  onSelectBranch: (branch: string) => Promise<boolean>
}) {
  const renderer = useRenderer()
  const terminal = useTerminalDimensions()
  const dialogRef = useRef<BoxRenderable | null>(null)
  const inputRef = useRef<InputRenderable | null>(null)
  const listRef = useRef<SelectRenderable | null>(null)
  const [query, setQuery] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const options = useMemo(() => {
    if (kind === "branch") {
      return target.branches
        .filter(
          (branch) => !normalizedQuery || branch.toLocaleLowerCase().includes(normalizedQuery),
        )
        .map((branch) => ({
          name: `${branch === target.branch ? "●" : "◇"} ${branch}`,
          description:
            branch === target.branch ? translateUi("BRANCH ATUAL") : translateUi("Branch local"),
          value: branch,
        }))
    }
    return projects
      .filter(
        (project) =>
          !normalizedQuery ||
          `${project.name} ${project.displayPath}`.toLocaleLowerCase().includes(normalizedQuery),
      )
      .map((project) => ({
        name: `${project.root === target.root ? "●" : "◇"} ${project.name}`,
        description: project.displayPath,
        value: project.root,
      }))
  }, [kind, normalizedQuery, projects, target.branch, target.branches, target.root])

  useEffect(() => {
    renderer.currentFocusedRenderable?.blur()
    const timeout = setTimeout(() => {
      if (listRef.current) listRef.current.focus()
      else dialogRef.current?.focus()
    }, 0)
    return () => clearTimeout(timeout)
  }, [renderer])

  const select = async (value: string) => {
    if (busy) return
    setBusy(true)
    setError("")
    try {
      const saved = kind === "project" ? await onSelectProject(value) : await onSelectBranch(value)
      if (saved) onClose()
      else setError(translateUi("Não foi possível aplicar a seleção."))
    } catch (selectionError) {
      setError(
        selectionError instanceof Error
          ? selectionError.message
          : translateUi("Não foi possível aplicar a seleção."),
      )
    } finally {
      setBusy(false)
    }
  }

  useKeyboard((key) => {
    const focusedId = renderer.currentFocusedRenderable?.id
    if (key.name === "escape") {
      key.preventDefault()
      key.stopPropagation()
      if (focusedId === "git-local-target-search") {
        inputRef.current?.blur()
        if (listRef.current) listRef.current.focus()
        else dialogRef.current?.focus()
      } else onClose()
      return
    }
    if (key.name === "/" && focusedId !== "git-local-target-search") {
      key.preventDefault()
      inputRef.current?.focus()
    }
  })

  const width = Math.max(48, Math.min(92, terminal.width - 6))
  const height = Math.max(14, Math.min(28, terminal.height - 4))
  const title = kind === "project" ? "◆ ESCOLHER PROJETO LOCAL" : "◆ ESCOLHER BRANCH LOCAL"
  return (
    <>
      <Button
        onPress={onClose}
        position="absolute"
        top={0}
        left={0}
        width="100%"
        height="100%"
        zIndex={980}
        backgroundColor="#030509"
        opacity={0.94}
      />
      <box
        position="absolute"
        top={0}
        left={0}
        width="100%"
        height="100%"
        zIndex={981}
        alignItems="center"
        justifyContent="center"
      >
        <box
          ref={dialogRef}
          id="git-local-target-picker"
          focusable
          style={{
            width,
            height,
            border: true,
            borderStyle: "rounded",
            borderColor: COLORS.git,
            backgroundColor: COLORS.canvas,
            paddingLeft: 1,
            paddingRight: 1,
          }}
        >
          <box
            style={{
              height: 2,
              flexShrink: 0,
              flexDirection: "row",
              justifyContent: "space-between",
              border: ["bottom"],
              borderColor: COLORS.border,
            }}
          >
            <text content={translateUi(title)} style={{ fg: COLORS.git }} />
            <InlineButton
              label={translateUi("[Esc] Voltar")}
              accent={COLORS.git}
              onPress={onClose}
            />
          </box>
          <input
            ref={inputRef}
            id="git-local-target-search"
            value={query}
            placeholder={translateUi("⌕ Filtrar por nome ou caminho…")}
            onInput={setQuery}
            onSubmit={() => listRef.current?.focus()}
            onMouseDown={() => inputRef.current?.focus()}
            width={width - 4}
            style={{
              marginTop: 1,
              marginBottom: 1,
              backgroundColor: COLORS.panelRaised,
              focusedBackgroundColor: COLORS.panelRaised,
              textColor: COLORS.text,
              focusedTextColor: COLORS.text,
              cursorColor: COLORS.git,
            }}
          />
          {options.length ? (
            <select
              ref={listRef}
              id="git-local-target-list"
              options={options}
              onSelect={(_index, option) => {
                if (typeof option?.value === "string") void select(option.value)
              }}
              onMouseDown={(event) =>
                handleSelectMouseDown(event, listRef.current, {
                  optionCount: options.length,
                  showDescription: true,
                  activateOnClick: true,
                })
              }
              onMouseScroll={(event) => handleSelectMouseScroll(event, listRef.current)}
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
                selectedTextColor: COLORS.git,
                descriptionColor: COLORS.muted,
                selectedDescriptionColor: COLORS.text,
              }}
            />
          ) : (
            <box style={{ flexGrow: 1, alignItems: "center", justifyContent: "center" }}>
              <text
                content={translateUi(
                  kind === "project"
                    ? "Nenhum repositório Git local encontrado."
                    : "Nenhuma branch local encontrada.",
                )}
                style={{ fg: COLORS.muted }}
              />
            </box>
          )}
          {projectsLoading && kind === "project" ? (
            <text
              content={translateUi("◷ Procurando repositórios Git locais…")}
              style={{ fg: COLORS.git }}
            />
          ) : null}
          {error || (kind === "project" ? projectError : "") ? (
            <text content={error || projectError} style={{ fg: COLORS.danger }} />
          ) : null}
          <ShortcutText
            content={translateUi(
              busy ? "Aplicando seleção…" : "[/] Filtrar  [↑/↓] Navegar  [Enter] Selecionar",
            )}
            style={{ height: 1, flexShrink: 0, fg: busy ? COLORS.git : COLORS.muted }}
          />
        </box>
      </box>
    </>
  )
}
