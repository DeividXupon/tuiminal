import { featureErrorMessage } from "./errors"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { FeatureController } from "./controller"
import { runInstalledHttp } from "./loader"
import { FEATURE_IDS, isFeatureId } from "./model"

export async function installFeaturesCli(args: string[]) {
  const ids = args.length === 1 && args[0] === "all" ? [...FEATURE_IDS] : args
  if (!ids.length || !ids.every(isFeatureId)) {
    console.error(translateUi("Escolha database, git, runner, http, terminal ou all."))
    return 1
  }
  const controller = new FeatureController()
  const cancel = () => controller.cancel()
  process.once("SIGINT", cancel)
  process.once("SIGTERM", cancel)
  try {
    await controller.install(ids)
    const state = controller.snapshot()
    if (state.error) {
      console.error(translateUi(state.error))
      return 1
    }
    console.log(translateUi("Ferramentas oficiais instaladas."))
    return 0
  } finally {
    process.removeListener("SIGINT", cancel)
    process.removeListener("SIGTERM", cancel)
    controller.dispose()
  }
}
export async function httpFeatureCli(command: "run" | "import" | "postman", args: string[]) {
  try {
    return await runInstalledHttp(command, args)
  } catch (error) {
    console.error(translateUi(featureErrorMessage(error)))
    return 1
  }
}
