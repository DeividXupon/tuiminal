import { COLORS, getUiSettings } from "@xupon/tuiminal-core/settings/theme"

const DARK_METHOD_COLORS: Record<string, string> = {
  GET: "#9DDEB9",
  POST: "#FFE083",
  PUT: "#9FC0FA",
  PATCH: "#C1A9EE",
  DELETE: "#F9A99A",
  HEAD: "#9DDEB9",
  OPTIONS: "#EB79B7",
}

const LIGHT_METHOD_COLORS: Record<string, string> = {
  GET: "#087A55",
  POST: "#9B6100",
  PUT: "#145FA8",
  PATCH: "#714BB2",
  DELETE: "#B42430",
  HEAD: "#087A55",
  OPTIONS: "#A53B76",
}

export function httpMethodColor(method: string) {
  const palette = getUiSettings().colorMode === "light" ? LIGHT_METHOD_COLORS : DARK_METHOD_COLORS
  return palette[method.toUpperCase()] ?? COLORS.text
}
