const { readdirSync } = require("node:fs")

const features = readdirSync("src/features", { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)

module.exports = {
  forbidden: [
    { name: "no-cycles", severity: "error", from: {}, to: { circular: true } },
    { name: "no-unresolved", severity: "error", from: {}, to: { couldNotResolve: true } },
    {
      name: "foundation-is-independent",
      severity: "error",
      from: { path: "^src/(core|shared)/" },
      to: { path: "^src/(app|features)/" },
    },
    {
      name: "features-do-not-import-app",
      severity: "error",
      from: { path: "^src/features/" },
      to: { path: "^src/app/" },
    },
    {
      name: "app-uses-feature-api",
      severity: "error",
      from: { path: "^src/app/" },
      to: { path: "^src/features/[^/]+/", pathNot: "^src/features/[^/]+/index\\.ts$" },
    },
    {
      name: "models-are-pure",
      severity: "error",
      from: { path: "^src/features/[^/]+/model/" },
      to: {
        path: "(^src/(app|core)/|^src/features/[^/]+/(services|storage|drivers|discovery|rendering|ui|query)/|(^|node_modules/)(react|@opentui|@tuiparts)(/|$)|^(node:|bun:))",
      },
    },
    ...features.map((feature) => ({
      name: `${feature}-is-independent`,
      severity: "error",
      from: { path: `^src/features/${feature}/` },
      to: { path: "^src/features/", pathNot: `^src/features/${feature}/` },
    })),
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsConfig: { fileName: "tsconfig.json" },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      extensions: [".ts", ".tsx", ".js", ".mjs", ".cjs", ".json"],
      conditionNames: ["import", "bun", "default"],
    },
  },
}
