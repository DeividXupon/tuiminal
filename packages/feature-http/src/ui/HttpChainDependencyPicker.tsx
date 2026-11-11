import type { KeyEvent, ScrollBoxRenderable } from "@opentui/core"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { Button } from "@tuiparts/react/button"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { ShortcutText } from "@xupon/tuiminal-core/ui/ShortcutText"
import { useEffect, useRef, useState } from "react"
import { httpChainPlan } from "../model/chaining"
import type { HttpProjectRequestItem, HttpRequestDefinition } from "../model/types"
import { HttpDialog } from "./HttpDialog"
import { HttpDialogSection } from "./HttpDialogDetails"

export function HttpChainDependencyPicker({
  request,
  requests,
  onChange,
  onClose,
}: {
  request: HttpRequestDefinition
  requests: HttpProjectRequestItem[]
  onChange: (id: string | undefined) => void
  onClose: () => void
}) {
  const renderer = useRenderer()
  const { width, height } = useTerminalDimensions()
  const scroll = useRef<ScrollBoxRenderable | null>(null)
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState(0)
  const [searching, setSearching] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const choices: (HttpProjectRequestItem | null)[] = [
    null,
    ...requests.filter(
      (item) =>
        item.request.id !== request.id &&
        (item.request.source.kind !== "file" || item.request.source.supported !== false) &&
        `${item.request.method} ${item.request.name} ${item.filePath}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    ),
  ]
  const choose = (index: number) => {
    const candidate = choices[index]
    const chain = {
      ...request.chain,
      extract: request.chain?.extract ?? [],
      ...(candidate ? { dependsOn: candidate.request.id } : {}),
    }
    if (!candidate) delete chain.dependsOn
    const plan = httpChainPlan({ ...request, chain }, requests)
    if (plan.error) {
      setError(plan.error)
      return
    }
    onChange(candidate?.request.id)
    onClose()
  }
  useEffect(() => {
    renderer.root
      .findDescendantById(searching ? "http-chain-picker-search" : "http-chain-picker-list")
      ?.focus()
    const timer = setTimeout(() => {
      const target = renderer.root.findDescendantById(`http-chain-picker-option-${selected}`)
      const view = scroll.current
      if (!target || !view) return
      const top = target.screenY - view.viewport.screenY
      const bottom = top + target.height - view.viewport.height
      if (top < 0) view.scrollBy(top)
      else if (bottom > 0) view.scrollBy(bottom)
    }, 0)
    return () => clearTimeout(timer)
  }, [renderer, searching, selected])
  const handleKey = (key: KeyEvent) => {
    if (key.defaultPrevented) return
    let handled = true
    if (key.name === "escape") onClose()
    else if (key.name === "tab") setSearching(!searching)
    else if (["enter", "return"].includes(key.name)) choose(selected)
    else if (key.name === "down" || (!searching && key.name === "j"))
      setSelected(Math.min(choices.length - 1, selected + 1))
    else if (key.name === "up" || (!searching && key.name === "k"))
      setSelected(Math.max(0, selected - 1))
    else handled = false
    if (handled) {
      key.preventDefault()
      key.stopPropagation()
    }
  }
  useKeyboard(handleKey)
  return (
    <HttpDialog
      id="http-chain-picker-modal"
      title="ESCOLHER REQUEST ANTERIOR"
      width={78}
      height={Math.min(
        22,
        9 + choices.reduce((rows, choice) => rows + (choice ? 2 : 1), 0) + Number(Boolean(error)),
      )}
      terminalWidth={width}
      terminalHeight={height}
      onClose={onClose}
      actions={[
        {
          id: "http-chain-picker-confirm",
          label: "[Enter] Confirmar",
          onPress: () => choose(selected),
        },
      ]}
    >
      <HttpDialogSection title="REQUISIÇÃO">
        <text
          content={`${request.method} ${request.name}`}
          wrapMode="none"
          style={{ height: 1, fg: COLORS.text }}
        />
      </HttpDialogSection>
      <input
        id="http-chain-picker-search"
        value={query}
        focused={searching}
        placeholder={translateUi("Buscar por nome, método ou coleção")}
        onMouseDown={() => setSearching(true)}
        onInput={(value) => {
          setQuery(value)
          setSelected(0)
          setError(null)
        }}
        onKeyDown={handleKey}
        style={{
          marginTop: height >= 20 ? 1 : 0,
          flexShrink: 0,
          backgroundColor: COLORS.canvas,
          focusedBackgroundColor: COLORS.panelRaised,
        }}
      />
      <scrollbox
        id="http-chain-picker-list"
        ref={scroll}
        focusable
        scrollY
        viewportCulling={false}
        flexGrow={1}
        minHeight={1}
      >
        {choices.map((choice, index) => (
          <Button
            key={choice?.request.id ?? "none"}
            id={`http-chain-picker-option-${index}`}
            height={choice ? 2 : 1}
            flexShrink={0}
            width="100%"
            onPress={() => choose(index)}
          >
            <box
              width="100%"
              backgroundColor={
                selected === index
                  ? COLORS.diffModifiedBg
                  : index % 2
                    ? COLORS.panelAlt
                    : COLORS.panel
              }
            >
              <text
                content={
                  choice
                    ? `${choice.request.method}  ${choice.request.name}`
                    : translateUi("Nenhuma dependência")
                }
                fg={selected === index ? COLORS.http : COLORS.text}
                wrapMode="none"
                height={1}
              />
              {choice ? (
                <text
                  content={choice.filePath || translateUi("Scratch aberto")}
                  fg={COLORS.muted}
                  wrapMode="none"
                  height={1}
                />
              ) : null}
            </box>
          </Button>
        ))}
      </scrollbox>
      {error ? <text content={translateUi(error)} fg={COLORS.danger} flexShrink={0} /> : null}
      <ShortcutText
        content="[↑/↓] Navegar"
        style={{ height: 1, flexShrink: 0, fg: COLORS.muted }}
      />
    </HttpDialog>
  )
}
