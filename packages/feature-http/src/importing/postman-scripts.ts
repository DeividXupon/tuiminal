import { record } from "./shared"
export function postmanScripts(item: Record<string, unknown>, source: Record<string, unknown>) {
  const events = item.event ?? source.event
  const script = (phase: string) =>
    (Array.isArray(events) ? events : [])
      .filter((e) => record(e)?.listen === phase && record(e)?.disabled !== true)
      .map((e) => record(record(e)?.script)?.exec)
      .map((exec) =>
        Array.isArray(exec)
          ? exec.filter((line) => typeof line === "string").join("\n")
          : typeof exec === "string"
            ? exec
            : "",
      )
      .join("\n")
  return { preRequest: script("prerequest"), postResponse: script("test") }
}
