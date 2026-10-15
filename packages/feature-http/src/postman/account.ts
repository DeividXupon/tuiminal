import { runtimeCredentialStore, type HttpCredentialStore } from "../storage/environments"

const SERVICE = "dev.tuiminal.postman"
const ACCOUNT = "api-account"

export type PostmanRegion = "us" | "eu"
export type PostmanAccount = { apiKey: string; region: PostmanRegion }

export function validatePostmanApiKey(value: string) {
  const key = value.trim()
  if (!key || [...key].some((character) => character <= " " || character.codePointAt(0) === 127)) {
    throw new Error("Informe uma chave de API Postman válida.")
  }
  return key
}

function credentialStore(store?: HttpCredentialStore) {
  const selected = store ?? runtimeCredentialStore()
  if (!selected) throw new Error("O gerenciador de credenciais do sistema não está disponível.")
  return selected
}

export async function savePostmanAccount(account: PostmanAccount, store?: HttpCredentialStore) {
  const apiKey = validatePostmanApiKey(account.apiKey)
  if (account.region !== "us" && account.region !== "eu") {
    throw new Error("Região Postman inválida. Use us ou eu.")
  }
  await credentialStore(store).set({
    service: SERVICE,
    name: ACCOUNT,
    value: JSON.stringify({ apiKey, region: account.region }),
  })
}

export async function loadPostmanAccount(
  store?: HttpCredentialStore,
): Promise<PostmanAccount | null> {
  const value = await credentialStore(store).get({ service: SERVICE, name: ACCOUNT })
  if (value === null) return null
  try {
    const parsed: unknown = JSON.parse(value)
    if (!parsed || typeof parsed !== "object") throw new Error()
    const account = parsed as Partial<PostmanAccount>
    if (account.region !== "us" && account.region !== "eu") throw new Error()
    return { apiKey: validatePostmanApiKey(account.apiKey ?? ""), region: account.region }
  } catch {
    throw new Error("A credencial Postman salva está inválida; conecte a conta novamente.")
  }
}

export async function removePostmanAccount(store?: HttpCredentialStore) {
  return credentialStore(store).delete({ service: SERVICE, name: ACCOUNT })
}
