import { withShortcutContext } from "@xupon/tuiminal-core/keyboard/react"
import { useEffect } from "react"
import { useRenderer } from "@opentui/react"
import { ensureHttpRendererListenerBudget } from "./model/renderer-listener-budget"
import { clearHttpOAuthSessions } from "./services/oauth2-session"
import type { HttpClientProps } from "./model/types"
import { HttpInteractiveClient } from "./HttpWorkspace"
import { HttpTutorialDemo } from "./tutorial/HttpTutorialDemo"
import { HttpSourceClient } from "./ui/HttpSourceClient"

export type { HttpClientProps } from "./model/types"

function HttpClientView({ tutorialMode = false, ...props }: HttpClientProps) {
  ensureHttpRendererListenerBudget(useRenderer())
  useEffect(() => () => clearHttpOAuthSessions(), [])
  if (tutorialMode) return <HttpTutorialDemo />
  return (
    <HttpSourceClient active={props.active}>
      {(source, onChooseSource, restoredPostman) => (
        <HttpInteractiveClient
          key={source}
          {...props}
          sourceMode={source}
          onChooseSource={onChooseSource}
          startup={restoredPostman}
        />
      )}
    </HttpSourceClient>
  )
}

export const HttpClient = withShortcutContext("http", "workspace", HttpClientView, "http-workspace")
