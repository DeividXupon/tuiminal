import { spawn } from "node:child_process"

export function openRunnerUrl(url: string) {
  const command =
    process.platform === "darwin"
      ? ["open", url]
      : process.platform === "win32"
        ? ["cmd", "/c", "start", "", url]
        : ["xdg-open", url]
  const [program, ...args] = command
  if (!program) return
  const child = spawn(program, args, {
    detached: true,
    stdio: "ignore",
  })
  child.unref()
}
