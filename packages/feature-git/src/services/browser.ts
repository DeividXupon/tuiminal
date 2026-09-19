import { spawn } from "node:child_process"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import type { GitBrowser } from "../model/browser"

const browserProcessDisposers = new Set<() => void | Promise<void>>()

export function registerGitBrowserDisposer(dispose: () => void | Promise<void>) {
  browserProcessDisposers.add(dispose)
  return () => {
    browserProcessDisposers.delete(dispose)
  }
}

export async function disposeGitBrowserResources() {
  const disposers = [...browserProcessDisposers]
  browserProcessDisposers.clear()
  const results = await Promise.allSettled(disposers.map(async (dispose) => dispose()))
  const failure = results.find((result) => result.status === "rejected")
  if (failure?.status === "rejected") throw failure.reason
}

export function validatedGitBrowserUrl(raw: string, host: string) {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error(translateUi("URL inválida para o navegador do Git."))
  }
  if (
    url.protocol !== "https:" ||
    url.hostname.toLowerCase() !== host.toLowerCase() ||
    url.username ||
    url.password
  ) {
    throw new Error(translateUi("URL inválida para o navegador do Git."))
  }
  return url.href
}

export function gitBrowserCommand(browser: Exclude<GitBrowser, "system">, url: string) {
  if (browser === "browsh") return ["browsh", "--startup-url", url]
  if (browser === "carbonyl") return ["carbonyl", url]
  return ["terminal-browser", "open", url, "--split", "right"]
}

export function gitBrowserExecutable(browser: Exclude<GitBrowser, "system">) {
  const name = gitBrowserCommand(browser, "https://github.com")[0]
  if (!name) throw new Error(translateUi("Comando do navegador inválido."))
  const executable = Bun.which(name)
  if (!executable)
    throw new Error(`${name}: ${translateUi("não está instalado ou não está no PATH.")}`)
  return executable
}

export async function openTerminalBrowser(url: string, options: { executable?: string } = {}) {
  const executable = options.executable ?? gitBrowserExecutable("terminal-browser")
  const [, ...args] = gitBrowserCommand("terminal-browser", url)
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, args, { stdio: ["inherit", "ignore", "pipe"] })
    let errorText = ""
    child.stderr.on("data", (data: Buffer) => {
      errorText = (errorText + data.toString()).slice(-2_000)
    })
    child.once("error", reject)
    child.once("close", (code) => {
      if (code === 0) resolve()
      else
        reject(
          new Error(
            errorText.trim() || `${translateUi("terminal-browser encerrou com código")} ${code}`,
          ),
        )
    })
  })
}
