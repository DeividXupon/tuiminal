// Reuse the global fixture: cached services and TUI mounts must see the same
// launch directory both with plain `bun test` and the dedicated test:tui command.
import "../setup"

// Most integration tests assert final UI state. The dedicated plasma test opts
// back into animation; keeping other loaders static avoids unrelated timer work.
process.env.TUIMINAL_TEST_STATIC_LOADERS = "1"
// App-level tests exercise the ready workspace unless a startup-animation test
// explicitly removes this flag before mounting App.
process.env.TUIMINAL_TEST_SKIP_STARTUP = "1"
