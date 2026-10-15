import { randomUUID } from "node:crypto"
import { tmuxLiteralArgument, type TmuxPaneTarget } from "../model/tmux"
import { registerTerminalResource } from "./terminal-resources"
import { runTmux } from "./tmux-command"

async function paste(target: TmuxPaneTarget, text: string, signal: AbortSignal) {
  if (!text) return
  signal.throwIfAborted()
  const prefix = ["-S", target.socket]
  const name = `tuiminal-paste-${randomUUID()}`
  let release = () => {}
  let retired = false
  const stop = async () => {
    if (retired) return
    try {
      // tmux 3.2 delete-buffer falls back to the user's top buffer if a named
      // buffer vanished. Recreate only our UUID name before deleting it.
      await runTmux([
        ...prefix,
        "set-buffer",
        "-b",
        name,
        "--",
        " ",
        ";",
        "delete-buffer",
        "-b",
        name,
      ])
    } catch (error) {
      if (!/no server running|No such file/i.test(String(error))) throw error
    }
    retired = true
    release()
  }
  release = registerTerminalResource({ stop })
  try {
    // Bound individual argv entries; never split a UTF-16 surrogate pair.
    for (let offset = 0; offset < text.length; ) {
      let end = Math.min(text.length, offset + 8192)
      if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1]!)) end--
      await runTmux(
        [
          ...prefix,
          "set-buffer",
          ...(offset ? ["-a"] : []),
          "-b",
          name,
          "--",
          tmuxLiteralArgument(text.slice(offset, end)),
        ],
        signal,
      )
      offset = end
    }
    await runTmux([...prefix, "paste-buffer", "-p", "-r", "-b", name, "-t", target.paneId], signal)
  } finally {
    // Delete only this input's named buffer, even after cancellation. A failed
    // cleanup remains registered so global shutdown can retry it.
    await stop()
  }
}

export async function sendTmuxInput(
  target: TmuxPaneTarget,
  bytes: Uint8Array,
  signal: AbortSignal,
) {
  const text = new TextDecoder().decode(bytes)
  if (text.startsWith("\x1b[200~") && text.endsWith("\x1b[201~")) {
    await paste(target, text.slice(6, -6), signal)
    return
  }
  for (let offset = 0; offset < bytes.length; offset += 1024) {
    signal.throwIfAborted()
    const keys = Array.from(bytes.subarray(offset, offset + 1024), (byte) =>
      byte.toString(16).padStart(2, "0"),
    )
    await runTmux(["-S", target.socket, "send-keys", "-H", "-t", target.paneId, ...keys], signal)
  }
}
