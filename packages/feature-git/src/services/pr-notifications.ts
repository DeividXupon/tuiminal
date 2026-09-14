import { execFile } from "node:child_process"

function execute(executable: string, args: string[]) {
  return new Promise<boolean>((resolve) => {
    execFile(executable, args, { timeout: 5_000, windowsHide: true }, (error) => resolve(!error))
  })
}

export type PullRequestNotificationCommand = { executable: string; args: string[] }

export function pullRequestNotificationCommand({
  title,
  message,
  discreet,
  platform = process.platform,
}: {
  title: string
  message: string
  discreet: boolean
  platform?: NodeJS.Platform
}): PullRequestNotificationCommand | null {
  const safeTitle = discreet ? "Tuiminal" : title
  const safeMessage = discreet ? "O acompanhamento de CI foi concluído." : message
  if (platform === "darwin") {
    return {
      executable: "osascript",
      args: [
        "-e",
        "on run argv\ndisplay notification (item 2 of argv) with title (item 1 of argv)\nend run",
        "--",
        safeTitle,
        safeMessage,
      ],
    }
  }
  if (platform === "linux") {
    return {
      executable: "notify-send",
      args: ["--app-name", "Tuiminal", safeTitle, safeMessage],
    }
  }
  return null
}

export async function notifyPullRequestChecks({
  title,
  message,
  discreet,
}: {
  title: string
  message: string
  discreet: boolean
}) {
  const command = pullRequestNotificationCommand({ title, message, discreet })
  return command ? execute(command.executable, command.args) : false
}
