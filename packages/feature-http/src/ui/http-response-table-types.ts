export type HttpTableTone = "text" | "muted" | "http" | "focus" | "success" | "warning" | "danger"
export type HttpTableCell = { text: string; tone?: HttpTableTone }
export type HttpResponseTable = {
  columns: string[]
  rows: HttpTableCell[][]
  weights?: number[]
  empty?: string
  note?: string
}
