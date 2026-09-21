import { createElement, type ComponentProps } from "react"
import { loadedFeature, requireFeature, type FeatureModules } from "./registry"
export function DatabaseViewer(
  props: ComponentProps<FeatureModules["database"]["DatabaseViewer"]>,
) {
  const Component = loadedFeature("database")?.DatabaseViewer
  return Component ? createElement(Component, props) : null
}
export function DatabaseQueryHistoryModal(
  props: ComponentProps<FeatureModules["database"]["DatabaseQueryHistoryModal"]>,
) {
  const Component = loadedFeature("database")?.DatabaseQueryHistoryModal
  return Component ? createElement(Component, props) : null
}
export function GitViewer(props: ComponentProps<FeatureModules["git"]["GitViewer"]>) {
  const Component = loadedFeature("git")?.GitViewer
  return Component ? createElement(Component, props) : null
}
export function GitConfigurationView(
  props: ComponentProps<FeatureModules["git"]["GitConfigurationView"]>,
) {
  const Component = loadedFeature("git")?.GitConfigurationView
  return Component ? createElement(Component, props) : null
}
export function Runner(props: ComponentProps<FeatureModules["runner"]["Runner"]>) {
  const Component = loadedFeature("runner")?.Runner
  return Component ? createElement(Component, props) : null
}
export function HttpClient(props: ComponentProps<FeatureModules["http"]["HttpClient"]>) {
  const Component = loadedFeature("http")?.HttpClient
  return Component ? createElement(Component, props) : null
}
export function FreeTerminal(props: ComponentProps<FeatureModules["terminal"]["FreeTerminal"]>) {
  const Component = loadedFeature("terminal")?.FreeTerminal
  return Component ? createElement(Component, props) : null
}
export function PinnedTerminalSidebar(
  props: ComponentProps<FeatureModules["terminal"]["PinnedTerminalSidebar"]>,
) {
  const Component = loadedFeature("terminal")?.PinnedTerminalSidebar
  return Component ? createElement(Component, props) : null
}
export const listDatabaseQueryHistory: FeatureModules["database"]["listDatabaseQueryHistory"] = (
  ...args
) => requireFeature("database").listDatabaseQueryHistory(...args)
export const databaseQueryHistoryCanRerun: FeatureModules["database"]["databaseQueryHistoryCanRerun"] =
  (...args) => requireFeature("database").databaseQueryHistoryCanRerun(...args)
