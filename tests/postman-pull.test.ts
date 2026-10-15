import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { pullPostmanCollection } from "../packages/feature-http/src/postman/pull"
import {
  loadHttpEnvironments,
  type HttpCredentialStore,
} from "../packages/feature-http/src/storage/environments"

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

function store(): HttpCredentialStore & { values: Map<string, string> } {
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

function api() {
  return {
    async collections() {
      return [{ id: "c1", uid: "owner-c1", name: "Users" }]
    },
    async collection() {
      return {
        info: { schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json" },
        variable: [{ key: "baseUrl", value: "https://collection.example.test" }],
        item: [
          {
            name: "List",
            request: {
              method: "GET",
              url: "{{baseUrl}}/users",
              auth: { type: "bearer", bearer: [{ key: "token", value: "literal-secret-token" }] },
            },
          },
        ],
      }
    },
    async globals() {
      return [
        { key: "baseUrl", value: "https://global.example.test" },
        { key: "token", value: "global-secret", secret: true },
      ]
    },
    async environments() {
      return [{ id: "e1", name: "Stage" }]
    },
    async environment() {
      return {
        name: "Stage",
        values: [
          { key: "baseUrl", value: "https://stage.example.test" },
          { key: "vaultOnly", secret: true },
        ],
      }
    },
  } as Parameters<typeof pullPostmanCollection>[1]
}

describe("Postman account collection pull", () => {
  test("imports a collection into the global HTTP library and keeps variables in the credential store", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "tuiminal-postman-pull-"))
    roots.push(root)
    const credentials = store()
    const result = await pullPostmanCollection(
      root,
      api(),
      { workspaceId: "w1", collectionId: "c1", environmentId: "e1" },
      credentials,
    )
    expect(result.path).toBe("postman/users.http")
    expect(result.imported).toBe(1)
    expect(result.environmentName).toContain("Stage")
    expect(result.warnings).toContain(
      "Ambiente: vaultOnly não tem valor disponível pela API Postman.",
    )
    const content = await readFile(resolve(root, result.path), "utf8")
    expect(content).toContain("GET {{baseUrl}}/users")
    expect(content).not.toContain("stage.example.test")
    expect(content).not.toContain("global-secret")
    expect(content).not.toContain("literal-secret-token")
    expect(content).toContain("{{postman_1_list_bearer_token}}")
    const privateFile = await readFile(resolve(root, "http-client.private.env.json"), "utf8")
    expect(privateFile).not.toContain("stage.example.test")
    expect(privateFile).not.toContain("global-secret")
    expect(privateFile).not.toContain("literal-secret-token")
    const environment = (await loadHttpEnvironments(root, credentials)).find(
      (item) => item.name === result.environmentName,
    )
    expect(environment?.values).toMatchObject({
      baseUrl: "https://stage.example.test",
      token: "global-secret",
      postman_1_list_bearer_token: "literal-secret-token",
    })
    expect(environment?.privateNames.has("baseUrl")).toBe(true)
  })

  test("does not overwrite an earlier pull", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "tuiminal-postman-pull-"))
    roots.push(root)
    const credentials = store()
    const options = { workspaceId: "w1", collectionId: "c1" }
    const first = await pullPostmanCollection(root, api(), options, credentials)
    const second = await pullPostmanCollection(root, api(), options, credentials)
    expect(first.path).toBe("postman/users.http")
    expect(second.path).toBe("postman/users-2.http")
    expect(first.environmentName).not.toBe(second.environmentName)
  })

  test("rejects a symlinked Postman destination", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "tuiminal-postman-pull-"))
    const outside = await mkdtemp(resolve(tmpdir(), "tuiminal-postman-outside-"))
    roots.push(root, outside)
    await symlink(outside, resolve(root, "postman"))
    await expect(
      pullPostmanCollection(root, api(), { workspaceId: "w1", collectionId: "c1" }, store()),
    ).rejects.toThrow("diretório real")
    expect(await readFile(resolve(root, "postman/users.http"), "utf8").catch(() => null)).toBeNull()
  })
})
