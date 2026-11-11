// Preloaded only by CLI regression subprocesses. Never access real APIs or credentials.
const scenario = process.env.TUIMINAL_TEST_POSTMAN_SCENARIO
let accepted = false

Object.defineProperty(process, "platform", {
  value: process.env.TUIMINAL_TEST_POSTMAN_PLATFORM ?? process.platform,
})
Object.assign(globalThis, {
  async fetch(input: RequestInfo | URL, init?: RequestInit) {
    const url = new URL(String(input))
    if (
      url.origin !== "https://api.postman.com" ||
      url.pathname !== "/workspaces" ||
      new Headers(init?.headers).get("x-api-key") !== "PMAK-login-fixture"
    ) {
      throw new Error("Unexpected fixture API call")
    }
    if (scenario === "network") throw new Error("Fixture network failure")
    if (scenario === "invalid") return new Response(null, { status: 401 })
    accepted = true
    return Response.json({ workspaces: [] })
  },
})
Object.assign(Bun, {
  secrets: {
    async get() {
      throw new Error("Unexpected credential read")
    },
    async delete() {
      throw new Error("Unexpected credential deletion")
    },
    async set({ value }: { value: string }) {
      if (!accepted) throw new Error("Credential save preceded API validation")
      if (scenario === "success") return
      // Include synthetic credentials to catch accidental forwarding of native error text.
      throw new Error(
        `${scenario === "locked" ? "Keyring is locked" : "libsecret not available"}: ${value}`,
      )
    },
  },
})
if (scenario === "unavailable") Object.assign(Bun, { secrets: undefined })
