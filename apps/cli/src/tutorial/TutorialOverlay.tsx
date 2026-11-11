import type { BoxRenderable, Renderable } from "@opentui/core"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { Button } from "@tuiparts/react/button"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { loadedFeature } from "../features/registry"
import { displayWidth, translateUi } from "@xupon/tuiminal-core/i18n/index"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { ShortcutText } from "@xupon/tuiminal-core/ui/ShortcutText"
import { TutorialTargetOutline } from "./TutorialTargetOutline"
import { DATABASE_TUTORIAL_STEPS } from "./database-steps"

import type { TutorialStep } from "./types"
export type { TutorialStep } from "./types"
type TargetRect = { x: number; y: number; width: number; height: number }
type CardGeometry = { x: number; y: number; width: number; height: number }

type CardLayout = CardGeometry & {
  descriptionHeight: number
  hintHeight: number
}

type TutorialOverlayProps = {
  open: boolean
  steps: TutorialStep[]
  onClose: () => void
  onStepChange?: (targetId: string | null) => void
}

const GENERIC_TUTORIAL_STEPS: TutorialStep[] = [
  {
    targetId: "tutorial-current-tool",
    group: "ÁREA DE TRABALHO",
    title: "Ferramenta atual",
    description:
      "Esta é a área principal da funcionalidade aberta. Todos os blocos também aceitam interação pelo mouse.",
    hint: "Os atalhos disponíveis aparecem junto de cada ação.",
    kind: "block",
  },
]

function isVisible(renderable: Renderable) {
  let current: Renderable | null = renderable
  while (current) {
    if (!current.visible) return false
    current = current.parent
  }
  return true
}

function visibleTutorialTarget(root: Renderable, id: string): Renderable | null {
  if (!root.visible) return null
  if (root.id === id) return root
  for (const child of root.getChildren()) {
    const target = visibleTutorialTarget(child, id)
    if (target) return target
  }
  return null
}

function sameSteps(left: TutorialStep[], right: TutorialStep[]) {
  return (
    left.length === right.length &&
    left.every((step, index) => step.targetId === right[index]?.targetId)
  )
}

function sameRect(left: TargetRect | null, right: TargetRect | null) {
  if (!left || !right) return left === right
  return (
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height
  )
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value))
}

export function estimateTutorialTextHeight(
  value: string,
  width: number,
  minimum: number,
  maximum: number,
) {
  const lineWidth = Math.max(1, width)
  let lines = 0

  for (const paragraph of value.split("\n")) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean)
    if (!words.length) {
      lines += 1
      continue
    }

    let used = 0
    for (const word of words) {
      const wordWidth = displayWidth(word)
      const required = wordWidth + (used > 0 ? 1 : 0)
      if (used > 0 && used + required > lineWidth) {
        lines += 1
        used = 0
      }
      if (wordWidth > lineWidth) {
        lines += Math.floor(wordWidth / lineWidth)
        used = wordWidth % lineWidth
      } else {
        used += wordWidth + (used > 0 ? 1 : 0)
      }
    }
    if (used > 0) lines += 1
  }

  return clamp(lines, minimum, maximum)
}

export function getTutorialSteps(screen: string): TutorialStep[] {
  if (screen === "database") return DATABASE_TUTORIAL_STEPS
  if (screen === "runner")
    return (loadedFeature("runner")?.RUNNER_TUTORIAL_STEPS ?? []).map((step) => ({
      ...step,
      accent: COLORS.runner,
    }))
  if (screen === "git") return [...(loadedFeature("git")?.GIT_TUTORIAL_STEPS ?? [])]
  if (screen === "http") return [...(loadedFeature("http")?.HTTP_TUTORIAL_STEPS ?? [])]
  if (screen === "terminal") return [...(loadedFeature("terminal")?.TERMINAL_TUTORIAL_STEPS ?? [])]
  return GENERIC_TUTORIAL_STEPS
}

export function TutorialOverlay({ open, steps, onClose, onStepChange }: TutorialOverlayProps) {
  const renderer = useRenderer()
  const cardRef = useRef<BoxRenderable | null>(null)
  const terminal = useTerminalDimensions()
  const [availableSteps, setAvailableSteps] = useState<TutorialStep[]>([])
  const [stepIndex, setStepIndex] = useState(0)
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null)
  const [contentOpacity, setContentOpacity] = useState(1)
  const [transitioning, setTransitioning] = useState(false)
  const transitionTimersRef = useRef<Array<ReturnType<typeof setTimeout>>>([])

  useEffect(() => {
    if (!open) return
    const previous = renderer.currentFocusedRenderable
    previous?.blur()
    cardRef.current?.focus()
    return () => {
      if (previous && !previous.isDestroyed && isVisible(previous)) previous.focus()
    }
  }, [open, renderer])

  useEffect(() => {
    if (!open) {
      setAvailableSteps([])
      setStepIndex(0)
      setTargetRect(null)
      return
    }

    const inspectTargets = () => {
      const available = steps.filter((step) => {
        if (step.stateful) return true
        const target = visibleTutorialTarget(renderer.root, step.targetId)
        return Boolean(
          target &&
            isVisible(target) &&
            target.width > 0 &&
            target.height > 0 &&
            target.screenX < terminal.width &&
            target.screenY < terminal.height &&
            target.screenX + target.width > 0 &&
            target.screenY + target.height > 0,
        )
      })
      setAvailableSteps((current) => {
        if (current.length === steps.length && sameSteps(current, steps)) return current
        return sameSteps(current, available) ? current : available
      })
    }

    inspectTargets()
    const interval = setInterval(inspectTargets, 120)
    return () => clearInterval(interval)
  }, [open, renderer, steps, terminal.height, terminal.width])

  useEffect(() => {
    setStepIndex((current) => clamp(current, 0, Math.max(0, availableSteps.length - 1)))
  }, [availableSteps.length])

  const step = availableSteps[stepIndex] ?? null

  useEffect(() => {
    onStepChange?.(step?.targetId ?? null)
  }, [onStepChange, step?.targetId])

  useEffect(() => {
    if (!open || !step) {
      setTargetRect(null)
      return
    }

    const inspectTarget = () => {
      const target = visibleTutorialTarget(renderer.root, step.targetId)
      const rawX = target ? Math.round(target.screenX) : 0
      const rawY = target ? Math.round(target.screenY) : 0
      const x = clamp(rawX, 0, Math.max(0, terminal.width - 1))
      const y = clamp(rawY, 0, Math.max(0, terminal.height - 1))
      const next =
        target && isVisible(target)
          ? {
              x,
              y,
              width: Math.max(
                1,
                Math.min(Math.round(target.width) - Math.max(0, -rawX), terminal.width - x),
              ),
              height: Math.max(
                1,
                Math.min(Math.round(target.height) - Math.max(0, -rawY), terminal.height - y),
              ),
            }
          : null
      setTargetRect((current) => (sameRect(current, next) ? current : next))
    }

    inspectTarget()
    const interval = setInterval(inspectTarget, 80)
    return () => clearInterval(interval)
  }, [open, renderer, step, terminal.height, terminal.width])

  const clearTransitionTimers = useCallback(() => {
    for (const timer of transitionTimersRef.current) clearTimeout(timer)
    transitionTimersRef.current = []
  }, [])

  useEffect(() => () => clearTransitionTimers(), [clearTransitionTimers])

  useEffect(() => {
    if (open) return
    clearTransitionTimers()
    setContentOpacity(1)
    setTransitioning(false)
  }, [clearTransitionTimers, open])

  const transitionTo = useCallback(
    (nextIndex: number) => {
      if (transitioning || nextIndex === stepIndex) return
      clearTransitionTimers()
      setTransitioning(true)

      const schedule = (delay: number, action: () => void) => {
        const timer = setTimeout(action, delay)
        transitionTimersRef.current.push(timer)
      }

      setContentOpacity(0.72)
      schedule(35, () => setContentOpacity(0.38))
      schedule(70, () => setContentOpacity(0.08))
      schedule(105, () => {
        setStepIndex(nextIndex)
        setContentOpacity(0)
      })
      schedule(145, () => setContentOpacity(0.24))
      schedule(185, () => setContentOpacity(0.52))
      schedule(225, () => setContentOpacity(0.78))
      schedule(270, () => {
        setContentOpacity(1)
        setTransitioning(false)
        transitionTimersRef.current = []
      })
    },
    [clearTransitionTimers, stepIndex, transitioning],
  )

  const previous = useCallback(() => {
    if (stepIndex > 0) transitionTo(stepIndex - 1)
  }, [stepIndex, transitionTo])

  const next = useCallback(() => {
    if (transitioning) return
    if (stepIndex >= availableSteps.length - 1) {
      clearTransitionTimers()
      setTransitioning(true)
      setContentOpacity(0.55)
      transitionTimersRef.current = [
        setTimeout(() => setContentOpacity(0.15), 45),
        setTimeout(onClose, 100),
      ]
      return
    }
    transitionTo(stepIndex + 1)
  }, [
    availableSteps.length,
    clearTransitionTimers,
    onClose,
    stepIndex,
    transitioning,
    transitionTo,
  ])

  useKeyboard((key) => {
    if (!open) return
    key.preventDefault()
    key.stopPropagation()
    if (key.name === "escape" || key.name === "q") onClose()
    else if (transitioning) return
    else if (key.name === "left" || key.name === "up") previous()
    else if (
      key.name === "right" ||
      key.name === "down" ||
      key.name === "enter" ||
      key.name === "return" ||
      key.name === "space" ||
      key.name === "tab"
    )
      next()
  })

  const targetCard = useMemo<CardLayout>(() => {
    const baseWidth = Math.max(1, Math.min(58, terminal.width - 2))
    const minimumSideWidth = 38
    const layoutFor = (width: number) => {
      const contentWidth = Math.max(12, width - 6)
      const description = translateUi(step?.description ?? "")
      const hint = translateUi(step?.hint ?? "")
      const hintHeight = step?.hint
        ? estimateTutorialTextHeight(`◇ ${hint}`, contentWidth, 1, 4)
        : 0
      const descriptionHeight = estimateTutorialTextHeight(
        description,
        contentWidth,
        2,
        Math.max(2, terminal.height - 7 - hintHeight),
      )
      return {
        descriptionHeight,
        hintHeight,
        height: Math.max(8, 5 + descriptionHeight + hintHeight),
      }
    }
    if (!targetRect) {
      const layout = layoutFor(baseWidth)
      return {
        width: baseWidth,
        ...layout,
        x: Math.max(1, Math.floor((terminal.width - baseWidth) / 2)),
        y: Math.max(1, Math.floor((terminal.height - layout.height) / 2)),
      }
    }

    const rightSpace = terminal.width - (targetRect.x + targetRect.width)
    const leftSpace = targetRect.x
    const rightWidth = Math.min(baseWidth, rightSpace - 3)
    const leftWidth = Math.min(baseWidth, leftSpace - 3)
    if (rightWidth >= minimumSideWidth) {
      const layout = layoutFor(rightWidth)
      return {
        width: rightWidth,
        ...layout,
        x: targetRect.x + targetRect.width + 2,
        y: clamp(targetRect.y, 1, Math.max(1, terminal.height - layout.height - 1)),
      }
    }
    if (leftWidth >= minimumSideWidth) {
      const layout = layoutFor(leftWidth)
      return {
        width: leftWidth,
        ...layout,
        x: targetRect.x - leftWidth - 2,
        y: clamp(targetRect.y, 1, Math.max(1, terminal.height - layout.height - 1)),
      }
    }

    const width = baseWidth
    const layout = layoutFor(width)
    const belowSpace = terminal.height - (targetRect.y + targetRect.height)
    const aboveSpace = targetRect.y
    if (belowSpace >= layout.height + 1) {
      return {
        width,
        ...layout,
        x: clamp(
          targetRect.x + Math.floor((targetRect.width - width) / 2),
          1,
          Math.max(1, terminal.width - width - 1),
        ),
        y: targetRect.y + targetRect.height + 1,
      }
    }
    return {
      width,
      ...layout,
      x: clamp(
        targetRect.x + Math.floor((targetRect.width - width) / 2),
        1,
        Math.max(1, terminal.width - width - 1),
      ),
      y:
        aboveSpace >= layout.height + 1
          ? targetRect.y - layout.height - 1
          : Math.max(1, terminal.height - layout.height - 1),
    }
  }, [step, targetRect, terminal.height, terminal.width])

  const [animatedCard, setAnimatedCard] = useState<CardGeometry>(targetCard)
  const animatedCardRef = useRef<CardGeometry>(targetCard)

  useEffect(() => {
    if (!open) {
      animatedCardRef.current = targetCard
      setAnimatedCard(targetCard)
      return
    }

    const from = animatedCardRef.current
    const startedAt = Date.now()
    const duration = 220
    const animate = () => {
      const progress = clamp((Date.now() - startedAt) / duration, 0, 1)
      const eased = 1 - (1 - progress) ** 3
      const nextGeometry = {
        x: Math.round(from.x + (targetCard.x - from.x) * eased),
        y: Math.round(from.y + (targetCard.y - from.y) * eased),
        width: Math.round(from.width + (targetCard.width - from.width) * eased),
        height: Math.round(from.height + (targetCard.height - from.height) * eased),
      }
      animatedCardRef.current = nextGeometry
      setAnimatedCard(nextGeometry)
      if (progress >= 1) clearInterval(interval)
    }
    const interval = setInterval(animate, 28)
    animate()
    return () => clearInterval(interval)
  }, [open, targetCard])

  if (!open) return null

  const accent = step?.accent ?? (step?.kind === "block" ? COLORS.database : COLORS.focus)
  const targetRight = targetRect ? Math.min(terminal.width, targetRect.x + targetRect.width) : 0
  const targetBottom = targetRect ? Math.min(terminal.height, targetRect.y + targetRect.height) : 0

  const dim = (key: string, x: number, y: number, width: number, height: number) =>
    width > 0 && height > 0 ? (
      <Button
        key={key}
        onPress={() => {}}
        position="absolute"
        left={x}
        top={y}
        width={width}
        height={height}
        zIndex={980}
        backgroundColor="#020408"
        opacity={0.8}
      />
    ) : null

  return (
    <>
      {targetRect ? (
        <>
          {dim("top", 0, 0, terminal.width, targetRect.y)}
          {dim("bottom", 0, targetBottom, terminal.width, terminal.height - targetBottom)}
          {dim("left", 0, targetRect.y, targetRect.x, targetBottom - targetRect.y)}
          {dim(
            "right",
            targetRight,
            targetRect.y,
            terminal.width - targetRight,
            targetBottom - targetRect.y,
          )}
          {/* A painted transparent layer corrupts wide glyphs in OpenTUI. */}
          <Button
            onPress={next}
            position="absolute"
            left={targetRect.x}
            top={targetRect.y}
            width={targetRight - targetRect.x}
            height={targetBottom - targetRect.y}
            zIndex={983}
          />
          <TutorialTargetOutline
            target={targetRect}
            terminal={{ width: terminal.width, height: terminal.height }}
            accent={accent}
          />
        </>
      ) : (
        dim("all", 0, 0, terminal.width, terminal.height)
      )}

      <box
        ref={cardRef}
        id="tutorial-overlay-card"
        focusable
        style={{
          position: "absolute",
          left: animatedCard.x,
          top: animatedCard.y,
          width: animatedCard.width,
          height: animatedCard.height,
          zIndex: 985,
          border: true,
          borderStyle: "rounded",
          borderColor: accent,
          backgroundColor: COLORS.canvas,
          paddingLeft: 2,
          paddingRight: 2,
        }}
      >
        <box
          style={{
            flexGrow: 1,
            opacity: contentOpacity,
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
            <text content={`◆ ${step?.group ?? "PREPARANDO TOUR"}`} style={{ fg: accent }} />
            <text
              content={availableSteps.length ? `${stepIndex + 1}/${availableSteps.length}` : "…"}
              style={{ fg: COLORS.muted }}
            />
          </box>
          <text
            content={step?.title ?? "Localizando os elementos da tela…"}
            style={{ height: 1, flexShrink: 0, fg: COLORS.text }}
          />
          <ShortcutText
            id="tutorial-description"
            content={step?.description ?? "O tutorial começará em instantes."}
            style={{
              height: targetCard.descriptionHeight,
              flexShrink: 0,
              fg: COLORS.muted,
              wrapMode: "word",
            }}
          />
          {step?.hint ? (
            <ShortcutText
              content={`◇ ${step.hint}`}
              style={{
                height: targetCard.hintHeight,
                flexShrink: 0,
                fg: COLORS.warning,
                wrapMode: "word",
              }}
            />
          ) : null}
        </box>
        <box
          style={{
            height: 1,
            flexShrink: 0,
            flexDirection: "row",
            justifyContent: "space-between",
            border: ["top"],
            borderColor: COLORS.border,
          }}
        >
          <InlineButton
            label={targetCard.width < 48 ? "[Esc]" : "[Esc] Sair"}
            accent={accent}
            onPress={onClose}
          />
          <box style={{ flexDirection: "row" }}>
            <InlineButton
              label={targetCard.width < 48 ? "[←]" : "[←] Voltar"}
              accent={accent}
              disabled={stepIndex === 0}
              onPress={previous}
            />
            <InlineButton
              label={
                targetCard.width < 48
                  ? "[Enter]"
                  : stepIndex >= availableSteps.length - 1
                    ? "[Enter] Concluir"
                    : "[Enter] Próximo"
              }
              accent={accent}
              onPress={next}
            />
          </box>
        </box>
      </box>
    </>
  )
}
