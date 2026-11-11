import "./setup"
import { afterEach, expect, test } from "bun:test"
import { act, useRef } from "react"
import { testRender } from "@opentui/react/test-utils"
import type { TestRendererSetup } from "@opentui/core/testing"
import type { HttpDocumentRefs } from "../../packages/feature-http/src/runtime"
import { useHttpWorkspaceState } from "../../packages/feature-http/src/hooks/use-http-workspace-state"
import { createScratchRequest } from "../../packages/feature-http/src/model/workspace"

let tui: TestRendererSetup | undefined
let workspace: ReturnType<typeof useHttpWorkspaceState>
const controllers = new Map<string, AbortController>()
function Harness() {
  workspace = useHttpWorkspaceState(
    useRef(new Map<string, HttpDocumentRefs>()),
    useRef(controllers),
  )
  return <text content={workspace.state.activeDocumentId} />
}
afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  controllers.clear()
})
async function mount() {
  tui = await testRender(<Harness />, { width: 60, height: 12 })
  await act(async () => {
    for (let i = 1; i <= 6; i++)
      workspace.dispatch({ type: "add-document", request: createScratchRequest(String(i)) })
  })
}
test("replacing the last tab aborts only that tab's running transport", async () => {
  await mount()
  const retained = new AbortController()
  const replaced = new AbortController()
  controllers.set("retained", retained)
  controllers.set("replaced", replaced)
  await act(async () => {
    workspace.dispatch({
      type: "start-execution",
      documentId: "2",
      executionId: "retained",
      requestRevision: 0,
    })
    workspace.dispatch({
      type: "start-execution",
      documentId: "6",
      executionId: "replaced",
      requestRevision: 0,
    })
    workspace.dispatch({ type: "add-document", request: createScratchRequest("7") })
  })
  expect(workspace.state.documents).toHaveLength(6)
  expect(workspace.state.activeDocumentId).toBe("7")
  expect(replaced.signal.aborted).toBe(true)
  expect(retained.signal.aborted).toBe(false)
})
test("import completion cannot dismiss the pending discard confirmation", async () => {
  await mount()
  await act(async () => {
    workspace.dispatch({ type: "update-request", documentId: "6", patch: { name: "Unsaved" } })
    workspace.dispatch({ type: "add-document", request: createScratchRequest("imported") })
    workspace.dispatch({ type: "close-overlay" })
  })
  expect(workspace.state.overlay).toBe("discard-document")
  expect(workspace.replacingDocumentId).toBe("6")
  await act(async () => {
    workspace.dispatch({ type: "close-document", documentId: "6" })
    workspace.dispatch({ type: "close-overlay" })
  })
  expect(workspace.state.overlay).toBeNull()
  expect(workspace.state.documents).toHaveLength(6)
  expect(workspace.state.activeDocumentId).toBe("imported")
})
