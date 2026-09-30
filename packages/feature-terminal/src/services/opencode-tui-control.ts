import { AgentOutput } from "../model/agent-output"

export function createOpenCodeTuiControl(options: { onTitle: (title: string) => void }) {
  const output = new AgentOutput()
  let titleRevision = output.titleRevision
  return {
    observeData(data: Uint8Array) {
      output.write(data)
      if (output.titleRevision === titleRevision) return
      titleRevision = output.titleRevision
      options.onTitle(output.title)
    },
  }
}
