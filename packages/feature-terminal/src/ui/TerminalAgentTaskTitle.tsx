import { useMemo, useRef } from "react"
import { agentTitleWindowIndex, agentTitleWindows } from "../rendering/agent-title-marquee"

export function TerminalAgentTaskTitle({
  id,
  title,
  width,
  frame,
  color,
  indent = "",
}: {
  id: string
  title: string
  width: number
  frame: number
  color: string
  indent?: string
}) {
  const windows = useMemo(() => agentTitleWindows(title, width), [title, width])
  const start = useRef({ windows, frame })
  if (start.current.windows !== windows) start.current = { windows, frame }
  const index = agentTitleWindowIndex(windows.length, frame - start.current.frame)
  return (
    <text
      id={id}
      content={`${indent}${windows[index] ?? ""}`}
      wrapMode="none"
      style={{ fg: color, height: 1, flexGrow: 1, minWidth: 0 }}
    />
  )
}
