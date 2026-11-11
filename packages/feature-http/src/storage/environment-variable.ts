import { GLOBAL_HTTP_ENVIRONMENT_NAME } from "../model/environment-scope"
import { httpEnvironmentsForRequest, loadHttpEnvironmentCatalog } from "./environments"
import { replaceGlobalHttpEnvironment, saveGlobalHttpVariables } from "./global-environments"

export async function localEnvironmentVariableEditor(
  root: string,
  key: string,
  name: string,
  refresh: () => Promise<void>,
) {
  const environmentName = key === "@globals" ? GLOBAL_HTTP_ENVIRONMENT_NAME : key
  const read = async () => {
    const catalog = await loadHttpEnvironmentCatalog(root, [])
    const environment = httpEnvironmentsForRequest(catalog).find(
      (item) => item.name === environmentName,
    )
    if (!environment || !Object.hasOwn(environment.values, name))
      throw Error("Variável não encontrada.")
    return environment.values
  }
  const original = (await read())[name]
  return async (value: string) => {
    const current = await read()
    if (current[name] === value) return refresh()
    if (current[name] !== original)
      throw Error("A variável mudou. Reabra para carregar o valor atual.")
    const variables = Object.entries({ ...current, [name]: value }).map(([name, value]) => ({
      name,
      value,
    }))
    if (key === "@globals") await saveGlobalHttpVariables(root, variables)
    else await replaceGlobalHttpEnvironment(root, key, { environmentName, variables })
    await refresh()
  }
}
