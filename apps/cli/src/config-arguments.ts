/** Extract only the host option, leaving feature CLI arguments in their original order. */
export function configurationArguments(args: readonly string[]) {
  const remaining: string[] = []
  let configPath: string | undefined
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!
    if (argument !== "--config" && !argument.startsWith("--config=")) {
      remaining.push(argument)
      continue
    }
    const value = argument === "--config" ? args[++index] : argument.slice("--config=".length)
    if (!value?.trim() || value.startsWith("--")) {
      throw new Error("--config requires a file path")
    }
    if (configPath !== undefined) throw new Error("--config may only be specified once")
    configPath = value
  }
  return { args: remaining, configPath }
}
