import { execFile } from "node:child_process"
import { readlink } from "node:fs/promises"

function readMacProcessWorkingDirectory(pid: number, signal?: AbortSignal) {
  return new Promise<string | null>((resolve) => {
    execFile(
      "lsof",
      ["-a", "-p", String(pid), "-d", "cwd", "-Fn"],
      {
        encoding: "utf8",
        timeout: 2500,
        maxBuffer: 256 * 1024,
        windowsHide: true,
        ...(signal ? { signal } : {}),
      },
      (error, stdout) => {
        if (error) return resolve(null)
        const path = stdout
          .split("\n")
          .find((line) => line.startsWith("n/"))
          ?.slice(1)
        resolve(path || null)
      },
    )
  })
}

/** Reads only the cwd owned by the terminal process; unsupported platforms return null. */
export async function readProcessWorkingDirectory(pid: number, signal?: AbortSignal) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return null
  signal?.throwIfAborted()
  if (process.platform === "linux") {
    try {
      const path = await readlink(`/proc/${pid}/cwd`)
      signal?.throwIfAborted()
      return path.startsWith("/") ? path : null
    } catch {
      return null
    }
  }
  if (process.platform === "darwin") return readMacProcessWorkingDirectory(pid, signal)
  return null
}
