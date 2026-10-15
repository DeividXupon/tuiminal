import type { RemoteServerProfile } from "./sessions"

export type AgentProjectTarget =
  | { kind: "local" }
  | { kind: "remote"; profile: RemoteServerProfile }
export type ProjectDirectory = { path: string; directories: string[]; truncated: boolean }
