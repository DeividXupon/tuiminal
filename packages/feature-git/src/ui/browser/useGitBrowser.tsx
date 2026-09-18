import { useCallback, useState } from "react"
import type { GitBrowser } from "../../model/browser"
import {
  gitBrowserExecutable,
  openTerminalBrowser,
  validatedGitBrowserUrl,
} from "../../services/browser"
import { loadGitBrowserConfig } from "../../storage/browser/config"
import { GitBrowserTerminal } from "./GitBrowserTerminal"

export type GitBrowserOpener = (
  url: string,
  host: string,
  systemOpen: () => Promise<unknown>,
) => Promise<void>
export const defaultGitBrowserOpener: GitBrowserOpener = async (_url, _host, systemOpen) => {
  await systemOpen()
}

export function useGitBrowser() {
  const [session, setSession] = useState<{ browser: "browsh" | "carbonyl"; url: string } | null>(
    null,
  )
  const open = useCallback<GitBrowserOpener>(async (raw, host, systemOpen) => {
    const url = validatedGitBrowserUrl(raw, host)
    const config = loadGitBrowserConfig()
    if (config.error) throw new Error(config.error)
    const browser: GitBrowser = config.browser
    if (browser === "system") {
      await systemOpen()
    } else if (browser === "terminal-browser") {
      await openTerminalBrowser(url)
    } else {
      gitBrowserExecutable(browser)
      setSession({ browser, url })
    }
  }, [])
  return {
    open,
    modal: session ? <GitBrowserTerminal {...session} onClose={() => setSession(null)} /> : null,
    modalOpen: session !== null,
  }
}
