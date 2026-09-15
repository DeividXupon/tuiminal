// Reuse the global fixture: cached services and TUI mounts must see the same
// launch directory both with plain `bun test` and the dedicated test:tui command.
import "../setup"

// React's optional User Timing tracks recursively serialize component props,
// including every byte of captured HTTP bodies. That browser-profiler telemetry
// can exhaust native test deadlines. Keep the development reconciler and real
// renderer/input behavior, but disable telemetry before importing either one.
// performance.now() and all application timers retain their native behavior.
Object.defineProperty(performance, "measure", { value: undefined, configurable: true })

// Most integration tests assert final UI state. The dedicated plasma test opts
// back into animation; keeping other loaders static avoids unrelated timer work.
process.env.TUIMINAL_TEST_STATIC_LOADERS = "1"
// App-level tests exercise the ready workspace unless a startup-animation test
// explicitly removes this flag before mounting App.
process.env.TUIMINAL_TEST_SKIP_STARTUP = "1"

const { loadSourceFeature } = await import("../../apps/cli/src/features/source-loader")
for (const id of ["database", "git", "runner", "http", "terminal"] as const)
  await loadSourceFeature(id)
