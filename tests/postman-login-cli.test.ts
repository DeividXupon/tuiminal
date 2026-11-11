import { describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

async function login({
  scenario = "missing-libsecret",
  language = "pt-BR",
  platform = "linux",
  forceColor = "1",
  noColor = "",
}: {
  scenario?: string
  language?: string
  platform?: string
  forceColor?: string
  noColor?: string
} = {}) {
  const root = mkdtempSync(join(tmpdir(), "tuiminal-postman-login-"))
  try {
    mkdirSync(join(root, "config/tuiminal"), { recursive: true })
    writeFileSync(join(root, "config/tuiminal/settings.json"), JSON.stringify({ language }))
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      XDG_CONFIG_HOME: join(root, "config"),
      XDG_DATA_HOME: join(root, "data"),
      TUIMINAL_HTTP_HOME: join(root, "http"),
      TUIMINAL_WORKDIR: root,
      TUIMINAL_SOURCE_FEATURES: "1",
      TUIMINAL_TEST_POSTMAN_SCENARIO: scenario,
      TUIMINAL_TEST_POSTMAN_PLATFORM: platform,
      NO_COLOR: noColor,
      FORCE_COLOR: forceColor,
    }
    if (forceColor === "") delete env.FORCE_COLOR
    const child = Bun.spawn(
      [
        process.execPath,
        "--preload",
        resolve(import.meta.dir, "fixtures/postman-login.ts"),
        resolve(import.meta.dir, "../apps/cli/bin/tuiminal.ts"),
        "postman",
        "login",
        "--api-key-stdin",
      ],
      {
        cwd: root,
        env,
        stdin: Buffer.from("PMAK-login-fixture\n"),
        stdout: "pipe",
        stderr: "pipe",
      },
    )
    const timeout = setTimeout(() => child.kill(), 10_000)
    try {
      const [exitCode, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ])
      expect(stdout + stderr).not.toContain("PMAK-login-fixture")
      expect(existsSync(join(root, "http/postman-account.json"))).toBe(false)
      return { exitCode, stdout, stderr }
    } finally {
      clearTimeout(timeout)
      if (child.exitCode === null) {
        child.kill()
        await child.exited
      }
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

describe("Postman login diagnostics", () => {
  test.each(["missing-libsecret", "locked", "unavailable"])(
    "explains %s after API validation with a red error and yellow recovery steps",
    async (scenario) => {
      const result = await login({ scenario })
      expect(result.exitCode).toBe(1)
      expect(result.stdout).toBe("")
      expect(result.stderr).toContain("\u001b[31mA chave foi aceita pelo Postman, mas")
      expect(result.stderr).toContain("gerenciador de credenciais do sistema.\u001b[0m")
      expect(result.stderr).toContain("\u001b[33mNo Linux,")
      expect(result.stderr).toContain("sudo apt install libsecret-1-0 gnome-keyring\u001b[0m")
      expect(result.stderr).toContain("\u001b[33mInicie e desbloqueie o cofre")
      expect(result.stderr).toContain("SSH/WSL")
      expect(result.stderr).toContain("tuiminal postman login\u001b[0m")
      expect(result.stderr).not.toContain("libsecret not available")
      expect(result.stderr).toContain("terminal interativo")
      expect(result.stderr).not.toContain("Salvar sem criptografia?")
    },
  )

  test.each([{ noColor: "1" }, { forceColor: "0" }, { forceColor: "" }])(
    "retains readable recovery text without ANSI colors: %j",
    async (options) => {
      const result = await login(options)
      expect(result.exitCode).toBe(1)
      expect(result.stderr).not.toContain("\u001b[")
      expect(result.stderr).toContain("A chave foi aceita pelo Postman")
      expect(result.stderr).toContain("sudo apt install libsecret-1-0 gnome-keyring")
    },
  )

  test.each([
    ["invalid", "Chave de API Postman inválida ou expirada."],
    ["network", "Não foi possível conectar à API Postman."],
  ])("keeps %s API failures separate from storage failures", async (scenario, message) => {
    const result = await login({ scenario, forceColor: "0" })
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toBe(`${message}\n`)
    expect(result.stdout).toBe("")
  })

  test.each(["darwin", "win32"])("gives credential store guidance on %s", async (platform) => {
    const result = await login({ platform })
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("\u001b[33mDesbloqueie o gerenciador de credenciais")
    expect(result.stderr).not.toContain("sudo apt")
  })

  test.each(["en", "es", "ja", "zh-CN", "ko", "ru"])(
    "localizes the recovery guidance in %s",
    async (language) => {
      const result = await login({ language })
      expect(result.exitCode).toBe(1)
      expect(result.stderr).toContain("\u001b[31m")
      expect(result.stderr).toContain("\u001b[33m")
      expect(result.stderr).not.toContain("A chave foi aceita")
      expect(result.stderr).not.toContain("No Linux, disponibilize")
      expect(result.stderr).not.toContain("Inicie e desbloqueie")
      expect(result.stderr).toContain("sudo apt install libsecret-1-0 gnome-keyring")
    },
  )

  test("reports success only after storing the accepted key", async () => {
    const result = await login({ scenario: "success" })
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toBe("Postman conectado (US).\n")
    expect(result.stderr).toBe("")
  })
})
