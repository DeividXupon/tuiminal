import "./setup"
import { afterEach, expect, test } from "bun:test"
import { act, useState } from "react"
import { testRender } from "@opentui/react/test-utils"
import type { TestRendererSetup } from "@opentui/core/testing"
import type { ScrollBoxRenderable } from "@opentui/core"
import { writeFileSync } from "node:fs"
import { updateUiSettings } from "../../packages/core/src/settings/theme"
import { HttpCollectionRunnerModal } from "../../packages/feature-http/src/ui/HttpCollectionRunnerModal"

let tui: TestRendererSetup | undefined
let runs = 0
const noop = () => {}
afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  runs = 0
})
async function settle(check: () => boolean) {
  for (let i = 0; i < 100; i++) {
    await act(async () => Bun.sleep(10))
    await tui?.renderOnce()
    if (check()) return
  }
  throw new Error(tui?.captureCharFrame())
}
function node(id: string) {
  const found = tui?.renderer.root.findDescendantById(`http-collection-runner-${id}`)
  if (!found) throw new Error(`Missing ${id}`)
  return found
}
async function key(name: string, shift = false) {
  await act(async () => {
    if (name === "ENTER") tui?.mockInput.pressEnter()
    else tui?.mockInput.pressKey(name, { shift })
    await Bun.sleep(5)
  })
  await tui?.renderOnce()
}
async function click(id: string) {
  await settle(() => true)
  const target = node(id)
  await act(async () => tui?.mockMouse.click(target.screenX + 1, target.screenY))
  await tui?.renderOnce()
}
function Harness({
  width,
  height,
  results = false,
}: {
  width: number
  height: number
  results?: boolean
}) {
  const [dataset, setDataset] = useState("")
  const [target, setTarget] = useState("getUserTrades with a long name [T]")
  const [concurrency, setConcurrency] = useState(6)
  return (
    <HttpCollectionRunnerModal
      targetName={target}
      datasetPath={dataset}
      concurrency={concurrency}
      status={results ? "complete" : "idle"}
      cases={
        results ? Array.from({ length: 40 }, (_, i) => ({ name: `fixture-${i}`, items: [] })) : []
      }
      error=""
      pendingTlsApproval={null}
      terminalWidth={width}
      terminalHeight={height}
      onDatasetPathChange={setDataset}
      onCycleTarget={() => setTarget("Next request")}
      onCycleConcurrency={() => setConcurrency((value) => value + 1)}
      onRun={() => {
        runs++
      }}
      onApproveInsecureTls={noop}
      onClose={noop}
    />
  )
}
function insideFooter() {
  const modal = node("modal"),
    footer = node("footer"),
    run = node("run"),
    content = node("content")
  expect(run.screenY).toBeGreaterThanOrEqual(footer.screenY)
  expect(run.screenY).toBeLessThan(modal.screenY + modal.height - 1)
  expect(run.screenX + run.width).toBeLessThan(modal.screenX + modal.width)
  expect(content.screenY + content.height).toBeLessThanOrEqual(footer.screenY)
}
for (const layout of ["compact", "framed"] as const) {
  test.each([
    [52, 12],
    [52, 16],
    [80, 24],
    [120, 30],
  ])(`runner form and footer fit in ${layout} at %sx%s`, async (width, height) => {
    updateUiSettings({ layout, language: "pt-BR" })
    tui = await testRender(<Harness width={width} height={height} />, { width, height })
    await settle(
      () => tui?.renderer.currentFocusedRenderable?.id === "http-collection-runner-target",
    )
    insideFooter()
    expect(tui.captureCharFrame()).not.toContain("Os resultados aparecerão aqui")
    expect(tui.captureCharFrame()).not.toContain("RESULTADOS")
    expect(tui.captureCharFrame()).toContain("[Ctrl+Enter] Executar")
    writeFileSync(`/tmp/http-runner-${layout}-${width}x${height}.txt`, tui.captureCharFrame())
    await key("TAB")
    expect(tui.renderer.currentFocusedRenderable?.id).toBe("http-collection-runner-concurrency")
    await key("TAB")
    expect(tui.renderer.currentFocusedRenderable?.id).toBe("http-collection-runner-dataset")
    expect(node("dataset").screenY).toBeLessThan(node("footer").screenY)
    expect(node("dataset").screenY).toBeGreaterThanOrEqual(node("content").screenY)
    await act(async () => tui?.mockInput.typeText("tcd.json"))
    await key("ENTER")
    expect(runs).toBe(0)
    expect(tui.renderer.currentFocusedRenderable?.id).toBe("http-collection-runner-run")
    await click("run")
    expect(runs).toBe(1)
    await key("TAB", true)
    expect(tui.renderer.currentFocusedRenderable?.id).toBe("http-collection-runner-dataset")
    insideFooter()
  })
}
test("long runner results scroll above the fixed execution button", async () => {
  tui = await testRender(<Harness width={52} height={16} results />, { width: 52, height: 16 })
  await settle(() => true)
  await act(async () => (node("content") as ScrollBoxRenderable).scrollTo(1000))
  await settle(() => tui?.captureCharFrame().includes("fixture-39") ?? false)
  insideFooter()
  expect(tui.captureCharFrame()).toContain("CONCLUÍDO")
  expect(tui.captureCharFrame()).toContain("[Ctrl+Enter] Executar")
})

test("errors and TLS approval remain reachable without covering the footer at 52x12", async () => {
  let approvals = 0
  tui = await testRender(
    <HttpCollectionRunnerModal
      targetName="getUserTrades"
      datasetPath="data.json"
      concurrency={6}
      status="idle"
      cases={[]}
      error="A long validation error that must wrap inside the scroll area without replacing the footer."
      pendingTlsApproval={{ key: "fixture", target: "https://example.test", environmentName: null }}
      terminalWidth={52}
      terminalHeight={12}
      onDatasetPathChange={noop}
      onCycleTarget={noop}
      onCycleConcurrency={noop}
      onRun={noop}
      onApproveInsecureTls={() => {
        approvals++
      }}
      onClose={noop}
    />,
    { width: 52, height: 12 },
  )
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-collection-runner-target")
  await key("TAB")
  await key("TAB")
  await key("TAB")
  expect(tui.renderer.currentFocusedRenderable?.id).toBe("http-collection-runner-approve-tls")
  expect(node("approve-tls").screenY).toBeLessThan(node("footer").screenY)
  expect(node("approve-tls").screenY).toBeGreaterThanOrEqual(node("content").screenY)
  await click("approve-tls")
  expect(approvals).toBe(1)
  insideFooter()
})
