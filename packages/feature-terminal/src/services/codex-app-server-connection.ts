import { createServer } from "node:net"

export async function unusedCodexLoopbackPort() {
  const server = createServer()
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", resolve)
  })
  const address = server.address()
  const port = address && typeof address !== "string" ? address.port : 0
  await new Promise<void>((resolve) => server.close(() => resolve()))
  if (!port) throw new Error("Não foi possível reservar uma porta para o Codex app-server.")
  return port
}

export async function waitForCodexAppServer(
  url: string,
  server: { exitCode: number | null },
  signal: AbortSignal,
) {
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    signal.throwIfAborted()
    if (server.exitCode !== null)
      throw new Error("O Codex app-server encerrou durante a inicialização.")
    const status = await fetch(`${url.replace("ws:", "http:")}/readyz`, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(500)]),
    }).then(
      (response) => response.ok,
      () => false,
    )
    if (status) return
    await Bun.sleep(50)
  }
  throw new Error("O Codex app-server não ficou pronto para a interface do Codex.")
}
