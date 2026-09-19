import { describe, expect, test } from "bun:test"
import { PostmanApi, type PostmanFetch } from "../packages/feature-http/src/postman/api"
import {
  loadPostmanAccount,
  removePostmanAccount,
  savePostmanAccount,
} from "../packages/feature-http/src/postman/account"
import type { HttpCredentialStore } from "../packages/feature-http/src/storage/environments"
import { parsePostmanLoginOptions } from "../packages/feature-http/src/cli/postman"
import { postmanDisplayName } from "../packages/feature-http/src/postman/display"
import { HTTP_POSTMAN_ERROR_MESSAGES } from "../packages/core/src/i18n/http-postman-errors-catalog"
import { HTTP_POSTMAN_MESSAGES } from "../packages/core/src/i18n/http-postman-catalog"
import { translateUi, type LanguageId } from "../packages/core/src/i18n/index"

function memoryStore(): HttpCredentialStore & { values: Map<string, string> } {
  const values = new Map<string, string>()
  return {
    values,
    async get({ service, name }) {
      return values.get(`${service}:${name}`) ?? null
    },
    async set({ service, name, value }) {
      values.set(`${service}:${name}`, value)
    },
    async delete({ service, name }) {
      return values.delete(`${service}:${name}`)
    },
  }
}

describe("Postman account", () => {
  test("localizes new fixed account and error messages", () => {
    const languages: LanguageId[] = ["pt-BR", "en", "es", "ja", "zh-CN", "ko"]
    const pushSources = new Set([
      "[Ctrl+S] Salvar no Postman",
      "[Ctrl+P] Postman",
      "[Ctrl+P]",
      "[Ctrl+S] Salvar no Postman · [Ctrl+P] Reenviar",
      "REQUEST SALVO NO POSTMAN",
      "REQUEST SALVO · POSTMAN EM DIA",
      "SALVO LOCALMENTE · POSTMAN PENDENTE",
      "Carregando workspaces Postman…",
      "Salve a request localmente antes de enviar ao Postman.",
      "ENVIANDO REQUEST AO POSTMAN…",
      "REQUEST ENVIADA AO POSTMAN",
      "SEM ALTERAÇÕES PARA ENVIAR",
      "Request enviada ao Postman.",
      "Sem alterações para enviar.",
    ])
    const pushMessages = HTTP_POSTMAN_MESSAGES.filter((message) => pushSources.has(message[0]))
    expect(pushMessages).toHaveLength(pushSources.size)
    for (const message of [...HTTP_POSTMAN_ERROR_MESSAGES, ...pushMessages]) {
      languages.forEach((language, index) => {
        expect(translateUi(message[0], language)).toBe(message[index] ?? "")
      })
    }
    expect(translateUi("POSTMAN · 2 requests importados", "en")).toBe(
      "POSTMAN · 2 requests imported",
    )
  })

  test("renders remote names on one inert terminal line", () => {
    expect(postmanDisplayName("  Team\n\u001b[31m Stage\u007f  ")).toBe("Team  [31m Stage")
    expect(postmanDisplayName(null)).toBe("")
  })

  test("accepts login flags in either order and rejects stray or repeated values", () => {
    expect(parsePostmanLoginOptions([])).toEqual({ region: "us", apiKeyStdin: false })
    expect(parsePostmanLoginOptions(["--api-key-stdin", "--region", "eu"])).toEqual({
      region: "eu",
      apiKeyStdin: true,
    })
    expect(() => parsePostmanLoginOptions(["eu"])).toThrow()
    expect(() => parsePostmanLoginOptions(["--region", "eu", "us"])).toThrow()
    expect(() => parsePostmanLoginOptions(["--region", "us", "--region", "eu"])).toThrow()
    expect(() => parsePostmanLoginOptions(["--api-key-stdin", "--api-key-stdin"])).toThrow()
  })

  test("stores the API key only in the credential store and removes it", async () => {
    const store = memoryStore()
    expect(await loadPostmanAccount(store)).toBeNull()
    await savePostmanAccount({ apiKey: "PMAK-fixture", region: "eu" }, store)
    expect(await loadPostmanAccount(store)).toEqual({ apiKey: "PMAK-fixture", region: "eu" })
    expect([...store.values.keys()]).toEqual(["dev.tuiminal.postman:api-account"])
    expect(await removePostmanAccount(store)).toBe(true)
    expect(await loadPostmanAccount(store)).toBeNull()
  })

  test("rejects malformed keys and stored account records", async () => {
    const store = memoryStore()
    await expect(savePostmanAccount({ apiKey: "a\nb", region: "us" }, store)).rejects.toThrow()
    store.values.set("dev.tuiminal.postman:api-account", "not-json")
    await expect(loadPostmanAccount(store)).rejects.toThrow("credencial Postman salva")
  })
})

describe("Postman API", () => {
  test("paginates workspaces and collections and sends the key only in a header", async () => {
    const urls: string[] = []
    const request: PostmanFetch = async (input, init) => {
      const url = new URL(String(input))
      urls.push(url.toString())
      expect(init?.headers).toMatchObject({ "x-api-key": "PMAK-fixture" })
      expect(url.toString()).not.toContain("PMAK-fixture")
      if (url.pathname === "/workspaces") {
        return Response.json(
          url.searchParams.has("cursor")
            ? { workspaces: [{ id: "w2", name: "Second" }], meta: { nextCursor: null } }
            : { workspaces: [{ id: "w1", name: "First" }], meta: { nextCursor: "next" } },
        )
      }
      const offset = Number(url.searchParams.get("offset"))
      return Response.json({
        collections: Array.from({ length: offset ? 1 : 100 }, (_, index) => ({
          id: `c${offset + index}`,
          name: `Collection ${offset + index}`,
        })),
        meta: { total: 101 },
      })
    }
    const api = new PostmanApi({ apiKey: "PMAK-fixture", region: "eu" }, request)
    expect((await api.workspaces()).map(({ id }) => id)).toEqual(["w1", "w2"])
    expect((await api.collections("w1")).map(({ id }) => id)).toHaveLength(101)
    expect(urls).toHaveLength(4)
    expect(urls.every((url) => url.startsWith("https://api.eu.postman.com/"))).toBe(true)
  })

  test("fetches environment values and collection documents", async () => {
    const request: PostmanFetch = async (input) => {
      const path = new URL(String(input)).pathname
      if (path === "/environments")
        return Response.json({ environments: [{ id: "e1", name: "Stage" }] })
      if (path === "/environments/e1") {
        return Response.json({
          environment: {
            name: "Stage",
            values: [{ key: "baseUrl", value: "https://example.test", enabled: true }],
          },
        })
      }
      if (path === "/collections/c1")
        return Response.json({ collection: { info: { name: "C" }, item: [] } })
      return Response.json({ values: [{ key: "workspace", value: "yes" }] })
    }
    const api = new PostmanApi({ apiKey: "PMAK-fixture", region: "us" }, request)
    expect(await api.environments("w1")).toEqual([{ id: "e1", name: "Stage" }])
    expect((await api.environment("e1")).values[0]?.key).toBe("baseUrl")
    expect((await api.collection("c1")).info).toEqual({ name: "C" })
    expect((await api.globals("w1"))[0]?.key).toBe("workspace")
  })

  test("continues collection pages when the server caps a requested page", async () => {
    const offsets: number[] = []
    const api = new PostmanApi({ apiKey: "PMAK-fixture", region: "us" }, async (input) => {
      const offset = Number(new URL(String(input)).searchParams.get("offset"))
      offsets.push(offset)
      return Response.json({
        collections: offset === 0 ? [{ id: "c1", name: "First" }] : [{ id: "c2", name: "Second" }],
        meta: { total: 2 },
      })
    })
    expect((await api.collections("w1")).map(({ id }) => id)).toEqual(["c1", "c2"])
    expect(offsets).toEqual([0, 1])
  })

  test("does not expose the key or server body in errors", async () => {
    const request: PostmanFetch = async () => new Response("PMAK-fixture", { status: 401 })
    const api = new PostmanApi({ apiKey: "PMAK-fixture", region: "us" }, request)
    await expect(api.workspaces()).rejects.toThrow("Chave de API Postman inválida")
    await expect(api.collections("../secrets")).rejects.toThrow("Identificador Postman inválido")
  })

  test("does not echo untrusted rate-limit headers", async () => {
    const api = new PostmanApi(
      { apiKey: "PMAK-fixture", region: "us" },
      async () => new Response(null, { status: 429, headers: { "retry-after": "\u001b[31m" } }),
    )
    await expect(api.workspaces()).rejects.toThrow("Limite da API Postman atingido.")
  })

  test("updates one request with a bounded authenticated PUT", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const api = new PostmanApi({ apiKey: "PMAK-fixture", region: "us" }, async (input, init) => {
      calls.push({ url: String(input), ...(init ? { init } : {}) })
      return Response.json({ data: { id: "r1" } })
    })
    await api.updateRequest("c1", "r1", { method: "POST" })
    expect(calls).toHaveLength(1)
    expect(new URL(calls[0]!.url).pathname).toBe("/collections/c1/requests/r1")
    expect(calls[0]!.url).not.toContain("PMAK-fixture")
    expect(calls[0]!.init).toMatchObject({
      method: "PUT",
      body: '{"method":"POST"}',
      redirect: "error",
      headers: { "x-api-key": "PMAK-fixture", "content-type": "application/json" },
    })
  })

  test("uses collection and request item endpoints for linked mutations", async () => {
    const calls: Array<{ url: URL; method: string; body?: unknown }> = []
    const api = new PostmanApi({ apiKey: "PMAK-fixture", region: "us" }, async (input, init) => {
      calls.push({
        url: new URL(String(input)),
        method: init?.method ?? "",
        ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}),
      })
      return Response.json({ collection: { id: "c1" }, data: { id: "r1" } })
    })
    await api.createCollection("w2", "Users")
    await api.renameCollection("c1", "People")
    await api.createRequest("c1", "List")
    await api.deleteRequest("c1", "r1")
    await api.deleteCollection("c1")
    expect(calls.map(({ url, method }) => `${method} ${url.pathname}${url.search}`)).toEqual([
      "POST /collections?workspace=w2",
      "PATCH /collections/c1",
      "POST /collections/c1/requests",
      "DELETE /collections/c1/requests/r1",
      "DELETE /collections/c1",
    ])
    expect(calls[0]?.body).toMatchObject({ collection: { info: { name: "Users" }, item: [] } })
    expect(calls[1]?.body).toEqual({ collection: { info: { name: "People" } } })
    expect(calls[2]?.body).toEqual({ name: "List", method: "GET", url: "https://example.invalid" })
    expect(calls[3]?.body).toBeUndefined()
  })
})
