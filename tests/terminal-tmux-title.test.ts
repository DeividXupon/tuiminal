import { expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import {
  parseTmuxScreen,
  TMUX_SCREEN_FORMAT,
} from "../packages/feature-terminal/src/rendering/tmux-screen"
import { runTmux } from "../packages/feature-terminal/src/services/tmux-command"

test.skipIf(process.platform === "win32" || !Bun.which("tmux"))(
  "native tmux title formatting preserves metadata boundaries and literal format text",
  async () => {
    const prefix = ["-L", `tuiminal-title-test-${randomUUID()}`, "-f", "/dev/null"]
    try {
      const pane = (
        await runTmux([
          ...prefix,
          "new-session",
          "-d",
          "-s",
          "fixture",
          "-P",
          "-F",
          "#{pane_id}",
          "sleep 30",
        ])
      ).trim()
      await runTmux([...prefix, "select-pane", "-t", pane, "-T", "OC | Fix login now ##{pane_pid}"])
      const result = parseTmuxScreen(
        await runTmux([
          ...prefix,
          "display-message",
          "-p",
          "-t",
          pane,
          TMUX_SCREEN_FORMAT,
          ";",
          "capture-pane",
          "-p",
          "-e",
          "-N",
          "-t",
          pane,
        ]),
      )
      expect(result.title).toBe("OC | Fix login now #{pane_pid}")
      expect(result.pid).toBeGreaterThan(0)
    } finally {
      await runTmux([...prefix, "kill-server"]).catch(() => {})
    }
  },
)
