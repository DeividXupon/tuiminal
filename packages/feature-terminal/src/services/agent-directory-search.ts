import { posix, win32 } from "node:path"

export function directorySearchParts(value: string, windows: boolean) {
  const path = value || "~/"
  const separator = windows ? /[\\/]/u : /\//u
  const last = Math.max(path.lastIndexOf("/"), windows ? path.lastIndexOf("\\") : -1)
  if (separator.test(path.at(-1) ?? "")) return { parent: path, prefix: "" }
  if (path === "~") return { parent: "~/", prefix: "" }
  return { parent: last < 0 ? "~/" : path.slice(0, last + 1), prefix: path.slice(last + 1) }
}

export function directorySuggestions(paths: readonly string[], query: string, windows: boolean) {
  const { prefix } = directorySearchParts(query, windows)
  const pathApi = windows ? win32 : posix
  const term = windows ? prefix.toLocaleLowerCase() : prefix
  return paths.filter((path) => {
    const name = pathApi.basename(path)
    if (!prefix.startsWith(".") && name.startsWith(".")) return false
    return (windows ? name.toLocaleLowerCase() : name).startsWith(term)
  })
}

export function completeDirectorySuggestion(query: string, path: string, windows: boolean) {
  const { parent } = directorySearchParts(query, windows)
  return `${parent}${(windows ? win32 : posix).basename(path)}${parent.endsWith("\\") ? "\\" : "/"}`
}
