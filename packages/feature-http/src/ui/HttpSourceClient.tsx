import { useEffect, useState, type ReactNode } from "react"
import { LAYOUT } from "@xupon/tuiminal-core/settings/theme"
import { loadPostmanAccount } from "../postman/account"
import type { HttpSourceMode } from "../model/source-mode"
import { HttpSourcePicker } from "./HttpSourcePicker"

export function HttpSourceClient({
  active,
  children,
}: {
  active: boolean
  children: (source: HttpSourceMode, onChooseSource: () => void) => ReactNode
}) {
  const [source, setSource] = useState<HttpSourceMode | null>(null)
  const [checking, setChecking] = useState(true)
  const [postmanConnected, setPostmanConnected] = useState(false)
  useEffect(() => {
    let disposed = false
    void loadPostmanAccount()
      .then(
        (account) => {
          if (disposed) return
          setPostmanConnected(Boolean(account))
          if (!account) setSource("local")
        },
        () => {
          if (!disposed) setSource("local")
        },
      )
      .finally(() => {
        if (!disposed) setChecking(false)
      })
    return () => {
      disposed = true
    }
  }, [])
  const chooseSource = async () => {
    setChecking(true)
    try {
      const account = await loadPostmanAccount()
      setPostmanConnected(Boolean(account))
      setSource(account ? null : "local")
    } catch {
      setPostmanConnected(false)
      setSource("local")
    } finally {
      setChecking(false)
    }
  }
  if (checking) return <box style={{ flexGrow: 1, backgroundColor: LAYOUT.workspaceBackground }} />
  if (!source && postmanConnected) return <HttpSourcePicker active={active} onSelect={setSource} />
  if (!source) return null
  return children(source, () => void chooseSource())
}
