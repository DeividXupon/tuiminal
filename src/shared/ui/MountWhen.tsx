import type { ReactNode } from "react"

export function MountWhen({ when, children }: { when: boolean; children: ReactNode }) {
  return when ? children : null
}
