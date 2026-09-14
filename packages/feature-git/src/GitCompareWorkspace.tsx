import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { useCallback, useEffect, useState } from "react"
import { COLORS, LAYOUT } from "@xupon/tuiminal-core/settings/theme"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { useNotificationFromValue } from "@xupon/tuiminal-core/notifications/index"
import { ShortcutText } from "@xupon/tuiminal-core/ui/ShortcutText"
import { useLocalConfigurationShortcut } from "./hooks/use-local-configuration-shortcut"
import {
  comparisonRefByName,
  type GitBranchComparison,
  type GitComparisonContext,
  gitComparisonKeyboardAction,
  preserveComparisonRef,
} from "./model/branch-comparison"
import type { DiffLayout } from "./model/view"
import { loadGitBranchComparison, loadGitComparisonContext } from "./services/branch-comparison"
import { GitCompareBranchPicker, type GitComparePickerSide } from "./ui/base/GitCompareBranchPicker"
import { GitComparisonResult } from "./ui/base/GitComparisonResult"
import { GitComparisonSelector } from "./ui/base/GitComparisonSelector"

function nextDiffLayout(layout: DiffLayout): DiffLayout {
  return layout === "unified" ? "split" : layout === "split" ? "inline" : "unified"
}

export function GitCompareWorkspace({
  active,
  targetDirectory,
  onOpenLocalConfiguration,
  onExit,
}: {
  active: boolean
  targetDirectory: string
  onOpenLocalConfiguration?: (() => void) | undefined
  onExit: () => void
}) {
  const terminal = useTerminalDimensions()
  const renderer = useRenderer()
  const compactShortcuts = terminal.width < 110
  const [context, setContext] = useState<GitComparisonContext | null>(null)
  const [baseRef, setBaseRef] = useState<string | null>(null)
  const [comparedRef, setComparedRef] = useState<string | null>(null)
  const [picker, setPicker] = useState<GitComparePickerSide | null>(null)
  const [comparison, setComparison] = useState<GitBranchComparison | null>(null)
  const [loadingContext, setLoadingContext] = useState(true)
  const [loadingComparison, setLoadingComparison] = useState(false)
  const [error, setError] = useState("")
  const [layout, setLayout] = useState<DiffLayout>("unified")
  useNotificationFromValue(error, { source: "Git", kind: "error" })
  useLocalConfigurationShortcut(active && !picker, onOpenLocalConfiguration)

  useEffect(() => {
    if (!active) return
    renderer.currentFocusedRenderable?.blur()
    const timeout = setTimeout(() => {
      renderer.root.findDescendantById("git-compare-project")?.focus()
    }, 0)
    return () => clearTimeout(timeout)
  }, [active, renderer])

  const refreshContext = useCallback(async () => {
    setLoadingContext(true)
    setError("")
    try {
      const next = await loadGitComparisonContext(targetDirectory)
      setContext(next)
      setBaseRef((current) => preserveComparisonRef(next.refs, current))
      setComparedRef((current) => preserveComparisonRef(next.refs, current))
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : translateUi("Não foi possível carregar as branches."),
      )
    } finally {
      setLoadingContext(false)
    }
  }, [targetDirectory])

  useEffect(() => {
    void targetDirectory
    setContext(null)
    setBaseRef(null)
    setComparedRef(null)
    setComparison(null)
    setPicker(null)
    setLoadingContext(false)
  }, [targetDirectory])

  useEffect(() => {
    if (active && !context && !loadingContext) void refreshContext()
  }, [active, context, loadingContext, refreshContext])

  useEffect(() => {
    const root = context?.isRepository ? context.root : null
    if (!active || !root || !baseRef || !comparedRef) {
      setComparison(null)
      return
    }
    if (baseRef === comparedRef) {
      setComparison(null)
      setError(translateUi("Escolha duas branches diferentes para comparar."))
      return
    }
    let cancelled = false
    setLoadingComparison(true)
    setError("")
    void loadGitBranchComparison({ root, baseRef, comparedRef })
      .then((next) => {
        if (!cancelled) setComparison(next)
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setComparison(null)
          setError(
            loadError instanceof Error
              ? loadError.message
              : translateUi("Não foi possível comparar as branches selecionadas."),
          )
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingComparison(false)
      })
    return () => {
      cancelled = true
    }
  }, [active, baseRef, comparedRef, context])

  useKeyboard((key) => {
    if (!active || key.ctrl || key.meta || key.super) return
    if (picker) {
      if (
        key.name === "escape" &&
        renderer.currentFocusedRenderable?.id !== "git-compare-branch-search"
      ) {
        key.preventDefault()
        key.stopPropagation()
        setPicker(null)
      }
      return
    }
    const action = gitComparisonKeyboardAction(key.name, Boolean(baseRef && comparedRef))
    if (action === "exit") {
      key.preventDefault()
      key.stopPropagation()
      onExit()
    } else if (action === "pick-base") setPicker("base")
    else if (action === "pick-compared") setPicker("compared")
    else if (action === "change-layout") setLayout(nextDiffLayout)
    else if (action === "refresh") void refreshContext()
  })

  const base = comparisonRefByName(context?.refs ?? [], baseRef)
  const compared = comparisonRefByName(context?.refs ?? [], comparedRef)
  const selectionsComplete = Boolean(base && compared)

  return (
    <box
      style={{
        flexGrow: 1,
        backgroundColor: COLORS.canvas,
        padding: LAYOUT.outerPadding,
        gap: LAYOUT.gap,
      }}
    >
      <GitComparisonSelector
        context={context}
        base={base}
        compared={compared}
        loading={loadingContext}
        terminalWidth={terminal.width}
        complete={selectionsComplete}
        onConfigure={() => onOpenLocalConfiguration?.()}
        onPick={setPicker}
      />
      {selectionsComplete && base && compared ? (
        <GitComparisonResult
          active={active && !picker}
          comparison={comparison}
          loading={loadingComparison}
          error={error}
          baseName={base.name}
          comparedName={compared.name}
          layout={layout}
          onLayout={setLayout}
          terminalHeight={terminal.height}
          terminalWidth={terminal.width}
        />
      ) : error ? (
        <text content={error} style={{ fg: COLORS.danger }} />
      ) : null}
      <ShortcutText
        id="git-compare-shortcut-footer"
        content={translateUi(
          selectionsComplete
            ? compactShortcuts
              ? "[Tab/H/L] Painel  [Shift+H/L] Lateral  [J/K] Vertical  [C/Esc] Diffs"
              : "[Tab/H/L/←/→] Árvore/diff  [Shift+H/L/←/→] Lateral  [J/K] Vertical  [B] Base  [T] Comparada  [V] Visual  [C/Esc] Diffs"
            : "[Ctrl+P] Projeto  [B] Base  [T] Comparada  [C/Esc] Diffs",
        )}
        style={{
          width: "100%",
          height: 1,
          flexShrink: 0,
          overflow: "hidden",
          fg: COLORS.muted,
          bg: COLORS.panelRaised,
          zIndex: 30,
        }}
      />
      {picker && context ? (
        <GitCompareBranchPicker
          side={picker}
          references={context.refs}
          selectedRef={picker === "base" ? baseRef : comparedRef}
          onSelect={picker === "base" ? setBaseRef : setComparedRef}
          onClose={() => setPicker(null)}
        />
      ) : null}
    </box>
  )
}
