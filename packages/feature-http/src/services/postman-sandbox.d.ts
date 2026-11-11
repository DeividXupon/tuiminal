declare module "postman-sandbox/lib/postman-sandbox" {
  export type SandboxAssertion = {
    name: string
    passed: boolean
    skipped?: boolean
    error?: { message?: string }
  }
  export default class PostmanSandbox {
    initialize(
      init: Record<string, unknown>,
      options: Record<string, unknown>,
      callback: (error: Error | null, context: PostmanSandbox) => void,
    ): void
    on(
      event: "execution.assertion",
      listener: (cursor: unknown, tests: SandboxAssertion[]) => void,
    ): void
    on(event: "error", listener: (error: Error) => void): void
    execute(
      source: unknown,
      options: Record<string, unknown>,
      callback: (error: Error | null, result: import("./script-sandbox").ScriptExecution) => void,
    ): void
    dispose(): void
  }
}
declare module "postman-sandbox/.cache/bootcode" {
  export default function bootcode(callback: (error: Error | null, code: string) => void): void
}
