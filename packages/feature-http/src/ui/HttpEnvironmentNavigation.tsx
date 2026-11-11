import { ShortcutText } from "@xupon/tuiminal-core/ui/ShortcutText"
import { useState } from "react"
import { HttpEnvironmentMenu } from "./HttpEnvironmentMenu"
import { useHttpEnvironmentNavigation } from "../hooks/use-http-environment-navigation"
import { Button } from "@tuiparts/react/button"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import type { HttpEnvironmentTabs } from "../hooks/use-http-environment-tabs"

export function HttpEnvironmentNavigation({
  environments,
  width,
  active,
}: {
  environments: HttpEnvironmentTabs
  width: number
  active: boolean
}) {
  const rows = [{ key: "@globals", name: "Global" }, ...environments.entries]
  const [menuIndex, setMenuIndex] = useState<number | null>(null)
  const menu = menuIndex === null ? null : rows[menuIndex]
  const select = useHttpEnvironmentNavigation(environments, rows, active, {
    menuOpen: menuIndex !== null,
    openMenu: (index) => {
      if (index > 0) setMenuIndex(index)
    },
  })
  function openMenu(index: number) {
    select(index)
    setMenuIndex(index)
  }
  return (
    <>
      {menu && active && !environments.pending ? (
        <HttpEnvironmentMenu
          entry={menu}
          anchorId={`http-environment-actions-${menuIndex}`}
          onClose={() => setMenuIndex(null)}
          onSelect={(action) => {
            setMenuIndex(null)
            if (action === "activate") void environments.activate(menu.key)
            else void environments.removeEntry(menu)
          }}
        />
      ) : null}
      {rows.map((entry, index) => (
        <EnvironmentRow
          key={entry.key}
          entry={entry}
          index={index}
          width={width}
          selected={environments.active?.key === entry.key}
          enabled={environments.selectedKey === entry.key}
          active={active}
          onActions={() => openMenu(index)}
          onPress={() => {
            select(index)
            environments.open(entry)
          }}
        />
      ))}
      {environments.loading ? (
        <text content={translateUi("Carregando…")} style={{ fg: COLORS.muted }} />
      ) : null}
      {environments.error ? (
        <text content={translateUi(environments.error)} style={{ fg: COLORS.danger }} />
      ) : null}
      {!environments.entries.length && !environments.loading && !environments.error ? (
        <text
          content={translateUi("Nenhum ambiente neste workspace.")}
          style={{ fg: COLORS.muted }}
        />
      ) : null}
      <box style={{ height: 1 }} />
      <InlineButton
        id="http-environment-new"
        label="[N] Novo ambiente"
        accent={COLORS.http}
        onPress={environments.create}
      />
      <InlineButton
        id="http-environment-refresh"
        label="[R] Atualizar"
        accent={COLORS.http}
        onPress={() => void environments.refresh()}
      />
      <InlineButton
        id="http-environment-none"
        label="Sem ambiente"
        accent={COLORS.http}
        active={!environments.selectedKey}
        onPress={() => void environments.activate(null)}
      />
      <ShortcutText
        content="[→/L] Tabela · [A] Ações"
        style={{ fg: COLORS.muted, flexShrink: 0 }}
      />
    </>
  )
}

function EnvironmentRow({
  entry,
  index,
  width,
  selected,
  enabled,
  active,
  onPress,
  onActions,
}: {
  entry: { key: string; name: string }
  index: number
  width: number
  selected: boolean
  enabled: boolean
  active: boolean
  onPress: () => void
  onActions: () => void
}) {
  const global = index === 0
  const symbol = global ? "◆" : enabled ? "●" : "◇"
  return (
    <box height={global ? 3 : 1} flexShrink={0} flexDirection="row">
      <Button
        id={`http-environment-entry-${index}`}
        height={global ? 3 : 1}
        width={0}
        flexGrow={1}
        onPress={onPress}
      >
        {({ focused }) => (
          <box
            style={{
              height: global ? 3 : 1,
              paddingLeft: 1,
              backgroundColor:
                (active && focused) || global
                  ? COLORS.diffModifiedBg
                  : selected
                    ? COLORS.panelRaised
                    : COLORS.panel,
            }}
          >
            <text
              content={truncateDisplay(
                `${active && focused ? "› " : ""}${symbol} ${entry.name}`,
                Math.max(1, width - (global ? 1 : 6)),
              )}
              style={{ fg: (active && focused) || global ? COLORS.http : COLORS.text }}
            />
            {global ? (
              <text
                content={truncateDisplay(translateUi("Sempre ativo"), width - 1)}
                style={{ fg: COLORS.muted }}
              />
            ) : null}
          </box>
        )}
      </Button>
      {!global ? (
        <InlineButton
          id={`http-environment-actions-${index}`}
          label="[A]"
          accent={COLORS.http}
          onPress={onActions}
        />
      ) : null}
    </box>
  )
}
