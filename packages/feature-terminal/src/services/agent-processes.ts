import { execFile } from "node:child_process"
import {
  parsePosixProcesses,
  parseWindowsProcesses,
  type ProcessIdentity,
} from "../model/agent-detection"

/** Read-only snapshot. Cancellation owns only this short-lived inspection process. */
export function readTerminalProcesses(signal: AbortSignal): Promise<ProcessIdentity[]> {
  const windows = process.platform === "win32"
  const command = windows ? "powershell.exe" : "ps"
  const args = windows
    ? [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress",
      ]
    : ["-axww", "-o", "pid=,ppid=,stat=,comm=,args="]
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      { encoding: "utf8", timeout: 2500, maxBuffer: 4 * 1024 * 1024, windowsHide: true, signal },
      (error, stdout) => {
        if (error) return reject(error)
        try {
          resolve(windows ? parseWindowsProcesses(stdout) : parsePosixProcesses(stdout))
        } catch (error) {
          reject(error)
        }
      },
    )
  })
}
