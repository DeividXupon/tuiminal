import { PostmanApi } from "../postman/api"
import {
  loadPostmanAccount,
  removePostmanAccount,
  savePostmanAccount,
  type PostmanRegion,
} from "../postman/account"
import { pullPostmanCollection } from "../postman/pull"
import { postmanDisplayName } from "../postman/display"
import { HTTP_WORKING_DIRECTORY } from "../services/context"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { readFile } from "node:fs/promises"
import { resolve, sep } from "node:path"
import { parseHttpFile, requestFromHttpFile } from "../model/http-file"
import { pushPostmanRequest } from "../postman/sync"

function help() {
  return `${translateUi("Uso:")}
  tuiminal postman login [--region us|eu] [--api-key-stdin]
  tuiminal postman status
  tuiminal postman logout
  tuiminal postman workspaces
  tuiminal postman collections <workspace-id>
  tuiminal postman environments <workspace-id>
  tuiminal postman pull <workspace-id> <collection-id> [--environment <environment-id>]
  tuiminal postman push <postman/file.http> [request-name]

${translateUi("A chave é guardada no gerenciador de credenciais do sistema.")}
${translateUi("--api-key-stdin lê a chave da entrada padrão sem colocá-la na linha de comando.")}`
}

async function keyFromStdin() {
  let key = ""
  for await (const chunk of process.stdin) {
    key += String(chunk)
    if (key.length > 1024) throw new Error("Chave de API Postman muito longa.")
  }
  return key.trim()
}

function nextTerminalKey(key: string, character: string) {
  if (character === "\r" || character === "\n") return { kind: "done" as const, key }
  if (character === "\u0003") return { kind: "cancel" as const, key }
  if (character === "\u007f" || character === "\b") {
    return { kind: "continue" as const, key: key.slice(0, -1) }
  }
  if (character < " " || character === "\u007f") return { kind: "continue" as const, key }
  return { kind: "continue" as const, key: `${key}${character}` }
}

async function keyFromTerminal(): Promise<string> {
  if (!process.stdin.isTTY || !process.stdin.setRawMode) {
    throw new Error("Use --api-key-stdin para fornecer a chave sem eco no terminal.")
  }
  const previousRaw = process.stdin.isRaw
  process.stdout.write(translateUi("Chave de API Postman: "))
  process.stdin.setRawMode(true)
  process.stdin.resume()
  return new Promise((resolve, reject) => {
    let key = ""
    const finish = (error?: Error) => {
      process.stdin.off("data", receive)
      process.stdin.setRawMode(previousRaw)
      process.stdin.pause()
      process.stdout.write("\n")
      if (error) reject(error)
      else resolve(key)
    }
    const receive = (chunk: Buffer) => {
      for (const character of chunk.toString("utf8")) {
        const next = nextTerminalKey(key, character)
        if (next.kind === "done") return finish()
        if (next.kind === "cancel") return finish(new Error("Conexão Postman cancelada."))
        key = next.key
        if (key.length >= 1024) return finish(new Error("Chave de API Postman muito longa."))
      }
    }
    process.stdin.on("data", receive)
  })
}

export function parsePostmanLoginOptions(options: string[]) {
  let region: PostmanRegion = "us"
  let regionProvided = false
  let apiKeyStdin = false
  for (let index = 0; index < options.length; index += 1) {
    const option = options[index]
    if (option === "--api-key-stdin" && !apiKeyStdin) {
      apiKeyStdin = true
      continue
    }
    if (option === "--region" && !regionProvided) {
      const value = options[++index]
      if (value !== "us" && value !== "eu") throw new Error("Use --region us ou --region eu.")
      region = value
      regionProvided = true
      continue
    }
    throw new Error("Opção Postman desconhecida ou repetida.")
  }
  return { region, apiKeyStdin }
}

async function connectedApi() {
  const account = await loadPostmanAccount()
  if (!account) throw new Error("Postman desconectado. Execute: tuiminal postman login")
  return new PostmanApi(account)
}

async function login(options: string[]) {
  const { region, apiKeyStdin } = parsePostmanLoginOptions(options)
  const apiKey = apiKeyStdin ? await keyFromStdin() : await keyFromTerminal()
  const account = { apiKey, region }
  await new PostmanApi(account).workspaces()
  await savePostmanAccount(account)
  console.log(translateUi(`Postman conectado (${region.toUpperCase()}).`))
}

async function list(command: "collections" | "environments", options: string[]) {
  if (options.length !== 1) throw new Error("Informe o ID do workspace Postman.")
  const api = await connectedApi()
  const entries =
    command === "collections"
      ? await api.collections(options[0] ?? "")
      : await api.environments(options[0] ?? "")
  for (const entry of entries) console.log(`${entry.id}\t${postmanDisplayName(entry.name)}`)
}

async function pull(options: string[]) {
  const environmentFlag = options.indexOf("--environment")
  if (
    options.length < 2 ||
    (environmentFlag < 0 && options.length !== 2) ||
    (environmentFlag >= 0 && (environmentFlag !== 2 || options.length !== 4))
  ) {
    throw new Error(help())
  }
  const result = await pullPostmanCollection(HTTP_WORKING_DIRECTORY, await connectedApi(), {
    workspaceId: options[0] ?? "",
    collectionId: options[1] ?? "",
    ...(environmentFlag >= 0 ? { environmentId: options[3] ?? "" } : {}),
  })
  console.log(`${translateUi("Coleção importada:")} ${result.path} (${result.imported} requests).`)
  if (result.environmentName)
    console.log(`${translateUi("No HTTP, selecione [E]")} ${result.environmentName}.`)
  for (const warning of result.warnings)
    console.error(`${translateUi("Aviso:")} ${translateUi(warning)}`)
}

async function push(options: string[]) {
  if (options.length < 1 || options.length > 2) throw new Error(help())
  const path = (options[0] ?? "").replaceAll("\\", "/")
  if (!path.startsWith("postman/") || !path.endsWith(".http") || path.split("/").includes("..")) {
    throw new Error("Informe o caminho relativo postman/<coleção>.http da biblioteca HTTP.")
  }
  const absolute = resolve(HTTP_WORKING_DIRECTORY, path)
  if (!absolute.startsWith(`${resolve(HTTP_WORKING_DIRECTORY)}${sep}`)) {
    throw new Error("Caminho Postman inválido.")
  }
  const file = parseHttpFile(await readFile(absolute, "utf8"), path)
  const matches = file.requests.filter((request) => !options[1] || request.name === options[1])
  if (matches.length !== 1) {
    throw new Error("Informe o nome exato da request para escolher uma única request.")
  }
  const request = requestFromHttpFile(file, matches[0]!)
  const result = await pushPostmanRequest(HTTP_WORKING_DIRECTORY, await connectedApi(), request)
  console.log(
    translateUi(
      result === "pushed" ? "Request enviada ao Postman." : "Sem alterações para enviar.",
    ),
  )
}

async function execute(command: string | undefined, options: string[]) {
  if (
    !command ||
    ["help", "--help", "-h"].includes(command) ||
    options.includes("--help") ||
    options.includes("-h")
  )
    return console.log(help())
  if (command === "login") return login(options)
  if (options.length && !["collections", "environments", "pull", "push"].includes(command)) {
    throw new Error("Argumentos Postman inesperados.")
  }
  if (command === "status") {
    const account = await loadPostmanAccount()
    return console.log(
      translateUi(
        account ? `Postman conectado (${account.region.toUpperCase()}).` : "Postman desconectado.",
      ),
    )
  }
  if (command === "logout") {
    await removePostmanAccount()
    return console.log(translateUi("Postman desconectado."))
  }
  if (command === "workspaces") {
    for (const workspace of await (await connectedApi()).workspaces()) {
      console.log(
        `${workspace.id}\t${postmanDisplayName(workspace.name)}\t${postmanDisplayName(workspace.visibility ?? "")}`,
      )
    }
    return
  }
  if (command === "collections" || command === "environments") return list(command, options)
  if (command === "pull") return pull(options)
  if (command === "push") return push(options)
  throw new Error("Comando Postman desconhecido.")
}

export async function postmanCli(args: string[]): Promise<number> {
  try {
    await execute(args[0], args.slice(1))
    return 0
  } catch (error) {
    console.error(translateUi(error instanceof Error ? error.message : String(error)))
    return 1
  }
}
