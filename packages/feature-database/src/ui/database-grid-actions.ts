import { paletteAction } from "@xupon/tuiminal-core/ui/use-action-palette"

type GridActions = {
  canCreate: boolean
  canEdit: boolean
  canDelete: boolean
  canUndo: boolean
  hasRow: boolean
  hasRows: boolean
  hasSelection: boolean
  hasChanges: boolean
  writeBusy: boolean
  writeBlockReason: string | null
  create: () => void
  edit: () => void
  delete: () => void
  undo: () => void
  select: () => void
  sweep: () => void
  export: () => void
  review: () => void
}

export function databaseGridActions(state: GridActions) {
  const writeReason = state.writeBusy
    ? "Operação em andamento"
    : state.writeBlockReason || "Selecione uma linha editável"
  return [
    paletteAction(
      "select",
      "[Space]",
      "Selecionar linha",
      "Marca ou desmarca a linha atual.",
      "SELEÇÃO",
      state.select,
      !state.hasRow && "Selecione uma linha",
    ),
    paletteAction(
      "sweep",
      "[Alt+Space]",
      "Selecionar intervalo",
      "Alterna a seleção de linhas durante a navegação.",
      "SELEÇÃO",
      state.sweep,
      !state.hasRows && "Nenhuma linha disponível",
    ),
    paletteAction(
      "export",
      "[X]",
      "Exportar seleção",
      "Exporta as linhas marcadas com a visibilidade atual.",
      "SELEÇÃO",
      state.export,
      !state.hasSelection && "Selecione uma linha",
    ),
    paletteAction(
      "create",
      "[Ctrl+A]",
      "Preparar nova linha",
      "Cria uma linha local em azul. O banco só será alterado depois da revisão e confirmação.",
      "ALTERAÇÕES",
      state.create,
      (!state.canCreate || state.writeBusy) && writeReason,
    ),
    paletteAction(
      "edit",
      "[E]",
      "Editar célula",
      "Abre o editor da célula ou das linhas marcadas.",
      "ALTERAÇÕES",
      state.edit,
      (!state.canEdit || state.writeBusy) && writeReason,
    ),
    paletteAction(
      "delete",
      "[dd]",
      "Preparar exclusão",
      "Prepara a exclusão da linha ou das linhas marcadas.",
      "ALTERAÇÕES",
      state.delete,
      (!state.canDelete || state.writeBusy) && writeReason,
    ),
    paletteAction(
      "undo",
      "[U]",
      "Desfazer alteração",
      "Remove as alterações preparadas da seleção.",
      "ALTERAÇÕES",
      state.undo,
      (!state.canUndo || state.writeBusy) && "Nenhuma alteração disponível",
    ),
    paletteAction(
      "review",
      "[Ctrl+S]",
      "Revisar alterações",
      "Revise e aprove o SQL antes de alterar o banco.",
      "ALTERAÇÕES",
      state.review,
      (!state.hasChanges || state.writeBusy) && "Nenhuma alteração disponível",
    ),
  ]
}
