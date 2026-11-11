import { HTTP_METHODS } from "./types"
export function nextHttpMethod(method: string, direction: -1 | 1): (typeof HTTP_METHODS)[number] {
  const current = HTTP_METHODS.indexOf(method.toUpperCase() as (typeof HTTP_METHODS)[number])
  if (current < 0) return direction > 0 ? "GET" : "OPTIONS"
  return HTTP_METHODS[(current + direction + HTTP_METHODS.length) % HTTP_METHODS.length] ?? "GET"
}
