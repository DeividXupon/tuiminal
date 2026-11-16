import { describe, expect, test } from "bun:test"
import { configurationArguments } from "../apps/cli/src/config-arguments"

describe("configuration CLI argument", () => {
  test("extracts either syntax without consuming project or feature flags", () => {
    expect(
      configurationArguments(["--config", "some path/config.yml", "runner", "../project"]),
    ).toEqual({ configPath: "some path/config.yml", args: ["runner", "../project"] })
    expect(
      configurationArguments(["http", "run", "file.http", "--config=custom.yml", "--env", "dev"]),
    ).toEqual({ configPath: "custom.yml", args: ["http", "run", "file.http", "--env", "dev"] })
    expect(configurationArguments(["--help"])).toEqual({ configPath: undefined, args: ["--help"] })
  })

  test.each([
    { args: ["--config"] },
    { args: ["--config="] },
    { args: ["--config", "--help"] },
    { args: ["--config=a", "--config=b"] },
  ])("rejects missing and ambiguous configuration paths: %j", ({ args }) => {
    expect(() => configurationArguments(args)).toThrow("--config")
  })
})
