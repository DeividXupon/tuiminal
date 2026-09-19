import type { HttpClientProps } from "./model/types"
import { HttpInteractiveClient } from "./HttpWorkspace"
import { HttpTutorialDemo } from "./tutorial/HttpTutorialDemo"
import { HttpSourceClient } from "./ui/HttpSourceClient"

export type { HttpClientProps } from "./model/types"

export function HttpClient({ tutorialMode = false, ...props }: HttpClientProps) {
  if (tutorialMode) return <HttpTutorialDemo />
  return (
    <HttpSourceClient active={props.active}>
      {(source, onChooseSource) => (
        <HttpInteractiveClient
          key={source}
          {...props}
          sourceMode={source}
          onChooseSource={onChooseSource}
        />
      )}
    </HttpSourceClient>
  )
}
