import { runtimeCredentialStore, type HttpCredentialStore } from "../storage/environments"
import {
  readLocalPostmanAccount,
  removeLocalPostmanAccount,
  writeLocalPostmanAccount,
} from "./local-account"

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

function validatedAccount(account: PostmanAccount): PostmanAccount {
  const apiKey = validatePostmanApiKey(account.apiKey)
  if (account.region !== "us" && account.region !== "eu") {
    throw new Error("Região Postman inválida. Use us ou eu.")
  }
  return { apiKey, region: account.region }
}

export async function savePostmanAccount(
  account: PostmanAccount,
  store?: HttpCredentialStore,
  root?: string,
) {
  const value = validatedAccount(account)
  await credentialStore(store).set({
    service: SERVICE,
    name: ACCOUNT,
    value: JSON.stringify(value),
  })
  removeLocalPostmanAccount(root)
}

export function savePostmanAccountLocally(account: PostmanAccount, root?: string) {
  writeLocalPostmanAccount(validatedAccount(account), root)
}

function parseAccount(parsed: unknown): PostmanAccount {
  try {
    if (!parsed || typeof parsed !== "object") throw new Error()
    const account = parsed as Partial<PostmanAccount>
    if (account.region !== "us" && account.region !== "eu") throw new Error()
    return { apiKey: validatePostmanApiKey(account.apiKey ?? ""), region: account.region }
  } catch {
    throw new Error("A credencial Postman salva está inválida; conecte a conta novamente.")
  }
}

export async function loadPostmanAccount(
  store?: HttpCredentialStore,
  root?: string,
): Promise<PostmanAccount | null> {
  const local = readLocalPostmanAccount(root)
  if (local) return local.account === null ? null : parseAccount(local.account)
  const value = await credentialStore(store).get({ service: SERVICE, name: ACCOUNT })
  if (value === null) return null
  try {
    return parseAccount(JSON.parse(value))
  } catch {
    throw new Error("A credencial Postman salva está inválida; conecte a conta novamente.")
  }
}

export async function removePostmanAccount(store?: HttpCredentialStore, root?: string) {
  const local = readLocalPostmanAccount(root)
  let removed: boolean
  try {
    removed = await credentialStore(store).delete({ service: SERVICE, name: ACCOUNT })
  } catch (error) {
    if (!local) throw error
    // Do not resurrect an older secure account when its store becomes available.
    writeLocalPostmanAccount(null, root)
    return local.account !== null
  }
  removeLocalPostmanAccount(root)
  return removed || Boolean(local && local.account !== null)
}
