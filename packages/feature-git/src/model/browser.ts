export const GIT_BROWSER_OPTIONS = ["system", "browsh", "carbonyl", "terminal-browser"] as const

export type GitBrowser = (typeof GIT_BROWSER_OPTIONS)[number]

export function isGitBrowser(value: unknown): value is GitBrowser {
  return GIT_BROWSER_OPTIONS.some((option) => option === value)
}

export function gitBrowserLabel(browser: GitBrowser) {
  if (browser === "system") return "Navegador padrão"
  if (browser === "browsh") return "Browsh"
  if (browser === "carbonyl") return "Carbonyl"
  return "terminal-browser"
}

export function gitBrowserDescription(browser: GitBrowser) {
  if (browser === "system") return "Abre links no navegador padrão do sistema."
  if (browser === "browsh") return "Abre Browsh no terminal integrado ao Git."
  if (browser === "carbonyl") return "Abre Carbonyl no terminal integrado ao Git."
  return "Abre terminal-browser em um painel separado do terminal."
}
