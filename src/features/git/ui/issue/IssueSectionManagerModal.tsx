import type { BoxRenderable } from "@opentui/core"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { Button } from "@tuiparts/react/button"
import { useEffect, useRef, useState } from "react"
import { COLORS } from "../../../../core/settings/theme"
import { translateUi, truncateDisplay } from "../../../../shared/i18n"
import { InlineButton } from "../../../../shared/ui/InlineButton"
import { ShortcutText } from "../../../../shared/ui/ShortcutText"
import {
  issueSectionManagerAction,
  type IssueSectionManagerAction,
  type IssueSectionManagerTab,
} from "../../model/issue/sections"
import type { IssueSection } from "../../model/issue/types"

type ManagerDispatch = {
  action: Exclude<IssueSectionManagerAction, { type: "close" }>
  tab: IssueSectionManagerTab
  selectedSection: IssueSection | undefined
  selectedRepository: string | undefined
  sectionCount: number
  itemCount: number
  selectTab: (tab: IssueSectionManagerTab) => void
  setIndex: (update: (current: number) => number) => void
  onCreate: () => void
  onEdit: (section: IssueSection) => void
  onDuplicate: (section: IssueSection) => void
  onMove: (section: IssueSection, delta: -1 | 1) => void
  onDelete: (section: IssueSection) => void
  onAddRepository: () => void
  onRemoveRepository: (repository: string) => void
}

function dispatchDelete(context: ManagerDispatch) {
  if (context.tab === "sections" && context.selectedSection && context.sectionCount > 1) {
    context.onDelete(context.selectedSection)
  }
  if (context.tab === "repositories" && context.selectedRepository) {
    context.onRemoveRepository(context.selectedRepository)
  }
}

function dispatchManagerAction(context: ManagerDispatch) {
  const { action, selectedSection } = context
  if (action.type === "select-tab") return context.selectTab(action.tab)
  if (action.type === "move-selection") {
    return context.setIndex((current) =>
      Math.max(0, Math.min(Math.max(0, context.itemCount - 1), current + action.delta)),
    )
  }
  if (action.type === "create") return context.onCreate()
  if (action.type === "add-repository") return context.onAddRepository()
  if (action.type === "edit" && selectedSection) return context.onEdit(selectedSection)
  if (action.type === "duplicate" && selectedSection) return context.onDuplicate(selectedSection)
  if (action.type === "move-section" && selectedSection) {
    return context.onMove(selectedSection, action.delta)
  }
  if (action.type === "delete") dispatchDelete(context)
}

export function IssueSectionManagerModal({
  sections,
  repositories,
  onClose,
  onCreate,
  onEdit,
  onDuplicate,
  onMove,
  onDelete,
  onAddRepository,
  onRemoveRepository,
}: {
  sections: readonly IssueSection[]
  repositories: readonly string[]
  onClose: () => void
  onCreate: () => void
  onEdit: (section: IssueSection) => void
  onDuplicate: (section: IssueSection) => void
  onMove: (section: IssueSection, delta: -1 | 1) => void
  onDelete: (section: IssueSection) => void
  onAddRepository: () => void
  onRemoveRepository: (repository: string) => void
}) {
  const renderer = useRenderer()
  const terminal = useTerminalDimensions()
  const dialogRef = useRef<BoxRenderable | null>(null)
  const [tab, setTab] = useState<IssueSectionManagerTab>("sections")
  const [index, setIndex] = useState(0)
  const count = tab === "sections" ? sections.length : repositories.length

  useEffect(() => {
    renderer.currentFocusedRenderable?.blur()
    const timeout = setTimeout(() => dialogRef.current?.focus(), 0)
    return () => clearTimeout(timeout)
  }, [renderer])

  const selectTab = (next: IssueSectionManagerTab) => {
    setTab(next)
    setIndex(0)
  }
  const selectedSection = sections[index]
  const selectedRepository = repositories[index]
  useKeyboard((key) => {
    const action = issueSectionManagerAction({
      key: { name: key.name, sequence: key.sequence, option: key.option },
      tab,
      hasSelection: tab === "sections" ? Boolean(selectedSection) : Boolean(selectedRepository),
    })
    if (!action) return
    key.preventDefault()
    if (action.type === "close") {
      key.stopPropagation()
      onClose()
      return
    }
    dispatchManagerAction({
      action,
      tab,
      selectedSection,
      selectedRepository,
      sectionCount: sections.length,
      itemCount: count,
      selectTab,
      setIndex,
      onCreate,
      onEdit,
      onDuplicate,
      onMove,
      onDelete,
      onAddRepository,
      onRemoveRepository,
    })
  })

  const width = Math.max(52, Math.min(96, terminal.width - 4))
  return (
    <>
      <Button
        onPress={onClose}
        position="absolute"
        top={0}
        left={0}
        width="100%"
        height="100%"
        zIndex={965}
        backgroundColor="#030509"
        opacity={0.92}
      />
      <box
        position="absolute"
        top={0}
        left={0}
        width="100%"
        height="100%"
        zIndex={966}
        alignItems="center"
        justifyContent="center"
      >
        <box
          ref={dialogRef}
          id="git-issue-section-manager-modal"
          focusable
          style={{
            width,
            height: Math.min(24, Math.max(15, count + 9)),
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
            <text content={translateUi("◆ CONFIGURAR ISSUES")} style={{ fg: COLORS.git }} />
            <InlineButton
              label={translateUi("[Esc] Fechar")}
              accent={COLORS.git}
              onPress={onClose}
            />
          </box>
          <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
            <InlineButton
              label={translateUi("[1] Seções")}
              accent={COLORS.git}
              active={tab === "sections"}
              onPress={() => selectTab("sections")}
            />
            <InlineButton
              label={translateUi("[2] Repositórios")}
              accent={COLORS.git}
              active={tab === "repositories"}
              onPress={() => selectTab("repositories")}
            />
          </box>
          <box style={{ flexGrow: 1, width: "100%", marginTop: 1 }}>
            {tab === "sections" ? (
              sections.map((section, sectionIndex) => (
                <Button
                  key={section.id}
                  height={2}
                  width="100%"
                  onPress={() => setIndex(sectionIndex)}
                >
                  <box
                    style={{
                      height: 2,
                      width: "100%",
                      backgroundColor: sectionIndex === index ? COLORS.panelRaised : COLORS.canvas,
                    }}
                  >
                    <text
                      content={`${sectionIndex === index ? "▶" : " "} ${translateUi(section.title)}`}
                      style={{ fg: sectionIndex === index ? COLORS.text : COLORS.muted }}
                    />
                    <text
                      content={`  ${truncateDisplay(section.query, width - 6)}`}
                      style={{ fg: COLORS.border }}
                    />
                  </box>
                </Button>
              ))
            ) : repositories.length ? (
              repositories.map((repository, repositoryIndex) => (
                <Button
                  key={repository}
                  height={1}
                  width="100%"
                  onPress={() => setIndex(repositoryIndex)}
                >
                  <text
                    content={`${repositoryIndex === index ? "▶" : " "} ${repository}`}
                    style={{
                      fg: repositoryIndex === index ? COLORS.text : COLORS.muted,
                      bg: repositoryIndex === index ? COLORS.panelRaised : COLORS.canvas,
                    }}
                  />
                </Button>
              ))
            ) : (
              <text
                content={translateUi("Sem filtros: buscando em todos os projetos da conta.")}
                style={{ fg: COLORS.muted }}
              />
            )}
          </box>
          {tab === "sections" ? (
            <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
              <InlineButton
                label={translateUi("[N] Nova")}
                accent={COLORS.git}
                onPress={onCreate}
              />
              <InlineButton
                label={translateUi("[E/Enter] Editar")}
                accent={COLORS.git}
                disabled={!selectedSection}
                onPress={() => selectedSection && onEdit(selectedSection)}
              />
              <InlineButton
                label={translateUi("[D] Duplicar")}
                accent={COLORS.git}
                disabled={!selectedSection}
                onPress={() => selectedSection && onDuplicate(selectedSection)}
              />
              <InlineButton
                label={translateUi("[Alt+↑/↓] Mover")}
                accent={COLORS.git}
                disabled={!selectedSection}
                onPress={() => selectedSection && onMove(selectedSection, 1)}
              />
              <InlineButton
                label={translateUi("[X] Excluir")}
                accent={COLORS.danger}
                disabled={!selectedSection || sections.length <= 1}
                onPress={() => selectedSection && onDelete(selectedSection)}
              />
            </box>
          ) : (
            <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
              <InlineButton
                label={translateUi("[+] Adicionar")}
                accent={COLORS.git}
                onPress={onAddRepository}
              />
              <InlineButton
                label={translateUi("[X] Remover")}
                accent={COLORS.danger}
                disabled={!selectedRepository}
                onPress={() => selectedRepository && onRemoveRepository(selectedRepository)}
              />
            </box>
          )}
          <ShortcutText
            content={translateUi("[J/K] Navegar  [1/2] Seção  [Esc] Voltar")}
            style={{ fg: COLORS.muted }}
          />
        </box>
      </box>
    </>
  )
}
