import { translateUi } from "@xupon/tuiminal-core/i18n/index"

const LABELS: Readonly<Record<string, string>> = {
  approved: "Aprovado",
  "changes-requested": "Alterações solicitadas",
  commented: "Comentado",
  dismissed: "Revisão descartada",
  pending: "Pendente",
  ready: "Pronto para revisão",
  draft: "Rascunho",
  closed: "Fechado",
  reopened: "Reaberto",
  merged: "Mesclado",
  "review-requested": "Revisão solicitada",
  assigned: "Responsável atribuído",
  comment: "Comentário",
  review: "Revisão",
}

export function githubActivityLabel(kind: string) {
  return translateUi(LABELS[kind] ?? "Evento")
}
