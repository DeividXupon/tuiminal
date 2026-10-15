import { readFile, realpath, stat } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, isAbsolute, join, resolve } from "node:path"
import {
  type TerminalRemoteCodexProfile,
  terminalRemoteProfileValidationError,
} from "@xupon/tuiminal-core/settings/theme"

const MAX_CONFIG_FILES = 64
const MAX_CONFIG_FILE_BYTES = 512 * 1024
const MAX_HOSTS = 64

export type SshConfigDiscoveryOptions = {
  configPath?: string
  homeDirectory?: string
  signal?: AbortSignal
}

function configWords(line: string) {
  const words: string[] = []
  let word = ""
  let quote: '"' | "'" | null = null
  let escaped = false
  const push = () => {
    if (!word) return
    words.push(word)
    word = ""
  }
  for (const character of line) {
    if (escaped) {
      word += character
      escaped = false
      continue
    }
    if (character === "\\") {
      escaped = true
      continue
    }
    if (quote) {
      if (character === quote) quote = null
      else word += character
      continue
    }
    if (character === '"' || character === "'") {
      quote = character
      continue
    }
    if (character === "#") break
    if (/\s/u.test(character)) push()
    else word += character
  }
  if (escaped) word += "\\"
  push()
  return words
}

function configDirective(line: string) {
  const words = configWords(line)
  const first = words.shift()
  if (!first) return null
  const equal = first.indexOf("=")
  const keyword = (equal < 0 ? first : first.slice(0, equal)).toLowerCase()
  const attached = equal < 0 ? "" : first.slice(equal + 1)
  if (attached) words.unshift(attached)
  else if (words[0] === "=") words.shift()
  return { keyword, values: words }
}

function explicitHostProfile(host: string): TerminalRemoteCodexProfile | null {
  if (host.startsWith("!") || /[*?]/u.test(host)) return null
  const profile = { id: host, name: host, host }
  return terminalRemoteProfileValidationError(profile) ? null : profile
}

function includePattern(value: string, homeDirectory: string, sshDirectory: string) {
  const expanded = value.replaceAll("%d", homeDirectory)
  if (expanded === "~") return homeDirectory
  if (expanded.startsWith("~/")) return join(homeDirectory, expanded.slice(2))
  return isAbsolute(expanded) ? expanded : resolve(sshDirectory, expanded)
}

async function includeFiles(pattern: string) {
  if (!["*", "?", "["].some((character) => pattern.includes(character))) return [pattern]
  const glob = new Bun.Glob(process.platform === "win32" ? pattern.replaceAll("\\", "/") : pattern)
  return (await Array.fromAsync(glob.scan({ absolute: true, onlyFiles: true }))).sort()
}

function missingFile(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT")
}

type SshConfigDiscoveryState = {
  homeDirectory: string
  sshDirectory: string
  profiles: Map<string, TerminalRemoteCodexProfile>
  visited: Set<string>
  signal?: AbortSignal
}

async function readConfigSource(path: string, required: boolean, state: SshConfigDiscoveryState) {
  let canonical: string
  let metadata: Awaited<ReturnType<typeof stat>>
  try {
    ;[canonical, metadata] = await Promise.all([realpath(path), stat(path)])
  } catch (error) {
    if (!required && missingFile(error)) return null
    throw error
  }
  if (state.visited.has(canonical)) return null
  state.visited.add(canonical)
  if (!metadata.isFile() || metadata.size > MAX_CONFIG_FILE_BYTES)
    throw new Error("O arquivo de configuração SSH é inválido ou excede o limite permitido.")
  return readFile(canonical, "utf8")
}

function addExplicitHosts(values: readonly string[], state: SshConfigDiscoveryState) {
  for (const value of values) {
    const profile = explicitHostProfile(value)
    if (!profile) continue
    const key = profile.host.toLowerCase()
    if (!state.profiles.has(key)) state.profiles.set(key, profile)
    if (state.profiles.size >= MAX_HOSTS) return
  }
}

async function visitIncludes(values: readonly string[], state: SshConfigDiscoveryState) {
  for (const value of values) {
    const pattern = includePattern(value, state.homeDirectory, state.sshDirectory)
    const files = await includeFiles(pattern)
    for (const included of files) await visitSshConfig(included, false, state)
  }
}

async function visitSshConfig(
  path: string,
  required: boolean,
  state: SshConfigDiscoveryState,
): Promise<void> {
  state.signal?.throwIfAborted()
  if (state.visited.size >= MAX_CONFIG_FILES || state.profiles.size >= MAX_HOSTS) return
  const source = await readConfigSource(path, required, state)
  if (source === null) return
  for (const line of source.split(/\r?\n/u)) {
    state.signal?.throwIfAborted()
    const directive = configDirective(line)
    if (directive?.keyword === "include") await visitIncludes(directive.values, state)
    else if (directive?.keyword === "host") addExplicitHosts(directive.values, state)
  }
}

/** Lists only explicit `Host` aliases. OpenSSH remains responsible for resolving every option. */
export async function listSshConfigProfiles(
  options: SshConfigDiscoveryOptions = {},
): Promise<TerminalRemoteCodexProfile[]> {
  // Test fixtures override the config explicitly so UI tests never inspect the
  // developer's real SSH metadata.
  const testConfigPath =
    options.configPath || options.homeDirectory
      ? undefined
      : process.env.TUIMINAL_TEST_SSH_CONFIG_PATH?.trim()
  const homeDirectory =
    options.homeDirectory ?? (testConfigPath ? dirname(dirname(testConfigPath)) : homedir())
  const sshDirectory = join(homeDirectory, ".ssh")
  const configPath = options.configPath ?? testConfigPath ?? join(sshDirectory, "config")
  const state: SshConfigDiscoveryState = {
    homeDirectory,
    sshDirectory,
    profiles: new Map(),
    visited: new Set(),
    ...(options.signal ? { signal: options.signal } : {}),
  }

  try {
    await visitSshConfig(configPath, true, state)
  } catch (error) {
    if (missingFile(error)) return []
    throw error
  }
  return [...state.profiles.values()]
}
