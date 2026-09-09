import type { Renderable } from "@opentui/core"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { Button } from "@tuiparts/react/button"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { COLORS } from "../../core/settings/theme"
import { GIT_TUTORIAL_STEPS } from "../../features/git"
import { HTTP_TUTORIAL_STEPS } from "../../features/http"
import { displayWidth, translateUi } from "../../shared/i18n/index"
import { InlineButton } from "../../shared/ui/InlineButton"
import { ShortcutText } from "../../shared/ui/ShortcutText"

export type TutorialStep = {
  targetId: string
  group: string
  title: string
  description: string
  hint?: string
  kind: "block" | "control" | "action"
  accent?: string
}
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
}

const DATABASE_TUTORIAL_STEPS: TutorialStep[] = [
  {
    targetId: "tutorial-db-catalog",
    group: "BLOCO 1 DE 3",
    title: "Catálogo do banco",
    description:
      "Este bloco reúne a conexão ativa, a busca e a árvore de schemas, tabelas e views.",
    hint: "[H/←] e [L/→] usam o bloco vizinho quando a direção está livre.",
    kind: "block",
  },
  {
    targetId: "tutorial-db-connection",
    group: "CATÁLOGO · ATIVAÇÃO",
    title: "Conexão ativa",
    description:
      "Mostra qual banco está em uso. O gerenciamento de conexões fica na ação inferior do catálogo.",
    kind: "control",
  },
  {
    targetId: "table-search",
    group: "CATÁLOGO · CONTROLE",
    title: "Filtro rápido",
    description:
      "Filtra a árvore pelo nome do schema ou da tabela sem consultar novamente o banco.",
    hint: "Atalhos: [/] · [Esc] devolve o foco à lista",
    kind: "control",
  },
  {
    targetId: "table-list",
    group: "CATÁLOGO · ATIVAÇÃO",
    title: "Árvore de tabelas",
    description:
      "Use [↑↓] ou [J/K] para navegar e [Enter] para abrir. O mouse também seleciona e rola a lista.",
    hint: "Ao abrir uma tabela, a área de dados recebe o foco.",
    kind: "control",
  },
  {
    targetId: "tutorial-db-new-connection",
    group: "CATÁLOGO · AÇÃO",
    title: "Criar nova / conexões",
    description: "Abre o gerenciador para trocar, editar, excluir ou cadastrar conexões.",
    hint: "Atalho: [C]",
    kind: "action",
  },
  {
    targetId: "tutorial-db-new-query",
    group: "CATÁLOGO · AÇÃO",
    title: "Criar query",
    description:
      "Abre o workspace SQL com até seis editores e resultados independentes. Autocomplete, favoritos e histórico respeitam a conexão ativa.",
    hint: "[A] abre · [Ctrl+A] executa somente o comando atual",
    kind: "action",
  },
  {
    targetId: "tutorial-db-grid",
    group: "BLOCO 2 DE 3",
    title: "Consultas e área de dados",
    description:
      "Este bloco mostra a consulta executada, seus resultados, a estrutura da tabela, os índices e as alterações ainda não salvas.",
    hint: "No tour, tudo aqui é simulado e nenhum banco real é acessado.",
    kind: "block",
  },
  {
    targetId: "tutorial-db-query-preview",
    group: "DADOS · CONSULTA",
    title: "Consulta visualizada",
    description:
      "Aqui você confere qual SQL produziu os dados exibidos logo abaixo. A grade representa o resultado dessa consulta.",
    hint: "A consulta deste tutorial é apenas uma demonstração.",
    kind: "control",
  },
  {
    targetId: "tutorial-db-table-history",
    group: "DADOS · NAVEGAÇÃO",
    title: "Tabelas abertas",
    description:
      "Mantém até seis tabelas abertas sem duplicar nomes. Ao reabrir uma tabela, o foco volta para a aba existente.",
    hint: "Atalhos: [<] e [>]",
    kind: "control",
  },
  {
    targetId: "tutorial-db-view-data",
    group: "DADOS · ATIVAÇÃO",
    title: "Registros",
    description: "Exibe as linhas da tabela e habilita navegação, edição e paginação.",
    hint: "Atalho: [1]",
    kind: "control",
  },
  {
    targetId: "tutorial-db-view-columns",
    group: "DADOS · ATIVAÇÃO",
    title: "Colunas",
    description: "Mostra tipo, chave, nulabilidade e valor padrão de cada coluna.",
    hint: "Atalho: [2]",
    kind: "control",
  },
  {
    targetId: "tutorial-db-view-indexes",
    group: "DADOS · ATIVAÇÃO",
    title: "Índices",
    description: "Lista índices simples e únicos, incluindo sua definição e colunas.",
    hint: "Atalho: [3]",
    kind: "control",
  },
  {
    targetId: "tutorial-db-view-schema",
    group: "DADOS · ESTRUTURA",
    title: "Schema completo",
    description:
      "Reúne o DDL, constraints, índices e relacionamentos de entrada e saída da tabela.",
    hint: "Atalho: [4]",
    kind: "control",
  },
  {
    targetId: "tutorial-db-sensitive",
    group: "DADOS · PRIVACIDADE",
    title: "Dados sensíveis",
    description:
      "Campos sensíveis começam visíveis. [V] mascara os valores; para revelá-los novamente, confirme com [V].",
    hint: "Atalho: [V]",
    kind: "action",
    accent: COLORS.database,
  },
  {
    targetId: "tutorial-db-table-tools",
    group: "DADOS · FILTRO",
    title: "Ordenar e buscar",
    description:
      "[F] alterna a coluna ativa entre ordem normal, crescente e decrescente. [S] busca um texto em todas as colunas.",
    hint: "A ordenação e a busca ficam isoladas por conexão e tabela.",
    kind: "action",
  },
  {
    targetId: "tutorial-db-selection",
    group: "DADOS · SELEÇÃO EM LOTE",
    title: "Selecionar várias linhas",
    description:
      "[Alt+Space] fixa a linha inicial. [↑/↓] ajusta um intervalo contínuo entre ela e a linha atual.",
    hint: "[Alt+Space] iniciar/finalizar · [↑/↓] ajustar · [Esc] limpar",
    kind: "action",
    accent: COLORS.database,
  },
  {
    targetId: "tutorial-db-export",
    group: "DADOS · SELEÇÃO EM LOTE",
    title: "Exportar a seleção",
    description:
      "Copia ou salva somente as linhas marcadas em CSV, TSV ou JSON usando as colunas visíveis no resultado.",
    hint: "Atalho: [X] · valores mascarados continuam protegidos",
    kind: "action",
    accent: COLORS.database,
  },
  {
    targetId: "tutorial-db-new-row",
    group: "DADOS · ESCRITA",
    title: "Preparar nova linha",
    description:
      "Cria uma linha local em azul. O banco só será alterado depois da revisão e confirmação.",
    hint: "Atalho: [Ctrl+A]",
    kind: "action",
  },
  {
    targetId: "tutorial-db-edit-cell",
    group: "DADOS · ESCRITA",
    title: "Editar uma ou várias linhas",
    description:
      "Sem marcação, edita a célula ativa. Com linhas marcadas, prepara o mesmo valor na coluna ativa para todas elas.",
    hint: "Atalhos: [E] ou [Enter]",
    kind: "action",
    accent: COLORS.warning,
  },
  {
    targetId: "tutorial-db-delete-row",
    group: "DADOS · ESCRITA",
    title: "Preparar exclusão",
    description:
      "Marca em vermelho a linha atual ou todas as linhas selecionadas, mas ainda não executa o DELETE.",
    hint: "Atalho: [dd]",
    kind: "action",
    accent: COLORS.danger,
  },
  {
    targetId: "tutorial-db-undo-row",
    group: "DADOS · ESCRITA",
    title: "Desfazer alteração",
    description:
      "Remove as alterações preparadas da linha atual ou do conjunto selecionado antes que cheguem ao banco.",
    hint: "Atalho: [U]",
    kind: "action",
  },
  {
    targetId: "tutorial-db-review",
    group: "DADOS · CONFIRMAÇÃO",
    title: "Revisar e salvar",
    description:
      "Lista os comandos SQL preparados. Você escolhe quais aprovar e confirma novamente para executá-los.",
    hint: "Atalho: [Ctrl+S]",
    kind: "action",
    accent: COLORS.success,
  },
  {
    targetId: "tutorial-db-table-grid",
    group: "DADOS · NAVEGAÇÃO",
    title: "Grade de registros",
    description:
      "A célula ativa recebe destaque. Use [↑↓] ou [J/K] entre linhas e [H/←] ou [L/→] entre colunas. No limite, os mesmos atalhos passam ao bloco vizinho.",
    hint: "Clique em qualquer célula para selecioná-la.",
    kind: "control",
  },
  {
    targetId: "tutorial-db-inspector-toggle",
    group: "DADOS · ATIVAÇÃO",
    title: "Abrir inspetor",
    description:
      "Em terminais estreitos, alterna a área central entre a grade e os campos completos do registro.",
    hint: "Atalho: [I]",
    kind: "control",
  },
  {
    targetId: "tutorial-db-inspector",
    group: "BLOCO 3 DE 3",
    title: "Dados completos da linha",
    description:
      "Este último bloco mostra todos os campos da linha selecionada, um abaixo do outro, inclusive os que não cabem na grade.",
    hint: "Em telas estreitas, use [I] para abrir este bloco.",
    kind: "block",
  },
  {
    targetId: "tutorial-db-inspector-fields",
    group: "INSPETOR · ATIVAÇÃO",
    title: "Campos do registro",
    description:
      "Navegue com [↑↓] ou [J/K]. [Enter] ou [E] edita o campo selecionado usando o mesmo fluxo seguro da grade.",
    kind: "control",
  },
  {
    targetId: "tutorial-db-pagination",
    group: "DADOS · NAVEGAÇÃO",
    title: "Paginação e foco",
    description:
      "Avance páginas, mova a célula ativa e confira qual dos três blocos está recebendo o teclado.",
    hint: "[P/N] muda a página · [H/←] [L/→] navega célula ou bloco",
    kind: "control",
  },
]

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
  if (screen === "git") return [...GIT_TUTORIAL_STEPS]
  if (screen === "http") return [...HTTP_TUTORIAL_STEPS]
  return GENERIC_TUTORIAL_STEPS
}

export function TutorialOverlay({ open, steps, onClose }: TutorialOverlayProps) {
  const renderer = useRenderer()
  const terminal = useTerminalDimensions()
  const [availableSteps, setAvailableSteps] = useState<TutorialStep[]>([])
  const [stepIndex, setStepIndex] = useState(0)
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null)
  const [contentOpacity, setContentOpacity] = useState(1)
  const [transitioning, setTransitioning] = useState(false)
  const transitionTimersRef = useRef<Array<ReturnType<typeof setTimeout>>>([])

  useEffect(() => {
    if (!open) {
      setAvailableSteps([])
      setStepIndex(0)
      setTargetRect(null)
      return
    }

    const inspectTargets = () => {
      const available = steps.filter((step) => {
        const target = renderer.root.findDescendantById(step.targetId)
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
      setAvailableSteps((current) => (sameSteps(current, available) ? current : available))
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
    if (!open || !step) {
      setTargetRect(null)
      return
    }

    const inspectTarget = () => {
      const target = renderer.root.findDescendantById(step.targetId)
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
      const descriptionHeight = estimateTutorialTextHeight(description, contentWidth, 2, 6)
      const hintHeight = step?.hint
        ? estimateTutorialTextHeight(`◇ ${hint}`, contentWidth, 1, 4)
        : 0
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
            zIndex={981}
          />
          <box
            style={{
              position: "absolute",
              left: Math.max(0, targetRect.x - 1),
              top: Math.max(0, targetRect.y - 1),
              width: Math.min(terminal.width - Math.max(0, targetRect.x - 1), targetRect.width + 2),
              height: Math.min(
                terminal.height - Math.max(0, targetRect.y - 1),
                targetRect.height + 2,
              ),
              border: true,
              borderStyle: "rounded",
              borderColor: accent,
              zIndex: 982,
            }}
          />
        </>
      ) : (
        dim("all", 0, 0, terminal.width, terminal.height)
      )}

      <box
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
