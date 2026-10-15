import { expect, test } from "bun:test"
import { displayWidth } from "../packages/core/src/i18n/index"
import {
  agentTitleWindowIndex,
  agentTitleWindows,
} from "../packages/feature-terminal/src/rendering/agent-title-marquee"

test("task titles hold for two seconds, scroll, hold for one second and jump back", () => {
  const windows = agentTitleWindows("abcdef", 3)
  const at = (tick: number) => windows[agentTitleWindowIndex(windows.length, tick)]
  expect(windows).toEqual(["abc", "bcd", "cde", "def"])
  expect(at(0)).toBe("abc")
  expect(at(19)).toBe("abc")
  expect(at(20)).toBe("bcd")
  expect(at(21)).toBe("cde")
  expect(at(22)).toBe("def")
  expect(at(31)).toBe("def")
  expect(at(32)).toBe("abc")
  expect(at(51)).toBe("abc")
  expect(at(52)).toBe("bcd")
})

test("task title windows preserve accents, joined emoji and wide characters", () => {
  const windows = agentTitleWindows("Ae\u0301👩‍💻界Z", 4)
  expect(windows).toEqual(["Ae\u0301👩‍💻", "e\u0301👩‍💻", "👩‍💻界", "界Z"])
  expect(windows.every((window) => displayWidth(window) <= 4)).toBe(true)
  expect(agentTitleWindows("Fits", 4)).toEqual(["Fits"])
  expect(agentTitleWindowIndex(1, 100)).toBe(0)
  expect(agentTitleWindows("", 4)).toEqual([""])
  expect(agentTitleWindows("Hidden", 0)).toEqual([""])
})
