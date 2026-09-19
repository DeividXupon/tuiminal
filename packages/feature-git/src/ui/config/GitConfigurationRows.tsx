import { Button } from "@tuiparts/react/button"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import type { LocalGitTarget } from "../../services/local-target"
import {
  GIT_BROWSER_OPTIONS,
  gitBrowserDescription,
  gitBrowserLabel,
  type GitBrowser,
} from "../../model/browser"

type Selector = { id: string; title: string; query: string }

export function GitSelectorActions({
  selected,
  canDelete,
  pendingDelete,
  onCreate,
  onEdit,
  onMutate,
}: {
  selected: boolean
  canDelete: boolean
  pendingDelete: boolean
  onCreate: () => void
  onEdit: () => void
  onMutate: (action: "duplicate" | "delete" | "up" | "down") => void
}) {
  return (
    <box style={{ height: 1, flexShrink: 0 }}>
      <box style={{ height: 1, flexDirection: "row" }}>
        <InlineButton label={translateUi("[N] Novo")} accent={COLORS.git} onPress={onCreate} />
        <InlineButton
          label={translateUi("[E/Enter] Editar")}
          accent={COLORS.git}
          disabled={!selected}
          onPress={onEdit}
        />
        <InlineButton
          label={translateUi("[D] Duplicar")}
          accent={COLORS.git}
          disabled={!selected}
          onPress={() => onMutate("duplicate")}
        />
        <InlineButton
          label={translateUi(pendingDelete ? "[X] Confirmar" : "[X] Excluir")}
          accent={COLORS.danger}
          disabled={!canDelete}
          onPress={() => onMutate("delete")}
        />
        <InlineButton
          label="↑"
          accent={COLORS.git}
          disabled={!selected}
          onPress={() => onMutate("up")}
        />
        <InlineButton
          label="↓"
          accent={COLORS.git}
          disabled={!selected}
          onPress={() => onMutate("down")}
        />
      </box>
    </box>
  )
}

export function GitLocalTargetRows({
  target,
  selectedIndex,
  width,
  onSelect,
  onActivate,
}: {
  target: LocalGitTarget
  selectedIndex: number
  width: number
  onSelect: (index: number) => void
  onActivate: (target: "project" | "branch") => void
}) {
  const rows = [
    {
      title: translateUi("PROJETO LOCAL"),
      value: target.isRepository ? target.name : translateUi("Nenhum projeto selecionado"),
      description: target.displayPath,
      target: "project" as const,
    },
    {
      title: translateUi("BRANCH LOCAL"),
      value: target.branch,
      description: target.isRepository
        ? translateUi("Somente branches existentes neste repositório")
        : translateUi("Escolha primeiro um projeto local"),
      target: "branch" as const,
    },
  ]
  return rows.map((row, index) => {
    const activate = () => {
      onSelect(index)
      onActivate(row.target)
    }
    return (
      <Button
        key={row.target}
        id={`git-configuration-local-${row.target}`}
        height={3}
        flexShrink={0}
        onPress={activate}
      >
        {/* biome-ignore lint/a11y/noStaticElementInteractions: The visible row forwards mouse activation to its Button action. */}
        <box
          onMouseDown={activate}
          style={{
            height: 3,
            flexShrink: 0,
            paddingLeft: 1,
            paddingRight: 1,
            backgroundColor: selectedIndex === index ? COLORS.panelRaised : COLORS.panel,
          }}
        >
          <text
            content={truncateDisplay(
              `${selectedIndex === index ? "▶" : " "} ${row.title}`,
              width - 4,
            )}
            style={{ fg: selectedIndex === index ? COLORS.git : COLORS.text }}
          />
          <text
            content={truncateDisplay(`  ${row.value}`, width - 4)}
            style={{ fg: COLORS.text }}
          />
          <text
            content={truncateDisplay(`  ${row.description}`, width - 4)}
            style={{ fg: COLORS.muted }}
          />
        </box>
      </Button>
    )
  })
}

export function GitSelectorRows({
  kind,
  sections,
  selectedIndex,
  width,
  onSelect,
}: {
  kind: "pr" | "issue"
  sections: readonly Selector[]
  selectedIndex: number
  width: number
  onSelect: (index: number) => void
}) {
  return sections.map((section, index) => {
    const select = () => onSelect(index)
    return (
      <Button
        key={section.id}
        id={`git-configuration-${kind}-selector-${index}`}
        height={2}
        flexShrink={0}
        onPress={select}
      >
        {/* biome-ignore lint/a11y/noStaticElementInteractions: The visible row forwards mouse activation to its Button action. */}
        <box
          onMouseDown={select}
          style={{
            height: 2,
            flexShrink: 0,
            paddingLeft: 1,
            paddingRight: 1,
            backgroundColor: index === selectedIndex ? COLORS.panelRaised : COLORS.panel,
          }}
        >
          <text
            content={truncateDisplay(
              `${index === selectedIndex ? "▶" : " "} ${translateUi(section.title)}`,
              width - 4,
            )}
            style={{ fg: index === selectedIndex ? COLORS.git : COLORS.text }}
          />
          <text
            content={truncateDisplay(`  ${section.query}`, width - 4)}
            style={{ fg: COLORS.muted }}
          />
        </box>
      </Button>
    )
  })
}

export function GitRepositoryRows({
  repositories,
  selectedRepositories,
  selectedIndex,
  currentRepository,
  width,
  onSelect,
  onToggle,
}: {
  repositories: readonly string[]
  selectedRepositories: ReadonlySet<string>
  selectedIndex: number
  currentRepository: string | null
  width: number
  onSelect: (index: number) => void
  onToggle: (repository: string | null) => void
}) {
  const entries: Array<string | null> = [null, ...repositories]
  return entries.map((repository, index) => {
    const active =
      repository === null ? selectedRepositories.size === 0 : selectedRepositories.has(repository)
    const current = repository !== null && repository === currentRepository
    const label = repository ?? translateUi("TODOS")
    return (
      <Button
        key={repository ?? "all"}
        id={`git-configuration-repository-${index}`}
        height={1}
        flexShrink={0}
        onPress={() => {
          onSelect(index)
          onToggle(repository)
        }}
      >
        <text
          content={truncateDisplay(
            `${index === selectedIndex ? "▶" : " "} ${active ? "●" : "○"} ${label}${current ? ` · ${translateUi("ATUAL")}` : ""}`,
            width - 4,
          )}
          style={{
            fg: active || index === selectedIndex ? COLORS.git : COLORS.text,
            bg: index === selectedIndex ? COLORS.panelRaised : COLORS.panel,
          }}
        />
      </Button>
    )
  })
}

export function GitBrowserRows({
  browser,
  selectedIndex,
  width,
  onSelect,
  onActivate,
}: {
  browser: GitBrowser
  selectedIndex: number
  width: number
  onSelect: (index: number) => void
  onActivate: (browser: GitBrowser) => void
}) {
  return GIT_BROWSER_OPTIONS.map((option, index) => {
    const activate = () => {
      onSelect(index)
      onActivate(option)
    }
    return (
      <Button
        key={option}
        id={`git-configuration-browser-${option}`}
        height={2}
        flexShrink={0}
        onPress={activate}
      >
        {/* biome-ignore lint/a11y/noStaticElementInteractions: The visible row forwards mouse activation to its Button action. */}
        <box
          onMouseDown={activate}
          style={{
            height: 2,
            paddingLeft: 1,
            paddingRight: 1,
            backgroundColor: selectedIndex === index ? COLORS.panelRaised : COLORS.panel,
          }}
        >
          <text
            content={truncateDisplay(
              `${selectedIndex === index ? "▶" : " "} ${browser === option ? "●" : "○"} ${translateUi(gitBrowserLabel(option))}`,
              width - 4,
            )}
            style={{ fg: browser === option || selectedIndex === index ? COLORS.git : COLORS.text }}
          />
          <text
            content={truncateDisplay(`  ${translateUi(gitBrowserDescription(option))}`, width - 4)}
            style={{ fg: COLORS.muted }}
          />
        </box>
      </Button>
    )
  })
}
