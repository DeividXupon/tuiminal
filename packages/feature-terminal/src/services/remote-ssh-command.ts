import type { TerminalRemoteCodexProfile } from "@xupon/tuiminal-core/settings/theme"
import { runBoundedCommand } from "./bounded-command"

type AutomatedSshOptions = {
  tty?: boolean
  forwarding?: "none" | "tunnel"
  verbose?: boolean
  connectTimeoutSeconds?: number
}

function automationOptions(
  connectTimeoutSeconds = 10,
  sessionType: "default" | "none" = "default",
) {
  return [
    "-o",
    "BatchMode=yes",
    "-o",
    `ConnectTimeout=${connectTimeoutSeconds}`,
    "-o",
    "ConnectionAttempts=1",
    "-o",
    "ServerAliveInterval=30",
    "-o",
    "ServerAliveCountMax=3",
    "-o",
    "RemoteCommand=none",
    "-o",
    `SessionType=${sessionType}`,
    "-o",
    "StdinNull=no",
    "-o",
    "ForkAfterAuthentication=no",
    "-o",
    "PermitLocalCommand=no",
    "-o",
    "ControlMaster=no",
    "-o",
    "ControlPersist=no",
    "-S",
    "none",
  ]
}

/**
 * Keeps automated connections independent from alias-owned commands, masters and
 * side effects while leaving host, user, identity and proxy resolution to OpenSSH.
 */
export function automatedSshPrefix(
  profile: Pick<TerminalRemoteCodexProfile, "host">,
  options: AutomatedSshOptions = {},
) {
  return [
    "ssh",
    ...(options.verbose ? ["-v"] : []),
    options.tty ? "-tt" : "-T",
    ...automationOptions(
      options.connectTimeoutSeconds,
      options.forwarding === "tunnel" ? "none" : "default",
    ),
    "-o",
    options.forwarding === "tunnel" ? "ClearAllForwardings=no" : "ClearAllForwardings=yes",
    profile.host,
  ]
}

export function remotePosixShellCommand(script: string) {
  return `exec /bin/sh -c '${script.replaceAll("'", `'"'"'`)}'`
}

export function remoteSshEffectiveConfigurationCommand(
  profile: Pick<TerminalRemoteCodexProfile, "host">,
) {
  return [
    "ssh",
    "-G",
    ...automationOptions(10, "none"),
    "-o",
    "ClearAllForwardings=no",
    profile.host,
  ]
}

export function sshConfigurationHasForwarding(value: string) {
  return value
    .split(/\r?\n/u)
    .some((line) => /^\s*(?:dynamicforward|localforward|remoteforward)\s+/iu.test(line))
}

/** A tunnel cannot selectively clear alias forwards without also clearing its own. */
export async function assertRemoteSshTunnelConfiguration(
  profile: Pick<TerminalRemoteCodexProfile, "host">,
  signal: AbortSignal,
) {
  const timeout = AbortSignal.timeout(5_000)
  let result: Awaited<ReturnType<typeof runBoundedCommand>>
  try {
    result = await runBoundedCommand(
      remoteSshEffectiveConfigurationCommand(profile),
      AbortSignal.any([signal, timeout]),
      () => {
        throw new Error("O cliente SSH local não está disponível.")
      },
    )
  } catch (error) {
    if (signal.aborted) signal.throwIfAborted()
    if (timeout.aborted)
      throw new Error("A validação da configuração do alias SSH excedeu o tempo limite.")
    throw error
  }
  if (result.exitCode !== 0)
    throw new Error("Não foi possível validar a configuração do alias SSH selecionado.")
  if (sshConfigurationHasForwarding(result.stdout))
    throw new Error(
      "O alias SSH selecionado já define encaminhamentos de porta. Use um alias dedicado sem DynamicForward, LocalForward ou RemoteForward.",
    )
}
