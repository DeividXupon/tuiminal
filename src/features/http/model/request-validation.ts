export const HTTP_METHOD_TOKEN_PATTERN = /^[!#$%&'*+.^_`|~\dA-Z-]+$/i

export function isValidHttpMethod(value: string) {
  return HTTP_METHOD_TOKEN_PATTERN.test(value.trim())
}
