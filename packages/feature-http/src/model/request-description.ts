export function parseHttpDescription(value: string): string | null {
  try {
    const parsed: unknown = JSON.parse(value)
    return typeof parsed === "string" ? parsed : null
  } catch {
    return null
  }
}

export function httpRequestDescription(values: Array<string | null>) {
  const source = values.find((value) => value !== null)
  const description = source === undefined ? null : parseHttpDescription(source)
  return description === null ? {} : { description }
}
