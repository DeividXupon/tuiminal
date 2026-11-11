import type { ScrollBoxRenderable } from "@opentui/core"
import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
  type RefObject,
} from "react"
import { displayWidth, translateUi } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { ShortcutText } from "@xupon/tuiminal-core/ui/ShortcutText"
import type { HttpRequestTableNavigation } from "../hooks/use-http-request-tables"
import type { HttpKeyValue } from "../model/types"

// Headers, saved rows and the draft use exactly the same column geometry.
export const REQUEST_TABLE_ACTION_WIDTH = 5
const TableColumns = createContext({ name: 1, value: 1, kind: 6 })
export function useHttpRequestTableColumns() {
  return useContext(TableColumns)
}

type Navigation = Pick<
  HttpRequestTableNavigation<HttpKeyValue>,
  "active" | "mode" | "row" | "column" | "onEnter" | "onFocusBlock"
>

function tableHint(navigation: Navigation, multipart: boolean) {
  if (navigation.mode === "cell") return "[Tab] Próximo campo · [Esc] Tabela"
  if (navigation.column === 2) return "[Enter] Excluir linha · [Esc] Voltar"
  if (multipart && navigation.column === -1) return "[T] Texto · [F] Arquivo · [Esc] Voltar"
  if (navigation.column < 0) return "[Space] Ativar/desativar · [Esc] Voltar"
  return "[Enter] Editar · [Space] Ativar/desativar"
}

function entryLabel(active: boolean, populated: boolean) {
  if (populated) return active ? "[Enter] Tabela" : "Editar"
  return active ? "[Enter] Adicionar" : "Adicionar"
}

export function HttpRequestTable({
  idPrefix,
  title,
  count,
  enabledCount,
  navigation,
  scrollRef,
  children,
  dense = false,
  multipart = false,
  fillHeight = false,
}: {
  idPrefix: string
  title: string
  count: number
  enabledCount: number
  navigation: Navigation
  scrollRef: RefObject<ScrollBoxRenderable | null>
  children: ReactNode
  dense?: boolean
  multipart?: boolean
  fillHeight?: boolean
}) {
  const [viewportWidth, setViewportWidth] = useState(0)
  const kindWidth =
    Math.max(...["Text", "File", "Tipo"].map((label) => displayWidth(translateUi(label)))) + 2
  const available = Math.max(
    2,
    viewportWidth - REQUEST_TABLE_ACTION_WIDTH * 2 - 1 - (multipart ? kindWidth : 0),
  )
  const nameWidth = Math.max(1, Math.floor(available * 0.4))
  const columns = { name: nameWidth, value: available - nameWidth, kind: kindWidth }
  const revealRow = useCallback(() => {
    const scroll = scrollRef.current
    if (!scroll || !navigation.active) return
    const height = Math.max(1, scroll.viewport.height)
    if (navigation.mode === "block") {
      // Leaving the table removes its draft row; keep the remaining rows in view.
      const rows = Math.max(1, count) + (dense ? 0 : 1)
      scroll.scrollTo(Math.min(scroll.scrollTop, Math.max(0, rows - height)))
      return
    }
    const row = navigation.row + (dense ? 0 : 1)
    if (row < scroll.scrollTop) scroll.scrollTo(row)
    else if (row >= scroll.scrollTop + height) scroll.scrollTo(row - height + 1)
  }, [count, dense, navigation.active, navigation.mode, navigation.row, scrollRef])
  const measure = useCallback(() => {
    const width = scrollRef.current?.viewport.width ?? 0
    if (width > 0) setViewportWidth(width)
    revealRow()
  }, [revealRow, scrollRef])
  useEffect(() => {
    const timer = setTimeout(measure, 0)
    return () => clearTimeout(timer)
  }, [measure])
  return (
    <TableColumns.Provider value={columns}>
      <box
        id={`http-key-value-section-${idPrefix}`}
        focusable
        style={{
          border: ["left"],
          borderColor: navigation.active ? COLORS.http : COLORS.border,
          flexGrow:
            !fillHeight && count === 0 && (!navigation.active || navigation.mode === "block")
              ? 0
              : 1,
          flexBasis: 0,
          minHeight: fillHeight
            ? 0
            : dense && (!navigation.active || navigation.mode === "block")
              ? 2
              : 3,
          overflow: "hidden",
          backgroundColor: COLORS.canvas,
        }}
      >
        <box
          id={`http-key-value-heading-${idPrefix}`}
          height={1}
          flexShrink={0}
          flexDirection="row"
          backgroundColor={COLORS.panelRaised}
        >
          <text
            {...(navigation.active ? {} : { onMouseDown: navigation.onFocusBlock })}
            content={translateUi(title)}
            wrapMode="none"
            style={{
              width: 0,
              flexGrow: 1,
              minWidth: 0,
              fg: navigation.active ? COLORS.http : COLORS.text,
            }}
          />
          <text
            id={`http-key-value-count-${idPrefix}`}
            content={` ● ${enabledCount}/${count} `}
            style={{ fg: COLORS.muted, flexShrink: 0 }}
          />
          {!navigation.active || navigation.mode === "block" ? (
            <InlineButton
              id={`http-key-value-enter-${idPrefix}`}
              label={entryLabel(navigation.active, count > 0)}
              accent={COLORS.http}
              onPress={navigation.onEnter}
            />
          ) : null}
        </box>
        <scrollbox
          id={`http-key-value-scroll-${idPrefix}`}
          ref={scrollRef}
          viewportOptions={{ onSizeChange: measure }}
          scrollY
          viewportCulling
          style={{ flexGrow: 1, minHeight: 1, backgroundColor: COLORS.canvas }}
        >
          {dense ? null : (
            <box
              id={`http-key-value-columns-${idPrefix}`}
              height={1}
              flexShrink={0}
              flexDirection="row"
              backgroundColor={COLORS.panelAlt}
            >
              <text
                content=" ●"
                width={REQUEST_TABLE_ACTION_WIDTH}
                flexShrink={0}
                fg={COLORS.muted}
              />
              {multipart ? (
                <text
                  content={translateUi("Tipo")}
                  width={columns.kind}
                  flexShrink={0}
                  fg={COLORS.http}
                />
              ) : null}
              <text
                id={`http-key-value-name-heading-${idPrefix}`}
                content={translateUi("NOME")}
                wrapMode="none"
                style={{ width: columns.name, flexShrink: 0, fg: COLORS.http }}
              />
              <text content="│" width={1} flexShrink={0} fg={COLORS.border} />
              <text
                id={`http-key-value-value-heading-${idPrefix}`}
                content={translateUi("VALOR")}
                wrapMode="none"
                style={{ width: columns.value, flexShrink: 0, fg: COLORS.http }}
              />
              <text content="" width={REQUEST_TABLE_ACTION_WIDTH} flexShrink={0} />
            </box>
          )}
          {children}
        </scrollbox>
        {navigation.active && navigation.mode !== "block" ? (
          <ShortcutText
            content={tableHint(navigation, multipart)}
            wrapMode="none"
            style={{ height: 1, flexShrink: 0, fg: COLORS.muted, bg: COLORS.canvas }}
          />
        ) : null}
      </box>
    </TableColumns.Provider>
  )
}
