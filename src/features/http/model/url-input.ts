export function httpUrlWithProtocol(source: string) {
  const value = /^[a-z][a-z\d+.-]*:\/\//i.test(source) ? source : `http://${source}`
  // URL parsing removes these characters before identifying authority/path boundaries.
  return value.replace(/[\t\n\r]/g, "")
}
