const { readdirSync } = require("node:fs")

const features = readdirSync("packages", { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name.startsWith("feature-"))
  .map((entry) => entry.name.slice("feature-".length))

module.exports = {
  forbidden: [
    { name: "no-cycles", severity: "error", from: {}, to: { circular: true } },
    { name: "no-unresolved", severity: "error", from: {}, to: { couldNotResolve: true } },
    {
      name: "foundation-is-independent",
      severity: "error",
      from: { path: "^packages/core/src/" },
      to: { path: "^(apps/cli/|packages/feature-[^/]+/src/)" },
    },
    {
      name: "features-do-not-import-app",
      severity: "error",
      from: { path: "^packages/feature-" },
      to: { path: "^apps/cli/" },
    },
    {
      name: "app-uses-feature-api",
      severity: "error",
      from: { path: "^apps/cli/" },
      to: {
        path: "^packages/feature-[^/]+/src/",
        pathNot:
          "^packages/(feature-[^/]+/src/index\\.ts|feature-http/src/cli/(run|import|postman)\\.ts)$",
      },
    },
    {
      name: "models-are-pure",
      severity: "error",
      from: { path: "^packages/feature-[^/]+/src/model/" },
      to: {
        path: "(^(apps/cli/|packages/core/src/(settings|lifecycle|process|keyboard)/)|^packages/feature-[^/]+/src/(services|storage|drivers|discovery|rendering|ui|query)/|(^|node_modules/)(react|@opentui|@tuiparts)(/|$)|^(node:|bun:))",
      },
    },
    ...features.map((feature) => ({
      name: `${feature}-is-independent`,
      severity: "error",
      from: { path: `^packages/feature-${feature}/src/` },
      to: { path: "^packages/feature-", pathNot: `^packages/feature-${feature}/src/` },
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
