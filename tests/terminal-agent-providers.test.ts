import "./setup"
import { expect, test } from "bun:test"
import {
  AGENT_PROVIDERS,
  agentProviderHasCapability,
} from "../packages/feature-terminal/src/model/agent-provider"
import { agentProviderAdapter } from "../packages/feature-terminal/src/services/agent-provider-adapters"

test("first-party agent providers have unique identities and only available adapters", () => {
  expect(new Set(AGENT_PROVIDERS.map((provider) => provider.id)).size).toBe(AGENT_PROVIDERS.length)
  expect(
    AGENT_PROVIDERS.map((provider) => [
      provider.id,
      provider.availability,
      Boolean(agentProviderAdapter(provider.id)),
    ]),
  ).toEqual([
    ["codex", "available", true],
    ["claude", "available", true],
    ["opencode", "available", true],
  ])
})

test("provider capabilities expose all structured first-party integrations", () => {
  expect(agentProviderHasCapability("codex", "message-history")).toBe(true)
  expect(agentProviderHasCapability("codex", "remote-launch")).toBe(true)
  expect(agentProviderHasCapability("claude", "local-launch")).toBe(true)
  expect(agentProviderHasCapability("claude", "message-history")).toBe(true)
  expect(agentProviderHasCapability("claude", "remote-launch")).toBe(true)
  expect(agentProviderHasCapability("claude", "project-sync")).toBe(true)
  expect(agentProviderHasCapability("opencode", "project-sync")).toBe(true)
  expect(agentProviderHasCapability("opencode", "message-history")).toBe(true)
  expect(agentProviderHasCapability("opencode", "remote-launch")).toBe(true)
})

test("the Claude adapter creates hook-observed local and remote launch metadata", () => {
  const adapter = agentProviderAdapter("claude")
  if (!adapter) throw new Error("Claude adapter unavailable")
  expect(adapter.createCommand({ kind: "local" }, "/workspace", "claude-local")).toMatchObject({
    workingDirectory: "/workspace",
    agentLaunch: {
      providerId: "claude",
      transport: "hooks",
      resumeThreadId: "claude-local",
    },
  })
  expect(
    adapter.createCommand(
      { kind: "remote", profile: { id: "work", name: "Work", host: "work" } },
      "/srv/project",
      "claude-remote",
    ),
  ).toMatchObject({
    workingDirectory: "/srv/project",
    agentLaunch: {
      providerId: "claude",
      transport: "hooks",
      resumeThreadId: "claude-remote",
      remote: { profile: { id: "work" }, workingDirectory: "/srv/project" },
    },
  })
})

test("the OpenCode adapter creates resumable local and remote launch metadata", () => {
  const adapter = agentProviderAdapter("opencode")
  if (!adapter) throw new Error("OpenCode adapter unavailable")
  expect(adapter.createCommand({ kind: "local" }, "/workspace", "ses_local")).toMatchObject({
    workingDirectory: "/workspace",
    agentLaunch: {
      providerId: "opencode",
      transport: "app-server",
      resumeThreadId: "ses_local",
    },
  })
  expect(
    adapter.createCommand(
      { kind: "remote", profile: { id: "work", name: "Work", host: "work" } },
      "/srv/project",
      "ses_remote",
    ),
  ).toMatchObject({
    workingDirectory: "/srv/project",
    agentLaunch: {
      providerId: "opencode",
      transport: "app-server",
      resumeThreadId: "ses_remote",
      remote: { profile: { id: "work" }, workingDirectory: "/srv/project" },
    },
  })
})

test("the Codex adapter creates local and remote provider launch metadata", () => {
  const adapter = agentProviderAdapter("codex")
  if (!adapter) throw new Error("Codex adapter unavailable")
  expect(adapter.createCommand({ kind: "local" }, "/workspace")).toMatchObject({
    workingDirectory: "/workspace",
    agentLaunch: { providerId: "codex", transport: "app-server" },
  })
  expect(
    adapter.createCommand(
      {
        kind: "remote",
        profile: { id: "work", name: "Work", host: "work" },
      },
      "/srv/project",
    ),
  ).toMatchObject({
    workingDirectory: "/srv/project",
    agentLaunch: {
      providerId: "codex",
      transport: "app-server",
      remote: {
        profile: { id: "work" },
        workingDirectory: "/srv/project",
      },
    },
  })
})
