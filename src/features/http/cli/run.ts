import { readFile } from "node:fs/promises"
import { relative, resolve } from "node:path"
import { parseHttpFile, requestFromHttpFile } from "../model/http-file"
import type { HttpProjectRequestItem } from "../model/types"
import {
  loadHttpRunnerDataset,
  resolveHttpRunFile,
  runHttpCollectionCase,
  runHttpDataset,
} from "../services/collection-runner"
import { environmentVariableContext, loadHttpEnvironments } from "../storage/environments"
import { formatHttpRunReport, httpRunExitCode, type HttpReportKind } from "./report"

type RunOptions = {
  file: string
  environment?: string
  report: HttpReportKind
  dataset?: string
  concurrency: number
}

function optionValue(args: string[], index: number, name: string) {
  const value = args[index + 1]
  if (!value || value.startsWith("-")) throw new Error(`Informe um valor para ${name}.`)
  return value
}

function parseRunOptions(args: string[]): RunOptions {
  const file = args[0]
  if (!file || file.startsWith("-")) throw new Error("Informe um arquivo .http para executar.")
  const options: RunOptions = { file, report: "text", concurrency: 1 }
  for (let index = 1; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === "--env") options.environment = optionValue(args, index++, argument)
    else if (argument === "--report") {
      const report = optionValue(args, index++, argument)
      if (!(["text", "json", "junit"] as string[]).includes(report)) {
        throw new Error(`Formato de relatório inválido: ${report}.`)
      }
      options.report = report as HttpReportKind
    } else if (argument === "--data") options.dataset = optionValue(args, index++, argument)
    else if (argument === "--concurrency") {
      const concurrency = Number(optionValue(args, index++, argument))
      if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 8) {
        throw new Error("A concorrência precisa estar entre 1 e 8.")
      }
      options.concurrency = concurrency
    } else throw new Error(`Opção desconhecida: ${argument}.`)
  }
  return options
}

function projectItems(source: string, path: string): HttpProjectRequestItem[] {
  const parsed = parseHttpFile(source, path)
  if (!parsed.requests.length) throw new Error("Nenhum request foi encontrado no arquivo.")
  return parsed.requests.map((block) => ({
    filePath: path,
    request: requestFromHttpFile(parsed, block),
  }))
}

export async function runHttpHeadless(args: string[], root = process.cwd()) {
  try {
    const options = parseRunOptions(args)
    const target = resolveHttpRunFile(root, options.file)
    const source = await readFile(target.path, "utf8")
    const projectRoot = resolve(root)
    const path = relative(projectRoot, target.path)
    const parsed = parseHttpFile(source, path)
    const items = projectItems(source, path)
    const environments = await loadHttpEnvironments(projectRoot)
    const environment = options.environment
      ? environments.find((candidate) => candidate.name === options.environment)
      : undefined
    if (options.environment && !environment) {
      throw new Error(`Ambiente não encontrado: ${options.environment}.`)
    }
    const base = environmentVariableContext(environment, parsed.variables)
    const dataset = options.dataset
      ? await loadHttpRunnerDataset(resolve(root, options.dataset))
      : [{ name: "default", values: {} }]
    const cases = await runHttpDataset(dataset, options.concurrency, (testCase) => {
      const variables = new Map(base)
      for (const [name, value] of Object.entries(testCase.values)) {
        variables.set(name, { value, origin: "request", secret: false })
      }
      return runHttpCollectionCase({
        name: testCase.name,
        items,
        ...(target.selector ? { selector: target.selector } : {}),
        variables,
        root: projectRoot,
      })
    })
    process.stdout.write(formatHttpRunReport(cases, options.report))
    return httpRunExitCode(cases)
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    return 2
  }
}
