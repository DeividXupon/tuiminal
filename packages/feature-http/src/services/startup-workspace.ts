import { loadPostmanAccount } from "../postman/account"
import { PostmanApi, type PostmanWorkspace } from "../postman/api"
import { LivePostmanSession } from "../postman/live-session"
import type { HttpLastWorkspace } from "../storage/last-workspace"

export type HttpRestoredPostmanWorkspace = {
  workspace: PostmanWorkspace
  session: LivePostmanSession
}

export async function openInitialPostmanWorkspace(
  selection: HttpLastWorkspace,
): Promise<HttpRestoredPostmanWorkspace> {
  const account = await loadPostmanAccount()
  if (!account) throw new Error("Conecte a conta: tuiminal postman login")
  const api = new PostmanApi(account)
  const workspaces = await api.workspaces()
  const previous = selection.source === "postman" ? selection : undefined
  const workspace = workspaces.find((entry) => entry.id === previous?.workspaceId) ?? workspaces[0]
  if (!workspace) throw new Error("Nenhum workspace acessível.")
  let environmentId = workspace.id === previous?.workspaceId ? previous?.environmentId : undefined
  if (environmentId) {
    const environments = await api.environments(workspace.id)
    if (!environments.some((entry) => entry.id === environmentId || entry.uid === environmentId))
      environmentId = undefined
  }
  const session = new LivePostmanSession(api, workspace.id, environmentId)
  try {
    await session.load()
    return { workspace, session }
  } catch (error) {
    session.dispose()
    throw error
  }
}
