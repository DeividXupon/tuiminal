import { AppContext, useAppContext } from "@opentui/react"
import { Tabs } from "@tuiparts/react/tabs"
import { type ReactNode, useMemo } from "react"

/** Keep workspace state and PTYs mounted, but release hidden tools' keyboard subscriptions. */
export function ToolPanel({
  value,
  active,
  children,
}: {
  value: string
  active: boolean
  children: ReactNode
}) {
  const context = useAppContext()
  const scopedContext = useMemo(
    () => ({ ...context, keyHandler: active ? context.keyHandler : null }),
    [context, active],
  )
  return (
    <Tabs.Panel value={value} flexGrow={1} keepMounted>
      <AppContext.Provider value={scopedContext}>{children}</AppContext.Provider>
    </Tabs.Panel>
  )
}
