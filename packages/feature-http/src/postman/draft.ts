import type { HttpRequestDefinition } from "../model/types"
import { saveHttpRequest } from "../storage/collections"
import type { PostmanApi } from "./api"
import { createPostmanRequest } from "./mutations"
import { pushPostmanRequest } from "./sync"

export async function savePostmanDraft(
  root: string,
  api: PostmanApi,
  draft: HttpRequestDefinition,
  filePath: string,
  expectedHash: string,
  folder?: { id: string; path: string },
) {
  if (draft.source.kind !== "scratch") {
    throw new Error("Somente um novo request pode escolher uma coleção Postman ao salvar.")
  }
  const name = folder ? `${folder.path} / ${draft.name}` : draft.name
  const created = await createPostmanRequest(root, api, filePath, name, expectedHash, folder?.id)
  try {
    const saved = await saveHttpRequest(root, {
      ...draft,
      id: created.id,
      name: created.name,
      source: created.source,
    })
    await pushPostmanRequest(root, api, saved)
    return saved
  } catch (error) {
    throw new Error(
      "A request foi criada no Postman, mas a edição não foi concluída; atualize a coleção.",
      {
        cause: error,
      },
    )
  }
}
