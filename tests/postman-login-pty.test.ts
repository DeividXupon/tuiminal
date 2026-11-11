import { expect, test } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"

const cli = resolve(import.meta.dir, "../apps/cli/bin/tuiminal.ts")
const preload = resolve(import.meta.dir, "fixtures/postman-login.ts")
const prompt = "Salvar sem criptografia? [Y] Sim · [N/Enter/Esc] Não (padrão): "

async function withLoginTerminal(
  action: (context: {
    send: (text: string) => void
    waitFor: (text: string) => Promise<void>
    output: () => string
    exited: Promise<number>
    file: string
    run: (command: string) => Promise<{ code: number; stdout: string }>
  }) => Promise<void>,
) {
  const root = mkdtempSync(join(tmpdir(), "tuiminal-postman-pty-"))
  try {
    mkdirSync(join(root, "config/tuiminal"), { recursive: true })
    writeFileSync(
      join(root, "config/tuiminal/settings.json"),
      JSON.stringify({ language: "pt-BR" }),
    )
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      XDG_CONFIG_HOME: join(root, "config"),
      XDG_DATA_HOME: join(root, "data"),
      TUIMINAL_HTTP_HOME: join(root, "http"),
      TUIMINAL_WORKDIR: root,
      TUIMINAL_SOURCE_FEATURES: "1",
      TUIMINAL_TEST_POSTMAN_SCENARIO: "missing-libsecret",
      TUIMINAL_TEST_POSTMAN_PLATFORM: "linux",
      TERM: "xterm-256color",
      NO_COLOR: "",
    }
    delete env.FORCE_COLOR
    let output = ""
    const listeners = new Set<() => void>()
    const child = Bun.spawn([process.execPath, "--preload", preload, cli, "postman", "login"], {
      cwd: root,
      env,
      terminal: {
        cols: 180,
        rows: 24,
        data(_terminal, bytes) {
          output += Buffer.from(bytes).toString("utf8")
          for (const listener of listeners) listener()
        },
      },
    })
    const terminal = child.terminal
    const timeout = setTimeout(() => child.kill(), 10_000)
    try {
      if (!terminal) throw new Error("PTY unavailable")
      const waitFor = (text: string) =>
        new Promise<void>((resolve, reject) => {
          const check = () => {
            if (Bun.stripANSI(output).includes(text)) {
              clearTimeout(deadline)
              listeners.delete(check)
              resolve()
            }
          }
          const deadline = setTimeout(() => {
            listeners.delete(check)
            reject(new Error(`Missing terminal text: ${text}\n${Bun.stripANSI(output)}`))
          }, 5_000)
          listeners.add(check)
          check()
        })
      await waitFor("Chave de API Postman:")
      terminal.write("PMAK-login-fixture\r")
      await waitFor(prompt)
      expect(output).not.toContain("PMAK-login-fixture")
      expect(output).toContain("\u001b[31mA chave foi aceita")
      expect(output).toContain("\u001b[33mA chave será salva em texto puro")
      expect(existsSync(join(root, "http/postman-account.json"))).toBe(false)
      await action({
        send: (text) => terminal.write(text),
        waitFor,
        output: () => output,
        exited: child.exited,
        file: join(root, "http/postman-account.json"),
        async run(command) {
          const next = Bun.spawn(
            [process.execPath, "--preload", preload, cli, "postman", command],
            {
              cwd: root,
              env,
              stdin: "ignore",
              stdout: "pipe",
              stderr: "pipe",
            },
          )
          const [code, stdout, stderr] = await Promise.all([
            next.exited,
            new Response(next.stdout).text(),
            new Response(next.stderr).text(),
          ])
          expect(stderr).toBe("")
          expect(stdout).not.toContain("PMAK-login-fixture")
          return { code, stdout }
        },
      })
      expect(output).not.toContain("PMAK-login-fixture")
    } finally {
      clearTimeout(timeout)
      if (child.exitCode === null) child.kill()
      await child.exited
      terminal?.close()
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

test.skipIf(process.platform === "win32")(
  "real terminal saves only after Y and Enter, then reopens and logs out without libsecret",
  async () => {
    await withLoginTerminal(async ({ send, waitFor, exited, file, run }) => {
      send("Y")
      await waitFor(`${prompt}Y`)
      expect(existsSync(file)).toBe(false)
      send("\r")
      await waitFor("Chave salva localmente sem criptografia.")
      expect(await exited).toBe(0)
      expect(JSON.parse(readFileSync(file, "utf8")).account).toEqual({
        apiKey: "PMAK-login-fixture",
        region: "us",
      })
      expect(await run("status")).toEqual({ code: 0, stdout: "Postman conectado (US).\n" })
      expect(await run("logout")).toEqual({ code: 0, stdout: "Postman desconectado.\n" })
      expect(readFileSync(file, "utf8")).not.toContain("PMAK-")
      expect(await run("status")).toEqual({ code: 0, stdout: "Postman desconectado.\n" })
    })
  },
  15_000,
)

for (const [name, keys] of [
  ["Enter", "\r"],
  ["No", "n\r"],
  ["Escape", "\u001b"],
  ["Ctrl+C", "\u0003"],
  ["unexpected answer", "y!\r"],
  ["old S shortcut", "s\r"],
  ["erased answer", "y\u007f\r"],
] as const) {
  test.skipIf(process.platform === "win32")(
    `real terminal ${name} declines plaintext storage`,
    async () => {
      await withLoginTerminal(async ({ send, waitFor, exited, file }) => {
        send(keys)
        await waitFor("Login cancelado. A chave informada não foi salva.")
        expect(await exited).toBe(1)
        expect(existsSync(file)).toBe(false)
      })
    },
    15_000,
  )
}

test.skipIf(process.platform === "win32")(
  "declining leaves an existing local account unchanged",
  async () => {
    await withLoginTerminal(async ({ send, waitFor, exited, file }) => {
      mkdirSync(dirname(file), { recursive: true })
      const previous = JSON.stringify({
        schema: 1,
        account: { apiKey: "PMAK-previous-fixture", region: "eu" },
      })
      writeFileSync(file, previous, { mode: 0o600 })
      send("\r")
      await waitFor("Login cancelado.")
      expect(await exited).toBe(1)
      expect(readFileSync(file, "utf8")).toBe(previous)
    })
  },
  15_000,
)

test.skipIf(process.platform === "win32")(
  "a failed local write does not report a connected account",
  async () => {
    await withLoginTerminal(async ({ send, waitFor, exited, file, output }) => {
      mkdirSync(file, { recursive: true })
      send("y\r")
      await waitFor("Não foi possível acessar o arquivo local da conta Postman.")
      expect(await exited).toBe(1)
      expect(output()).not.toContain("Postman conectado")
      expect(output()).not.toContain("Chave salva localmente")
    })
  },
  15_000,
)
