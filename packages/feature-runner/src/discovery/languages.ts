import { readdir } from "node:fs/promises"
import { resolve } from "node:path"

import type { RunnerCommand } from "../model/types"
import { fileExists, createCommand, readText } from "./shared"

export async function discoverGoCommands(root: string) {
  if (!(await fileExists(resolve(root, "go.mod")))) return []
  return [
    createCommand("go", "run", "go run", "Executar o módulo Go", "go", ["run", "."]),
    createCommand("go", "test", "go test", "Executar todos os testes Go", "go", ["test", "./..."]),
    createCommand("go", "vet", "go vet", "Analisar problemas comuns no código Go", "go", [
      "vet",
      "./...",
    ]),
    createCommand("go", "build", "go build", "Compilar todos os pacotes Go", "go", [
      "build",
      "./...",
    ]),
  ]
}

export async function discoverRustCommands(root: string) {
  if (!(await fileExists(resolve(root, "Cargo.toml")))) return []
  return [
    createCommand("rust", "run", "cargo run", "Executar o projeto Rust", "cargo", ["run"]),
    createCommand("rust", "test", "cargo test", "Executar os testes Rust", "cargo", ["test"]),
    createCommand(
      "rust",
      "check",
      "cargo check",
      "Verificar o projeto sem gerar binário",
      "cargo",
      ["check"],
    ),
    createCommand("rust", "clippy", "cargo clippy", "Executar o linter Clippy", "cargo", [
      "clippy",
    ]),
    createCommand("rust", "build", "cargo build", "Compilar o projeto Rust", "cargo", ["build"]),
  ]
}

export async function discoverRubyCommands(root: string) {
  if (!(await fileExists(resolve(root, "Gemfile")))) return []
  const commands: RunnerCommand[] = []
  if (await fileExists(resolve(root, "bin/rails"))) {
    commands.push(
      createCommand(
        "ruby",
        "rails:server",
        "rails server",
        "Iniciar o servidor Rails",
        "bin/rails",
        ["server"],
      ),
      createCommand("ruby", "rails:test", "rails test", "Executar os testes Rails", "bin/rails", [
        "test",
      ]),
      createCommand("ruby", "rails:routes", "rails routes", "Listar as rotas Rails", "bin/rails", [
        "routes",
      ]),
    )
  }
  if ((await fileExists(resolve(root, ".rspec"))) || (await fileExists(resolve(root, "spec")))) {
    commands.push(
      createCommand("ruby", "rspec", "rspec", "Executar a suíte RSpec", "bundle", [
        "exec",
        "rspec",
      ]),
    )
  }
  if (await fileExists(resolve(root, "Rakefile"))) {
    commands.push(
      createCommand(
        "ruby",
        "rake:test",
        "rake test",
        "Executar a task de testes do Rake",
        "bundle",
        ["exec", "rake", "test"],
      ),
    )
  }
  return commands
}

export async function discoverJavaCommands(root: string) {
  const pom = await readText(resolve(root, "pom.xml"))
  if (pom) {
    const program = (await fileExists(resolve(root, "mvnw"))) ? "./mvnw" : "mvn"
    const commands = [
      createCommand("java", "maven:test", "maven test", "Executar os testes Maven", program, [
        "test",
      ]),
      createCommand(
        "java",
        "maven:package",
        "maven package",
        "Compilar e empacotar o projeto Maven",
        program,
        ["package"],
      ),
    ]
    if (pom.includes("spring-boot")) {
      commands.unshift(
        createCommand(
          "java",
          "spring:run",
          "spring boot run",
          "Iniciar a aplicação Spring Boot",
          program,
          ["spring-boot:run"],
        ),
      )
    }
    return commands
  }

  const gradlePath = (await fileExists(resolve(root, "build.gradle.kts")))
    ? resolve(root, "build.gradle.kts")
    : resolve(root, "build.gradle")
  const gradle = await readText(gradlePath)
  if (!gradle) return []
  const program = (await fileExists(resolve(root, "gradlew"))) ? "./gradlew" : "gradle"
  const commands = [
    createCommand("java", "gradle:test", "gradle test", "Executar os testes Gradle", program, [
      "test",
    ]),
    createCommand("java", "gradle:build", "gradle build", "Compilar o projeto Gradle", program, [
      "build",
    ]),
  ]
  if (gradle.includes("org.springframework.boot") || gradle.includes("spring-boot")) {
    commands.unshift(
      createCommand(
        "java",
        "gradle:boot-run",
        "gradle bootRun",
        "Iniciar a aplicação Spring Boot",
        program,
        ["bootRun"],
      ),
    )
  }
  return commands
}

export async function discoverDotnetCommands(root: string) {
  let entries: string[] = []
  try {
    entries = await readdir(root)
  } catch {
    return []
  }
  if (!entries.some((name) => /\.(?:sln|csproj|fsproj)$/i.test(name))) return []
  return [
    createCommand("dotnet", "run", "dotnet run", "Executar o projeto .NET", "dotnet", ["run"]),
    createCommand(
      "dotnet",
      "watch",
      "dotnet watch",
      "Executar e recarregar ao alterar arquivos",
      "dotnet",
      ["watch", "run"],
    ),
    createCommand("dotnet", "test", "dotnet test", "Executar os testes .NET", "dotnet", ["test"]),
    createCommand("dotnet", "build", "dotnet build", "Compilar a solução .NET", "dotnet", [
      "build",
    ]),
  ]
}

export function parseJsonWithComments(source: string) {
  // Match quoted strings first so comment markers and comma/bracket text stay literal.
  const withoutComments = source
    .replace(/"(?:\\[\s\S]|[^"\\])*"|\/\/[^\r\n]*|\/\*[\s\S]*?\*\//g, (token) =>
      token.startsWith('"') ? token : " ",
    )
    .replace(
      /"(?:\\[\s\S]|[^"\\])*"|,(\s*[}\]])/g,
      (token, closing: string | undefined) => closing ?? token,
    )
  return JSON.parse(withoutComments) as { tasks?: Record<string, unknown> }
}

export async function discoverDenoCommands(root: string) {
  const source =
    (await readText(resolve(root, "deno.json"))) ?? (await readText(resolve(root, "deno.jsonc")))
  if (!source) return []
  try {
    const deno = parseJsonWithComments(source)
    return Object.entries(deno.tasks ?? {})
      .filter((entry): entry is [string, string] => typeof entry[1] === "string")
      .map(([name, task]) => createCommand("deno", name, name, task, "deno", ["task", name]))
  } catch {
    return []
  }
}
