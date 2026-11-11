import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import type { TutorialStep } from "./types"

export const DATABASE_TUTORIAL_STEPS: TutorialStep[] = [
  {
    stateful: true,
    targetId: "tutorial-db-catalog",
    group: "BLOCO 1 DE 3",
    title: "Catálogo do banco",
    description:
      "Este bloco reúne a conexão ativa, a busca e a árvore de schemas, tabelas e views.",
    hint: "[H/←] e [L/→] usam o bloco vizinho quando a direção está livre.",
    kind: "block",
  },
  {
    stateful: true,
    targetId: "tutorial-db-connection",
    group: "CATÁLOGO · ATIVAÇÃO",
    title: "Conexão ativa",
    description:
      "Mostra qual banco está em uso. O gerenciamento de conexões fica na ação inferior do catálogo.",
    kind: "control",
  },
  {
    stateful: true,
    targetId: "table-search",
    group: "CATÁLOGO · CONTROLE",
    title: "Filtro rápido",
    description:
      "Filtra a árvore pelo nome do schema ou da tabela sem consultar novamente o banco.",
    hint: "Atalhos: [/] · [Esc] devolve o foco à lista",
    kind: "control",
  },
  {
    stateful: true,
    targetId: "table-list",
    group: "CATÁLOGO · ATIVAÇÃO",
    title: "Árvore de tabelas",
    description:
      "Use [↑↓] ou [J/K] para navegar e [Enter] para abrir. O mouse também seleciona e rola a lista.",
    hint: "Ao abrir uma tabela, a área de dados recebe o foco.",
    kind: "control",
  },
  {
    stateful: true,
    targetId: "tutorial-db-connections",
    group: "CATÁLOGO · AÇÃO",
    title: "Criar nova / conexões",
    description: "Abre o gerenciador para trocar, editar, excluir ou cadastrar conexões.",
    hint: "Atalho: [C]",
    kind: "action",
  },
  {
    stateful: true,
    targetId: "tutorial-db-new-query",
    group: "CATÁLOGO · AÇÃO",
    title: "Criar query",
    description:
      "Abre o workspace SQL com até seis editores e resultados independentes. Autocomplete, favoritos e histórico respeitam a conexão ativa.",
    hint: "[W] abre · [Ctrl+A] executa somente o comando atual",
    kind: "action",
  },
  {
    stateful: true,
    targetId: "tutorial-db-grid",
    group: "BLOCO 2 DE 3",
    title: "Consultas e área de dados",
    description:
      "Aqui ficam as abas de dados, colunas, índices e schema. O inspetor acompanha a linha selecionada dentro desta área.",
    hint: "No tour, tudo aqui é simulado e nenhum banco real é acessado.",
    kind: "block",
  },
  {
    stateful: true,
    targetId: "tutorial-db-query-editor",
    group: "DADOS · CONSULTA",
    title: "Editor SQL",
    description:
      "Escreva SQL no editor. [Ctrl+A] executa o comando na posição do cursor; o resultado aparece abaixo.",
    hint: "A consulta deste tutorial é apenas uma demonstração.",
    kind: "control",
  },
  {
    stateful: true,
    targetId: "tutorial-db-table-history",
    group: "DADOS · NAVEGAÇÃO",
    title: "Tabelas abertas",
    description:
      "Mantém até seis tabelas abertas sem duplicar nomes. Ao reabrir uma tabela, o foco volta para a aba existente.",
    hint: "Atalhos: [A←] e [F→]",
    kind: "control",
  },
  {
    stateful: true,
    targetId: "tutorial-db-view-data",
    group: "DADOS · ATIVAÇÃO",
    title: "Registros",
    description:
      "Exibe as linhas da tabela e habilita navegação, edição e carregamento incremental.",
    hint: "Atalho: [1]",
    kind: "control",
  },
  {
    stateful: true,
    targetId: "tutorial-db-columns",
    group: "DADOS · ATIVAÇÃO",
    title: "Colunas",
    description: "Mostra tipo, chave, nulabilidade e valor padrão de cada coluna.",
    hint: "Atalho: [2]",
    kind: "control",
  },
  {
    stateful: true,
    targetId: "tutorial-db-indexes",
    group: "DADOS · ATIVAÇÃO",
    title: "Índices",
    description: "Lista índices simples e únicos, incluindo sua definição e colunas.",
    hint: "Atalho: [3]",
    kind: "control",
  },
  {
    stateful: true,
    targetId: "tutorial-db-schema",
    group: "DADOS · ESTRUTURA",
    title: "Schema completo",
    description:
      "Reúne o DDL, constraints, índices e relacionamentos de entrada e saída da tabela.",
    hint: "Atalho: [4]",
    kind: "control",
  },
  {
    stateful: true,
    targetId: "tutorial-db-diagram",
    group: "DADOS · ESTRUTURA",
    title: "Diagrama",
    description: "Alterna o diagrama de relacionamentos.",
    kind: "control",
  },
  {
    stateful: true,
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
    stateful: true,
    targetId: "tutorial-db-table-tools",
    group: "DADOS · FILTRO",
    title: "Ordenar e buscar",
    description:
      "[O] alterna a coluna ativa entre ordem normal, crescente e decrescente. [S] busca um texto em todas as colunas.",
    hint: "A ordenação e a busca ficam isoladas por conexão e tabela.",
    kind: "action",
  },
  {
    stateful: true,
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
    stateful: true,
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
    stateful: true,
    targetId: "tutorial-db-new-row",
    group: "DADOS · ESCRITA",
    title: "Preparar nova linha",
    description:
      "Cria uma linha local em azul. O banco só será alterado depois da revisão e confirmação.",
    hint: "Atalho: [Ctrl+A]",
    kind: "action",
  },
  {
    stateful: true,
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
    stateful: true,
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
    stateful: true,
    targetId: "tutorial-db-undo-row",
    group: "DADOS · ESCRITA",
    title: "Desfazer alteração",
    description:
      "Remove as alterações preparadas da linha atual ou do conjunto selecionado antes que cheguem ao banco.",
    hint: "Atalho: [U]",
    kind: "action",
  },
  {
    stateful: true,
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
    stateful: true,
    targetId: "tutorial-db-table-grid",
    group: "DADOS · NAVEGAÇÃO",
    title: "Grade de registros",
    description:
      "A célula ativa recebe destaque. Use [↑↓] ou [J/K] entre linhas e [H/←] ou [L/→] entre colunas. No limite, os mesmos atalhos passam ao bloco vizinho.",
    hint: "Clique em qualquer célula para selecioná-la.",
    kind: "control",
  },
  {
    stateful: true,
    targetId: "tutorial-db-inspector",
    group: "BLOCO 3 DE 3",
    title: "Dados completos da linha",
    description:
      "Este último bloco mostra todos os campos da linha selecionada, um abaixo do outro, inclusive os que não cabem na grade.",
    hint: "Em telas estreitas, use [I] para abrir este bloco.",
    kind: "block",
  },
  {
    stateful: true,
    targetId: "tutorial-db-inspector-fields",
    group: "INSPETOR · ATIVAÇÃO",
    title: "Campos do registro",
    description:
      "Navegue com [↑↓] ou [J/K]. [Enter] ou [E] edita o campo selecionado usando o mesmo fluxo seguro da grade.",
    kind: "control",
  },
  {
    stateful: true,
    targetId: "database-table-summary",
    group: "DADOS · NAVEGAÇÃO",
    title: "Janela de linhas e foco",
    description:
      "Ao passar da última ou primeira linha, carregue mais 40 e mantenha até 50 na grade. Confira qual bloco recebe o teclado.",
    hint: "[↑/↓] carrega nas extremidades · [H/←] [L/→] navega célula ou bloco",
    kind: "control",
  },
]
