export type HttpParameterSection = "query" | "path"

export function httpParameterSectionForKey(key: {
  name: string
  ctrl?: boolean | undefined
  shift?: boolean | undefined
  option?: boolean | undefined
  meta?: boolean | undefined
}): HttpParameterSection | null {
  if (key.ctrl || key.shift || key.option || key.meta) return null
  if (key.name === "j" || key.name === "down") return "path"
  if (key.name === "k" || key.name === "up") return "query"
  return null
}
