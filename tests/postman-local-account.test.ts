import { afterEach, describe, expect, test } from "bun:test"
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  loadPostmanAccount,
  removePostmanAccount,
  savePostmanAccount,
  savePostmanAccountLocally,
} from "../packages/feature-http/src/postman/account"
import { POSTMAN_LOCAL_ACCOUNT_FILE } from "../packages/feature-http/src/postman/local-account"
import type { HttpCredentialStore } from "../packages/feature-http/src/storage/environments"

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "tuiminal-postman-local-"))
  roots.push(root)
  let value: string | null = null
  const store: HttpCredentialStore = {
    async get() {
      return value
    },
    async set(input) {
      value = input.value
    },
    async delete() {
      const existed = value !== null
      value = null
      return existed
    },
  }
  return { root, path: join(root, POSTMAN_LOCAL_ACCOUNT_FILE), store }
}

const unavailable: HttpCredentialStore = {
  async get() {
    throw new Error("libsecret not available")
  },
  async set() {
    throw new Error("libsecret not available")
  },
  async delete() {
    throw new Error("libsecret not available")
  },
}
const account = { apiKey: "PMAK-local-fixture", region: "eu" as const }

function expectEmptyPrivateLock(root: string) {
  const directory = join(root, ".tuiminal-locks")
  const path = join(directory, POSTMAN_LOCAL_ACCOUNT_FILE)
  expect(readdirSync(directory)).toEqual([POSTMAN_LOCAL_ACCOUNT_FILE])
  expect(readFileSync(path).byteLength).toBe(0)
  if (process.platform !== "win32") {
    expect(statSync(directory).mode & 0o777).toBe(0o700)
    expect(statSync(path).mode & 0o777).toBe(0o600)
  }
}

describe("Explicit local Postman account", () => {
  test("persists the account with owner-only permissions and loads it without the OS store", async () => {
    const { root, path } = fixture()
    savePostmanAccountLocally(account, root)
    expect(await loadPostmanAccount(unavailable, root)).toEqual(account)
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({ schema: 1, account })
    if (process.platform !== "win32") expect(statSync(path).mode & 0o777).toBe(0o600)
    expect(readdirSync(root).sort()).toEqual([".tuiminal-locks", POSTMAN_LOCAL_ACCOUNT_FILE])
    expectEmptyPrivateLock(root)
  })

  test("failed secure saves do not create an automatic plaintext fallback", async () => {
    const { root } = fixture()
    await expect(savePostmanAccount(account, unavailable, root)).rejects.toThrow()
    expect(readdirSync(root)).toEqual([])
  })

  test("uses the explicitly saved local account over a stale secure account", async () => {
    const { root, store } = fixture()
    await savePostmanAccount({ apiKey: "PMAK-older-fixture", region: "us" }, store, root)
    savePostmanAccountLocally(account, root)
    expect(await loadPostmanAccount(store, root)).toEqual(account)
  })

  test("a successful secure login removes the local copy without leaving backups", async () => {
    const { root, path, store } = fixture()
    savePostmanAccountLocally(account, root)
    const next = { apiKey: "PMAK-secure-fixture", region: "us" as const }
    await savePostmanAccount(next, store, root)
    expect(existsSync(path)).toBe(false)
    expect(readdirSync(root)).toEqual([".tuiminal-locks"])
    expectEmptyPrivateLock(root)
    expect(await loadPostmanAccount(store, root)).toEqual(next)
  })

  test("logout removes both stores when the OS store is available", async () => {
    const { root, path, store } = fixture()
    await savePostmanAccount(account, store, root)
    savePostmanAccountLocally(account, root)
    expect(await removePostmanAccount(store, root)).toBe(true)
    expect(existsSync(path)).toBe(false)
    expect(await loadPostmanAccount(store, root)).toBeNull()
  })

  test("logout erases plaintext and prevents stale secure credentials from returning", async () => {
    const { root, path, store } = fixture()
    await savePostmanAccount({ apiKey: "PMAK-older-fixture", region: "us" }, store, root)
    savePostmanAccountLocally(account, root)
    expect(await removePostmanAccount(unavailable, root)).toBe(true)
    expect(readFileSync(path, "utf8")).not.toContain("PMAK-")
    expect(await loadPostmanAccount(unavailable, root)).toBeNull()
    expect(await loadPostmanAccount(store, root)).toBeNull()
    expect(await removePostmanAccount(unavailable, root)).toBe(false)
    await savePostmanAccount(account, store, root)
    expect(existsSync(path)).toBe(false)
    expect(await loadPostmanAccount(store, root)).toEqual(account)
  })

  test("invalid or oversized local records fail without echoing the key or using an older account", async () => {
    const { root, path, store } = fixture()
    await savePostmanAccount(account, store, root)
    for (const content of [
      "PMAK-malformed-fixture",
      JSON.stringify({ schema: 1, account: { apiKey: "PMAK-fixture", region: "invalid" } }),
      JSON.stringify({ schema: 1, account: { ...account, apiKey: "x".repeat(20_000) } }),
    ]) {
      writeFileSync(path, content)
      await expect(loadPostmanAccount(store, root)).rejects.toThrow(/Postman/)
      try {
        await loadPostmanAccount(store, root)
      } catch (error) {
        expect(String(error)).not.toContain("PMAK-")
      }
    }
  })

  test.skipIf(process.platform === "win32")(
    "refuses symlink reads and writes without touching their target",
    async () => {
      const { root, path, store } = fixture()
      const target = join(root, "unrelated.json")
      writeFileSync(target, "unrelated fixture")
      symlinkSync(target, path)
      expect(() => savePostmanAccountLocally(account, root)).toThrow()
      await expect(loadPostmanAccount(store, root)).rejects.toThrow()
      await expect(removePostmanAccount(store, root)).rejects.toThrow()
      expect(readFileSync(target, "utf8")).toBe("unrelated fixture")
    },
  )
})
