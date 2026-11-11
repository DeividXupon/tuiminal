/** Parse terminal file drops, never shell commands or arbitrary prompt text. */
export function droppedAgentPaths(input: string, windows = false): string[] | null {
  if (input.length > 32_768 || /[\p{Cc}\p{Cf}]/u.test(input.replace(/[\t\r\n]/gu, ""))) return null
  const paths = terminalPathTokens(input, windows)
  return paths?.length && paths.length <= 20 && paths.every(isAgentDropPath) ? paths : null
}

function terminalPathTokens(input: string, windows: boolean) {
  const paths: string[] = []
  let value = ""
  let quote = ""
  for (let index = 0; index < input.length; index++) {
    const char = input[index] ?? ""
    if (char === "\\" && quote !== "'" && !windows) value += input[++index] ?? "\\"
    else if (quote) {
      if (char === quote) quote = ""
      else value += char
    } else if (char === "'" || char === '"') quote = char
    else if (/\s/u.test(char)) {
      if (value) paths.push(value)
      value = ""
    } else value += char
  }
  if (quote) return null
  if (value) paths.push(value)
  return paths
}

export function isAgentDropPath(value: string) {
  return /^(?:\/|~\/|file:\/\/|[a-z]:[\\/]|\\\\)/iu.test(value)
}

export function agentFilePrompt(paths: readonly string[]) {
  return ` ${paths.map((path) => (/\s|["'\\]/u.test(path) ? JSON.stringify(path) : path)).join(" ")} `
}
