import { paletteAction } from "@xupon/tuiminal-core/ui/use-action-palette"
import type { HttpKeyboardCommand } from "../model/keyboard-types"
import type { HttpDocumentState } from "../model/types"
import { isOpaqueHttpRequest } from "../model/request-capabilities"
import type { HttpSourceMode } from "../model/source-mode"

const ACTION_DESCRIPTIONS = {
  boxes: "Escolher um painel visível para receber o foco.",
  url: "Editar a URL da requisição atual.",
  send: "Enviar a requisição usando o ambiente selecionado.",
  cancel: "Interromper a requisição em andamento.",
  method: "Alternar o método HTTP da requisição atual.",
  environment: "Selecionar um ambiente e gerenciar suas variáveis.",
  "new": "Abrir uma nova requisição Scratch em outra aba.",
  save: "Salvar as alterações da requisição atual.",
  close: "Fechar a aba atual, confirmando alterações não salvas.",
  duplicate: "Criar uma cópia da requisição atual para edição.",
  collection: "Abrir o painel de coleções e requisições.",
  import: "Pré-visualizar e importar uma coleção de um arquivo local.",
  run: "Configurar e executar as requisições de uma coleção.",
  "curl-import": "Criar uma requisição a partir de um comando cURL.",
  "curl-export": "Gerar um comando cURL para a requisição atual.",
  search: "Localizar texto no conteúdo da resposta.",
  maximize: "Expandir ou restaurar o painel de requisição ou resposta.",
} as const

export function httpWorkspaceActions(
  document: HttpDocumentState | undefined,
  sourceMode: HttpSourceMode,
  run: (command: HttpKeyboardCommand) => void,
) {
  const readOnly = Boolean(document && isOpaqueHttpRequest(document.request))
  const running = document?.execution.status === "running"
  const readOnlyReason = readOnly && "SOMENTE LEITURA · RECURSO .HTTP NÃO SUPORTADO"
  const action = (
    id: keyof typeof ACTION_DESCRIPTIONS,
    shortcut: string,
    label: string,
    tag: string,
    command: HttpKeyboardCommand,
    disabled: string | false = false,
  ) =>
    paletteAction(id, shortcut, label, ACTION_DESCRIPTIONS[id], tag, () => run(command), disabled)
  return [
    {
      ...action("boxes", "[M]", "Escolher box", "Navegação", { kind: "choose-box" }),
      key: { name: "m" },
    },
    action("url", "[/]", "URL", "Navegação", { kind: "focus-url" }),
    action(
      "send",
      "[S]",
      "Enviar",
      "HTTP",
      { kind: "send" },
      readOnlyReason || (running && "Requisição em andamento."),
    ),
    action(
      "cancel",
      "[Esc]",
      "Cancelar",
      "HTTP",
      { kind: "cancel" },
      !running && "Nenhuma requisição em andamento.",
    ),
    action(
      "method",
      "[Shift+M]",
      "Trocar método",
      "HTTP",
      { kind: "cycle-method", direction: 1 },
      readOnlyReason,
    ),
    action("environment", "[E]", "Ambientes", "HTTP", { kind: "open-environment-manager" }),
    action("new", "[Ctrl+N]", "Nova request", "HTTP", { kind: "add-document" }),
    action("save", "[Ctrl+S]", "Salvar", "HTTP", { kind: "save-document" }, readOnlyReason),
    action("close", "[X]", "Fechar", "HTTP", { kind: "close-document" }),
    action("duplicate", "", "Duplicar", "HTTP", { kind: "duplicate-document" }, readOnlyReason),
    action("collection", "[C]", "Coleção", "Navegação", { kind: "navigation", view: "collection" }),
    action(
      "import",
      "",
      "Importar coleção",
      "HTTP",
      { kind: "open-overlay", overlay: "collection-import" },
      sourceMode !== "local" && "Troque para HTTP Local antes de importar um arquivo local.",
    ),
    action("run", "", "Rodar coleção", "HTTP", {
      kind: "open-overlay",
      overlay: "collection-runner",
    }),
    action(
      "curl-import",
      "",
      "Importar cURL",
      "HTTP",
      { kind: "open-overlay", overlay: "curl-import" },
      readOnlyReason,
    ),
    action(
      "curl-export",
      "[W]",
      "Exportar cURL",
      "HTTP",
      { kind: "open-overlay", overlay: "curl-export" },
      readOnlyReason,
    ),
    action(
      "search",
      "[Ctrl+F]",
      "Buscar na resposta",
      "HTTP",
      { kind: "open-response-search" },
      document?.execution.status !== "success" && "Nenhuma resposta disponível.",
    ),
    action("maximize", "[F10]", "Maximizar", "Navegação", { kind: "toggle-maximize" }),
  ].filter(
    (item) =>
      document ||
      ["boxes", "environment", "new", "collection", "import", "run", "curl-import"].includes(
        item.id,
      ),
  )
}
