import { createContext, useContext, type ReactNode } from "react"

export const HttpBoxSelectionContext = createContext<(id: string) => ReactNode>(() => null)

export function HttpBoxSelection({ id }: { id: string }) {
  return useContext(HttpBoxSelectionContext)(id)
}
