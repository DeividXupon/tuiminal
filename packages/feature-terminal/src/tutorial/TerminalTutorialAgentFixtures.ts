import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import type { AgentMessageHistoryEntry } from "../model/agent-message-history"
import type { LiveDiffFile } from "../model/live-diff"
import { TUTORIAL_PROJECT } from "./TerminalTutorialFixtures"

// Simulated agent work: sent messages, observed Git changes and nearby projects.
export const TUTORIAL_ADMIN_PROJECT = "/home/dev/projetos/lojinha-admin"

const TEST_PATCH = [
  "@@ -12,3 +12,9 @@",
  ' import { calcularFrete } from "../src/frete/calcular"',
  " ",
  ' test("frete grátis acima de R$ 199", () => {',
  "+",
  '+test("CEP inválido não consulta a tabela", () => {',
  '+  expect(() => calcularFrete(pedido({ cep: "000" }))).toThrow("CEP inválido")',
  "+})",
].join("\n")

export function tutorialHistory(now: number): AgentMessageHistoryEntry[] {
  const entry = (
    id: string,
    text: string,
    minutes: number,
    fields: Partial<AgentMessageHistoryEntry>,
  ): AgentMessageHistoryEntry => ({
    id,
    turnId: id,
    text: translateUi(text),
    sentAt: now - minutes * 60_000,
    durationMs: 95_000,
    status: "completed",
    hasImage: false,
    hasAudio: false,
    hasSkill: false,
    model: "gpt-6-sol",
    effort: "medium",
    serviceTier: "fast",
    finalResponse: "",
    commentary: [],
    reasoningSummaries: [],
    plans: [],
    activities: [],
    changes: [],
    turnDiff: "",
    ...fields,
  })
  return [
    entry(
      "tutorial-message-1",
      "corrige o arredondamento do frete em pedidos acima de R$ 199",
      18,
      {
        durationMs: 184_000,
        hasSkill: true,
        finalResponse: translateUi(
          "Arredondei o valor para centavos e liberei frete grátis acima de R$ 199. Os 14 testes passaram.",
        ),
      },
    ),
    entry("tutorial-message-2", "esquece, usa a tabela antiga de CEP", 11, {
      status: "interrupted",
      durationMs: 21_000,
    }),
    entry("tutorial-message-3", "adiciona um teste para CEP inválido e roda tudo", 3, {
      hasImage: true,
      finalResponse: translateUi(
        "Adicionei o teste para CEP inválido e rodei a suíte inteira: 42 testes passaram, nenhum quebrou.",
      ),
      commentary: [translateUi("Vou procurar onde o CEP é validado antes de mexer no teste.")],
      plans: [translateUi("1. Validar o CEP · 2. Criar o teste · 3. Rodar a suíte")],
      activities: [
        {
          id: "tutorial-activity-1",
          kind: "command",
          label: "rg -n cep src/frete",
          detail: "rg -n cep src/frete",
          at: now - 170_000,
        },
        {
          id: "tutorial-activity-2",
          kind: "change",
          label: "tests/frete.test.ts",
          detail: "tests/frete.test.ts",
          at: now - 150_000,
        },
        {
          id: "tutorial-activity-3",
          kind: "command",
          label: "bun test",
          detail: "bun test",
          at: now - 120_000,
        },
      ],
      changes: [
        { id: "tutorial-change-1", path: "tests/frete.test.ts", kind: "update", diff: TEST_PATCH },
      ],
      turnDiff: TEST_PATCH,
    }),
  ]
}

function changedFile(
  root: string,
  path: string,
  change: NonNullable<LiveDiffFile["change"]>,
  additions: number,
  deletions: number,
  changedAt: number,
  highlighted = false,
): LiveDiffFile {
  return {
    root,
    path,
    additions,
    deletions,
    fingerprint: `${path}:${changedAt}`,
    untracked: change === "New",
    newFile: change === "New",
    change,
    headExists: change !== "New",
    changedAt,
    ...(highlighted ? { listHighlightAt: changedAt } : {}),
  }
}

export function tutorialLiveDiffFiles(now: number): LiveDiffFile[] {
  return [
    changedFile(TUTORIAL_PROJECT, "src/frete/calcular.ts", "Edit", 9, 2, now - 600, true),
    changedFile(TUTORIAL_PROJECT, "src/cupom/aplicar.ts", "New", 48, 0, now - 52_000),
    changedFile(TUTORIAL_PROJECT, "tests/carrinho.test.ts", "Edit", 20, 2, now - 190_000),
    changedFile(TUTORIAL_PROJECT, "docs/promo-antiga.md", "Delete", 0, 31, now - 540_000),
  ]
}

/** First observed patch; the current one adds the blue "recent" rows. */
export const TUTORIAL_BASELINE_PATCH = [
  "diff --git a/src/frete/calcular.ts b/src/frete/calcular.ts",
  "--- a/src/frete/calcular.ts",
  "+++ b/src/frete/calcular.ts",
  "@@ -1,3 +1,4 @@",
  ' import type { Pedido } from "../pedido"',
  '+import { aplicarCupom } from "../cupom/aplicar"',
  ' import { tabelaPorRegiao } from "./tabela"',
  " ",
  "@@ -8,4 +9,5 @@ export function calcularFrete(pedido: Pedido): number {",
  "   const base = tabelaPorRegiao(pedido.cep)",
  "-  const peso = pedido.itens.reduce((total, item) => total + item.peso, 0)",
  "-  return base + peso * 1.5",
  "+  const peso = pedido.itens.reduce((total, item) => total + item.peso * item.quantidade, 0)",
  "+  const valor = aplicarCupom(pedido, base + peso * 1.5)",
  "+  return valor",
  " }",
].join("\n")

export const TUTORIAL_PATCH = [
  "diff --git a/src/frete/calcular.ts b/src/frete/calcular.ts",
  "--- a/src/frete/calcular.ts",
  "+++ b/src/frete/calcular.ts",
  "@@ -1,3 +1,4 @@",
  ' import type { Pedido } from "../pedido"',
  '+import { aplicarCupom } from "../cupom/aplicar"',
  ' import { tabelaPorRegiao } from "./tabela"',
  " ",
  "@@ -8,4 +9,10 @@ export function calcularFrete(pedido: Pedido): number {",
  "   const base = tabelaPorRegiao(pedido.cep)",
  "-  const peso = pedido.itens.reduce((total, item) => total + item.peso, 0)",
  "-  return base + peso * 1.5",
  "+  const peso = pedido.itens.reduce((total, item) => total + item.peso * item.quantidade, 0)",
  "+  const valor = aplicarCupom(pedido, base + peso * 1.5)",
  "+  if (pedido.subtotal >= 199) return 0",
  "+  return arredondarCentavos(valor)",
  " }",
  "+",
  "+function arredondarCentavos(valor: number) {",
  "+  return Math.round(valor * 100) / 100",
  "+}",
].join("\n")

export function tutorialLiveDiffProjects() {
  return [
    { path: TUTORIAL_ADMIN_PROJECT, name: "lojinha-admin", parent: "/home/dev/projetos" },
    {
      path: "/home/dev/projetos/lojinha-design",
      name: "lojinha-design",
      parent: "/home/dev/projetos",
    },
    { path: "/home/dev/projetos/blog-pessoal", name: "blog-pessoal", parent: "/home/dev/projetos" },
  ]
}
