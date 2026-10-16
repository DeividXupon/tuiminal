import { createHash } from "node:crypto"
import { mkdirSync } from "node:fs"
import { dirname, resolve } from "node:path"
import sources from "./syntax-sources.json"

// Explicit maintenance command; application startup and builds never download grammars.
const root = resolve(import.meta.dir, "../packages/core/src/syntax")
for (const source of sources) {
  const response = await fetch(source.url)
  if (!response.ok) throw new Error(`Unable to download ${source.name}: ${response.status}`)
  const bytes = await response.arrayBuffer()
  const integrity = `sha512-${createHash("sha512").update(Buffer.from(bytes)).digest("base64")}`
  if (integrity !== source.integrity) throw new Error(`Integrity mismatch: ${source.name}`)
  const archive = source.url.endsWith(".wasm") ? null : await new Bun.Archive(bytes).files()
  for (const [destination, origin] of Object.entries(source.files)) {
    const file = archive ? archive.get(origin) : bytes
    if (!file) throw new Error(`Missing ${origin} in ${source.name}`)
    const path = resolve(root, "assets", destination)
    mkdirSync(dirname(path), { recursive: true })
    // Keep vendored text free of extra trailing blank lines.
    const content = destination.endsWith(".wasm")
      ? file
      : (await new Response(file).text()).replace(/\n+$/, "\n")
    await Bun.write(path, content)
  }
  console.log(`Updated syntax assets: ${source.name}@${source.version}`)
}
