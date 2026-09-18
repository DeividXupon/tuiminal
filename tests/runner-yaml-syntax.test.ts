import { expect, test } from "bun:test"
import { runnerYamlSyntax } from "../packages/feature-runner/src/model/yaml-syntax"
import { RUNNER_YAML_GUIDE } from "../packages/feature-runner/src/model/yaml-guide"
import { validateRunnerYaml } from "../packages/feature-runner/src/model/configuration-yaml"
import { setLanguage, translateUi } from "../packages/core/src/i18n/index"

function tokens(source: string) {
  return runnerYamlSyntax(source).map((span) => ({
    text: source.slice(span.start, span.end),
    group: span.group,
  }))
}

test("YAML colors distinguish keys, scalars, flow collections and literal blocks", () => {
  const result = tokens(`commands:
  api:
    command: |-
      echo true # literal
      echo 123
    env: { PORT: 3000, ENABLED: true, LABEL: "# false" }
    health: null # comment
    dependsOn: [build]
    'true': 'false'
`)
  for (const [text, group] of [
    ["commands", "property"],
    ["PORT", "property"],
    ["3000", "number"],
    ["true", "constant"],
    ['"# false"', "string"],
    ["null", "constant"],
    ["# comment", "comment"],
    ["build", "string"],
    ["'true'", "property"],
    ["'false'", "string"],
    ["|-", "punctuation"],
    ["      echo true # literal\n      echo 123\n", "string"],
  ] as const)
    expect(result).toContainEqual({ text, group })
  expect(result.filter((token) => token.group === "comment")).toHaveLength(1)
})

test("YAML colors retain Unicode offsets, anchors, tags and incomplete input", () => {
  const source = '"名🦊": &name "café é"\nnext: *name\nvalue: !!str 0xFF\nunfinished: "open # true'
  const result = tokens(source)
  for (const [text, group] of [
    ['"名🦊"', "property"],
    ["&name", "type"],
    ['"café é"', "string"],
    ["*name", "type"],
    ["!!str", "type"],
    ['"open # true', "string"],
  ] as const)
    expect(result).toContainEqual({ text, group })
  for (const source of ["", "[", "commands:\n  api:\n    env: {PORT:", "key: ]\nother: true"]) {
    expect(() => runnerYamlSyntax(source)).not.toThrow()
    for (const span of runnerYamlSyntax(source)) {
      expect(span.start).toBeGreaterThanOrEqual(0)
      expect(span.end).toBeLessThanOrEqual(source.length)
    }
  }
})

test("every tutorial example validates and every supported field is explained", () => {
  for (const topic of RUNNER_YAML_GUIDE)
    expect(() => validateRunnerYaml(topic.example, [], [])).not.toThrow()
  const fields = new Set(
    RUNNER_YAML_GUIDE.flatMap((topic) => topic.fields.flatMap((field) => field.names)),
  )
  for (const key of [
    "commands",
    "flows",
    "profiles",
    "label",
    "description",
    "command",
    "cwd",
    "env",
    "envFile",
    "profile",
    "interactive",
    "restart",
    "restartPolicy",
    "restartDelayMs",
    "maxRestarts",
    "persistLogs",
    "health",
    "healthCheck",
    "type",
    "host",
    "port",
    "pattern",
    "url",
    "timeoutMs",
    "dependsOn",
    "commandId",
    "condition",
    "autostart",
    "stages",
    "commandIds",
    "waitFor",
  ])
    expect(fields.has(key)).toBe(true)
})

test("tutorial prose is translated in every supported non-source language", () => {
  try {
    for (const language of ["en", "es", "ja", "zh-CN", "ko"] as const) {
      setLanguage(language)
      for (const topic of RUNNER_YAML_GUIDE) {
        expect(translateUi(topic.title)).not.toBe(topic.title)
        for (const field of topic.fields) expect(translateUi(field.help)).not.toBe(field.help)
      }
    }
  } finally {
    setLanguage("pt-BR")
  }
})
