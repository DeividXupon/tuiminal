import { homedir } from "node:os"
import { isAbsolute, join } from "node:path"
import { fileURLToPath } from "node:url"
import metadata from "../../package.json"
import { FeatureInstallError, parseFeatureCatalog } from "./model"
import { MINIMAL_BUILD } from "./mode"
import { RELEASE_FEATURE_CATALOG } from "./release-catalog"
import { FeatureStore } from "./store"
import { localFeatureCatalog } from "./catalog-snapshot"

export const FEATURE_VERSION = metadata.version
export async function featureEnvironment() {
  const localDirectory = !MINIMAL_BUILD
    ? fileURLToPath(new URL(`../../../../dist/features/${FEATURE_VERSION}/`, import.meta.url))
    : null
  if (!localDirectory && !RELEASE_FEATURE_CATALOG)
    throw new FeatureInstallError("catalog", "Missing embedded feature catalog")
  const local =
    localDirectory && !RELEASE_FEATURE_CATALOG
      ? await localFeatureCatalog(localDirectory, FEATURE_VERSION)
      : null
  const catalog = local?.catalog ?? parseFeatureCatalog(RELEASE_FEATURE_CATALOG, FEATURE_VERSION)
  const mirror = process.env.TUIMINAL_FEATURE_BASE_URL
  const baseUrl = mirror
    ? new URL(mirror.endsWith("/") ? mirror : `${mirror}/`)
    : local
      ? local.baseUrl
      : new URL(`https://github.com/DeividXupon/tuiminal/releases/download/v${FEATURE_VERSION}/`)
  const dataHome =
    process.env.XDG_DATA_HOME ||
    (process.platform === "win32" ? process.env.LOCALAPPDATA : undefined)
  const directory = join(
    dataHome && isAbsolute(dataHome) ? dataHome : join(homedir(), ".local", "share"),
    "tuiminal",
    MINIMAL_BUILD ? "features" : "dev-features",
  )
  return { catalog, baseUrl, store: new FeatureStore(directory), allowLocalFiles: !MINIMAL_BUILD }
}
