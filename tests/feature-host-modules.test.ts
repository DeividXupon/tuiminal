import { expect, test } from "bun:test"

test("every core module imported by a feature payload is shared by the host", async () => {
  const host = await Bun.file("apps/cli/src/features/host-modules.ts").text()
  const imported = new Set<string>()
  for (const file of new Bun.Glob("packages/feature-*/src/**/*.{ts,tsx}").scanSync()) {
    const source = await Bun.file(file).text()
    for (const match of source.matchAll(/from "(@xupon\/tuiminal-core\/[^"]+)"/g))
      if (match[1]) imported.add(match[1])
  }
  expect(imported.size).toBeGreaterThan(0)
  const missing = [...imported].filter((name) => !host.includes(`"${name}": shared`)).sort()
  expect(missing).toEqual([])
})
