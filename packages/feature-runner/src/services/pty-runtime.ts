export type BunTerminalLike = {
  write(data: string | Uint8Array): void
  close(): void
}

export type BunSubprocessLike = {
  pid: number
  terminal?: BunTerminalLike
  exited: Promise<number>
  exitCode: number | null
  signalCode: string | null
  kill(signal?: string | number): void
}

export type BunRuntimeLike = {
  spawn(
    command: string[],
    options: {
      cwd: string
      env: Record<string, string>
      terminal: {
        cols: number
        rows: number
        name: string
        data: (terminal: BunTerminalLike, data: Uint8Array) => void
      }
    },
  ): BunSubprocessLike
}

export const bunRuntime = (globalThis as typeof globalThis & { Bun?: BunRuntimeLike }).Bun
