import type { BoxRenderable } from "@opentui/core"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { Button } from "@tuiparts/react/button"
import { useEffect, useRef, useState } from "react"
import { COLORS } from "../../../../core/settings/theme"
import { translateUi, truncateDisplay } from "../../../../shared/i18n"
import { InlineButton } from "../../../../shared/ui/InlineButton"
import { ShortcutText } from "../../../../shared/ui/ShortcutText"
import { type SectionManagerTab, sectionManagerAction } from "../../model/pr/sections"
import type { PullRequestSection } from "../../model/pr/types"

export function SectionManagerModal({
  open,
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
  open: boolean
  sections: readonly PullRequestSection[]
  repositories: readonly string[]
  onClose: () => void
  onCreate: () => void
  onEdit: (section: PullRequestSection) => void
  onDuplicate: (section: PullRequestSection) => void
  onMove: (section: PullRequestSection, delta: -1 | 1) => void
  onDelete: (section: PullRequestSection) => void
  onAddRepository: () => void
  onRemoveRepository: (repository: string) => void
}) {
  const renderer = useRenderer()
  const terminal = useTerminalDimensions()
  const dialogRef = useRef<BoxRenderable | null>(null)
  const [tab, setTab] = useState<SectionManagerTab>("sections")
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const entries = tab === "sections" ? sections : repositories
  const selectedSection = tab === "sections" ? sections[selectedIndex] : undefined
  const selectedRepository = tab === "repositories" ? repositories[selectedIndex] : undefined

  useEffect(() => {
    if (!open) return
    renderer.currentFocusedRenderable?.blur()
    setPendingDelete(null)
    const timeout = setTimeout(() => dialogRef.current?.focus(), 0)
    return () => clearTimeout(timeout)
  }, [open, renderer])

  const selectTab = (next: SectionManagerTab) => {
    setTab(next)
    setSelectedIndex(0)
    setPendingDelete(null)
  }
  const requestDelete = () => {
    const id = selectedSection?.id ?? selectedRepository
    if (!id) return
    if (pendingDelete === id) {
      if (selectedSection) onDelete(selectedSection)
      else if (selectedRepository) onRemoveRepository(selectedRepository)
      setPendingDelete(null)
      setSelectedIndex((current) => Math.max(0, current - 1))
    } else setPendingDelete(id)
  }

  const dispatchSectionAction = (action: ReturnType<typeof sectionManagerAction>) => {
    if (!action || !selectedSection) return
    if (action.type === "edit") return onEdit(selectedSection)
    if (action.type === "duplicate") return onDuplicate(selectedSection)
    if (action.type === "move-section") return onMove(selectedSection, action.delta)
  }

  const dispatchAction = (action: ReturnType<typeof sectionManagerAction>) => {
    if (!action) return
    if (action.type === "close") return onClose()
    if (action.type === "select-tab") return selectTab(action.tab)
    if (action.type === "move-selection") {
      setSelectedIndex((current) =>
        Math.max(0, Math.min(entries.length - 1, current + action.delta)),
      )
      return
    }
    if (action.type === "create") return onCreate()
    if (action.type === "add-repository") return onAddRepository()
    if (action.type === "delete") return requestDelete()
    dispatchSectionAction(action)
  }

  useKeyboard((key) => {
    if (!open) return
    key.preventDefault()
    key.stopPropagation()
    const action = sectionManagerAction({ key, tab, hasSelection: entries.length > 0 })
    dispatchAction(action)
  })

  if (!open) return null
  const width = Math.max(50, Math.min(96, terminal.width - 4))
  const height = Math.max(15, Math.min(26, terminal.height - 4))
  return (
    <>
      <Button
        onPress={onClose}
        position="absolute"
        top={0}
        left={0}
        width="100%"
        height="100%"
        zIndex={970}
        backgroundColor="#030509"
        opacity={0.92}
      />
      <box
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          zIndex: 971,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <box
          ref={dialogRef}
          id="git-pr-section-manager-modal"
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
            <text content={translateUi("◆ CONFIGURAR PULL REQUESTS")} style={{ fg: COLORS.git }} />
            <InlineButton label="[Esc] Fechar" accent={COLORS.git} onPress={onClose} />
          </box>
          <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
            <InlineButton
              label="[1] Seções"
              accent={COLORS.git}
              active={tab === "sections"}
              onPress={() => selectTab("sections")}
            />
            <InlineButton
              label="[2] Repositórios"
              accent={COLORS.git}
              active={tab === "repositories"}
              onPress={() => selectTab("repositories")}
            />
          </box>
          <box style={{ flexGrow: 1, marginTop: 1 }}>
            {entries.length ? (
              entries.map((entry, index) => {
                const section = typeof entry === "string" ? null : entry
                const id = section?.id ?? String(entry)
                const content = section
                  ? `${translateUi(section.title)}  ·  ${section.query}`
                  : String(entry)
                return (
                  <Button key={id} height={1} onPress={() => setSelectedIndex(index)}>
                    <text
                      content={`${index === selectedIndex ? "▶" : " "} ${truncateDisplay(content, width - 6)}`}
                      style={{
                        fg: index === selectedIndex ? COLORS.git : COLORS.text,
                        bg: index === selectedIndex ? COLORS.panelRaised : COLORS.canvas,
                      }}
                    />
                  </Button>
                )
              })
            ) : (
              <text
                content={translateUi("Sem filtros: buscando em todos os projetos da conta.")}
                style={{ fg: COLORS.muted }}
              />
            )}
          </box>
          {pendingDelete ? (
            <text
              content={translateUi("Pressione [X] novamente para confirmar a exclusão.")}
              style={{ fg: COLORS.warning }}
            />
          ) : null}
          <ManagerActions
            tab={tab}
            hasSelection={Boolean(selectedSection ?? selectedRepository)}
            canDelete={tab === "repositories" || sections.length > 1}
            onCreate={onCreate}
            onEdit={() => selectedSection && onEdit(selectedSection)}
            onDuplicate={() => selectedSection && onDuplicate(selectedSection)}
            onAddRepository={onAddRepository}
            onDelete={requestDelete}
          />
        </box>
      </box>
    </>
  )
}

function ManagerActions({
  tab,
  hasSelection,
  canDelete,
  onCreate,
  onEdit,
  onDuplicate,
  onAddRepository,
  onDelete,
}: {
  tab: SectionManagerTab
  hasSelection: boolean
  canDelete: boolean
  onCreate: () => void
  onEdit: () => void
  onDuplicate: () => void
  onAddRepository: () => void
  onDelete: () => void
}) {
  if (tab === "repositories") {
    return (
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
        <InlineButton label="[+] Adicionar" accent={COLORS.git} onPress={onAddRepository} />
        <InlineButton
          label="[X] Remover"
          accent={COLORS.danger}
          disabled={!hasSelection}
          onPress={onDelete}
        />
      </box>
    )
  }
  return (
    <box style={{ height: 2, flexShrink: 0 }}>
      <box style={{ height: 1, flexDirection: "row" }}>
        <InlineButton label="[N] Nova" accent={COLORS.git} onPress={onCreate} />
        <InlineButton
          label="[E] Editar"
          accent={COLORS.git}
          disabled={!hasSelection}
          onPress={onEdit}
        />
        <InlineButton
          label="[D] Duplicar"
          accent={COLORS.git}
          disabled={!hasSelection}
          onPress={onDuplicate}
        />
        <InlineButton
          label="[X] Excluir"
          accent={COLORS.danger}
          disabled={!hasSelection || !canDelete}
          onPress={onDelete}
        />
      </box>
      <ShortcutText
        content={translateUi("[Alt+↑/↓] Reordenar  [J/K] Navegar")}
        style={{ fg: COLORS.muted }}
      />
    </box>
  )
}
