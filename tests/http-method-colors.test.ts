import "./setup"
import { afterEach, expect, test } from "bun:test"
import { getUiSettings, updateUiSettings } from "../packages/core/src/settings/theme"
import { httpMethodColor } from "../packages/feature-http/src/ui/http-method-colors"

const original = getUiSettings()
afterEach(() => updateUiSettings(original))

test("matches Postman method colors in dark mode and uses readable variants in light mode", () => {
  updateUiSettings({ colorMode: "dark" })
  expect(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].map(httpMethodColor)).toEqual(
    ["#9DDEB9", "#FFE083", "#9FC0FA", "#C1A9EE", "#F9A99A", "#9DDEB9", "#EB79B7"],
  )
  updateUiSettings({ colorMode: "light" })
  expect(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].map(httpMethodColor)).toEqual(
    ["#087A55", "#9B6100", "#145FA8", "#714BB2", "#B42430", "#087A55", "#A53B76"],
  )
})
