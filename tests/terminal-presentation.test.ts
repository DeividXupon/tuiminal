import { describe, expect, test } from "bun:test"
import { terminalFooterLayout } from "../src/features/terminal/rendering/presentation"
import { displayWidth, translateUi } from "../src/shared/i18n"

describe("Free Terminal presentation", () => {
  test("reserves a complete footer hint at common terminal widths", () => {
    for (const width of [58, 78, 118, 158]) {
      const layout = terminalFooterLayout(width)
      expect(layout.noticeWidth + 1 + layout.helpWidth).toBeLessThanOrEqual(width)
      expect(displayWidth(translateUi(layout.help))).toBe(layout.helpWidth)
      expect(layout.help).toContain("[G]")
    }
  })
})
