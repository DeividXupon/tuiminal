import { existsSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { atomicWriteFileSync, fileContentHash } from "@xupon/tuiminal-core/storage/atomic-file"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { isGitBrowser, type GitBrowser } from "../../model/browser"

const configRoot = process.env.XDG_CONFIG_HOME?.trim() || join(homedir(), ".config")
export const GIT_BROWSER_CONFIG_PATH = join(configRoot, "tuiminal", "git-browser.json")

export function loadGitBrowserConfig(path = GIT_BROWSER_CONFIG_PATH): {
  browser: GitBrowser
  error: string | null
} {
  if (!existsSync(path)) return { browser: "system", error: null }
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"))
    if (!parsed || typeof parsed !== "object")
      throw new Error(translateUi("Configuração do navegador do Git inválida."))
    if (!Object.hasOwn(parsed, "browser"))
      throw new Error(translateUi("Seleção de navegador do Git inválida."))
    const browser = (parsed as Record<string, unknown>).browser
    if (!isGitBrowser(browser))
      throw new Error(translateUi("Seleção de navegador do Git inválida."))
    return { browser, error: null }
  } catch (error) {
    return {
      browser: "system",
      error:
        error instanceof SyntaxError
          ? translateUi("Configuração do navegador do Git inválida.")
          : error instanceof Error
            ? error.message
            : translateUi("Configuração do navegador do Git inválida."),
    }
  }
}

export function saveGitBrowserConfig(browser: GitBrowser, path = GIT_BROWSER_CONFIG_PATH) {
  if (!isGitBrowser(browser)) throw new Error(translateUi("Seleção de navegador do Git inválida."))
  const current = loadGitBrowserConfig(path)
  if (current.error) throw new Error(current.error)
  const expectedHash = existsSync(path) ? fileContentHash(readFileSync(path, "utf8")) : null
  atomicWriteFileSync(path, `${JSON.stringify({ version: 1, browser }, null, 2)}\n`, {
    expectedHash,
    mode: 0o600,
  })
  return browser
}
