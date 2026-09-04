import { ShortcutText } from "../../../shared/ui/ShortcutText"
import type { ScrollBoxRenderable } from "@opentui/core"
import type { ButtonRenderable } from "@tuiparts/core/button"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { Button } from "@tuiparts/react/button"
import { useEffect, useRef, useState } from "react"
import { translateUi, truncateDisplay } from "../../../shared/i18n/index"
import { COLORS } from "../../../core/settings/theme"
import { InlineButton } from "../../../shared/ui/InlineButton"

export type DatabaseChangeReviewItem = {
  id: string
  kind: "insert" | "update" | "delete"
  tableName: string
  sql: string
  parameters: unknown[]
  approved: boolean
  description: string
}

type DatabaseChangesModalProps = {
  open: boolean
  items: DatabaseChangeReviewItem[]
  busy: boolean
  notice: string
  onClose: () => void
  onToggle: (id: string) => void
  onToggleAll: () => void
  onExecute: () => void
}

function shorten(value: string, length: number) {
  return truncateDisplay(translateUi(value), length)
}

function parameterText(parameters: unknown[]) {
  if (!parameters.length) return "sem parâmetros"
  try {
    return parameters.map((value, index) => `$${index + 1}=${JSON.stringify(value)}`).join("  ")
  } catch {
    return parameters.map((value, index) => `$${index + 1}=${String(value)}`).join("  ")
  }
}

const KIND_LABEL = {
  insert: "INSERT",
  update: "UPDATE",
  delete: "DELETE",
} as const

const KIND_COLOR = {
  insert: COLORS.runner,
  update: COLORS.warning,
  delete: COLORS.danger,
} as const

export function DatabaseChangesModal({
  open,
  items,
  busy,
  notice,
  onClose,
  onToggle,
  onToggleAll,
  onExecute,
}: DatabaseChangesModalProps) {
  const renderer = useRenderer()
  const terminal = useTerminalDimensions()
  const itemRefs = useRef<Array<ButtonRenderable | null>>([])
  const listRef = useRef<ScrollBoxRenderable | null>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)

  useEffect(() => {
    if (!open) return
    renderer.currentFocusedRenderable?.blur()
    setSelectedIndex(0)
    listRef.current?.scrollTo(0)
    const timeout = setTimeout(() => {
      itemRefs.current[0]?.focus()
      listRef.current?.scrollTo(0)
    }, 0)
    return () => clearTimeout(timeout)
  }, [open, renderer])

  useEffect(() => {
    if (!open) return
    itemRefs.current[selectedIndex]?.focus()
    listRef.current?.scrollChildIntoView(`database-changes-item-${selectedIndex}`)
  }, [open, selectedIndex])

  useEffect(() => {
    if (!open) return
    return () => {
      if (renderer.currentFocusedRenderable?.id?.startsWith("database-changes-item-")) {
        renderer.currentFocusedRenderable.blur()
      }
    }
  }, [open, renderer])

  useKeyboard((key) => {
    if (!open) return
    if (key.name === "escape") {
      key.preventDefault()
      if (!busy) onClose()
      return
    }
    if (busy) {
      key.preventDefault()
      return
    }
    if (key.name === "up" || key.name === "k") {
      key.preventDefault()
      setSelectedIndex((current) => Math.max(0, current - 1))
    } else if (key.name === "down" || key.name === "j") {
      key.preventDefault()
      setSelectedIndex((current) => Math.min(Math.max(0, items.length - 1), current + 1))
    } else if (key.name === "enter" || key.name === "return" || key.name === "space") {
      key.preventDefault()
      const selected = items[selectedIndex]
      if (selected) onToggle(selected.id)
    } else if (key.name === "a") {
      key.preventDefault()
      onToggleAll()
    } else if (key.ctrl && key.name === "s") {
      key.preventDefault()
      onExecute()
    }
  })

  if (!open) return null
  const width = Math.max(1, Math.min(118, terminal.width - 2))
  const height = Math.max(1, Math.min(28, terminal.height))
  const compact = width < 88
  const approvedCount = items.filter((item) => item.approved).length
  const allApproved = items.length > 0 && approvedCount === items.length
  const contentWidth = Math.max(8, width - 8)
  const kindWidth = compact ? 10 : 13

  return (
    <>
      <Button
        onPress={() => {
          if (!busy) onClose()
        }}
        position="absolute"
        top={0}
        left={0}
        width="100%"
        height="100%"
        zIndex={960}
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
          zIndex: 961,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <box
          style={{
            width,
            height,
            border: true,
            borderStyle: "rounded",
            borderColor: COLORS.warning,
            backgroundColor: COLORS.canvas,
            paddingLeft: 1,
            paddingRight: 1,
          }}
        >
          <box
            style={{
              height: compact ? 2 : 3,
              flexShrink: 0,
              border: ["bottom"],
              borderColor: COLORS.border,
            }}
          >
            <box
              style={{
                height: 1,
                flexShrink: 0,
                flexDirection: "row",
                justifyContent: "space-between",
              }}
            >
              <text content="◆ REVISAR ALTERAÇÕES SQL" style={{ fg: COLORS.warning }} />
              <text
                content={`${approvedCount}/${items.length} aprovadas`}
                style={{ fg: approvedCount ? COLORS.success : COLORS.muted }}
              />
            </box>
            {compact ? null : (
              <text
                content="Nenhum comando foi executado. Selecione o que deseja aplicar."
                style={{ fg: COLORS.muted }}
              />
            )}
          </box>

          <scrollbox
            ref={listRef}
            scrollY
            viewportCulling
            style={{ flexGrow: 1, width: "100%" }}
            verticalScrollbarOptions={{
              trackOptions: { backgroundColor: COLORS.panel, foregroundColor: COLORS.border },
            }}
          >
            {items.map((item, index) => (
              <Button
                ref={(renderable) => {
                  itemRefs.current[index] = renderable
                }}
                key={item.id}
                id={`database-changes-item-${index}`}
                onPress={() => {
                  setSelectedIndex(index)
                  onToggle(item.id)
                }}
                height={5}
                width="100%"
                flexShrink={0}
              >
                {(state) => (
                  <box
                    style={{
                      height: 5,
                      flexShrink: 0,
                      paddingLeft: 1,
                      backgroundColor:
                        state.focused || index === selectedIndex
                          ? COLORS.panelRaised
                          : index % 2 === 0
                            ? COLORS.panel
                            : COLORS.panelAlt,
                    }}
                  >
                    <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
                      <text
                        content={`${item.approved ? "◆" : "◇"} ${KIND_LABEL[item.kind]}`}
                        style={{
                          width: kindWidth,
                          flexShrink: 0,
                          fg: item.approved ? KIND_COLOR[item.kind] : COLORS.muted,
                        }}
                      />
                      <text
                        content={shorten(item.tableName, Math.max(6, contentWidth - kindWidth))}
                        style={{ fg: COLORS.text }}
                      />
                    </box>
                    <text
                      content={`${translateUi("Alteração")}: ${shorten(item.description, Math.max(4, contentWidth - 12))}`}
                      style={{ fg: COLORS.muted }}
                    />
                    <text
                      content={shorten(item.sql, contentWidth)}
                      style={{ fg: KIND_COLOR[item.kind] }}
                    />
                    <text
                      content={shorten(parameterText(item.parameters), contentWidth)}
                      style={{ fg: COLORS.muted }}
                    />
                    <text
                      content={item.approved ? "APROVADO PARA EXECUÇÃO" : "não aprovado"}
                      style={{ fg: item.approved ? COLORS.success : COLORS.border }}
                    />
                  </box>
                )}
              </Button>
            ))}
          </scrollbox>

          <box
            style={{
              height: 3,
              flexShrink: 0,
              flexDirection: "column",
              border: ["top"],
              borderColor: COLORS.border,
            }}
          >
            <ShortcutText
              content={
                notice ||
                (compact
                  ? "[↑↓] navegar · [Enter] aprovar · [Ctrl+S] executar"
                  : "[↑↓] navegar · [Enter/Space] aprovar · [A] todos · [Ctrl+S] executar")
              }
              style={{
                height: 1,
                flexShrink: 0,
                fg: notice.startsWith("Erro") ? COLORS.danger : COLORS.muted,
              }}
            />
            <box
              style={{ height: 1, flexShrink: 0, flexDirection: "row", justifyContent: "flex-end" }}
            >
              <InlineButton
                label={
                  compact ? "[A] Todos" : allApproved ? "[A] Desmarcar todos" : "[A] Aprovar todos"
                }
                accent={COLORS.database}
                disabled={busy}
                onPress={onToggleAll}
              />
              <InlineButton
                label={
                  busy
                    ? "[Ctrl+S] Executando…"
                    : compact
                      ? `[Ctrl+S] ${approvedCount}`
                      : `[Ctrl+S] Executar ${approvedCount}`
                }
                accent={COLORS.success}
                disabled={busy || approvedCount === 0}
                onPress={onExecute}
              />
            </box>
          </box>
        </box>
      </box>
    </>
  )
}
