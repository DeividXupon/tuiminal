export type TutorialStep = {
  targetId: string
  group: string
  title: string
  description: string
  hint?: string
  kind: "block" | "control" | "action"
  accent?: string
  stateful?: boolean
}
