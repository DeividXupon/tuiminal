# Performance benchmarks

Run the offline latency suite with Bun 1.4.2 from `.bun-version`:

```bash
bun run benchmark
bun run benchmark:all
bun run benchmark:all --samples 30 --warmup 5 --startup-samples 5 --output all-result.json
bun run benchmark --suite database,git --samples 30 --warmup 5
bun run benchmark --json --output benchmark-result.json
bun run benchmark:database:drivers --samples 30 --output driver-result.json
bun run benchmark:startup --samples 5 --output startup-result.json
bun run benchmark:startup --skip-animation --samples 5
bun run benchmark:tui
BENCHMARK_OUTPUT=tab-latency.json bun run benchmark:tui
BENCHMARK_SAMPLES=30 BENCHMARK_WARMUP=5 bun run benchmark:tui
bun run benchmark:runner:execution
BENCHMARK_OUTPUT=runner-execution.json bun run benchmark:runner:execution
bun run benchmark:runner:flow
BENCHMARK_OUTPUT=runner-flow.json bun run benchmark:runner:flow
bun run benchmark:http:response
BENCHMARK_OUTPUT=http-response.json bun run benchmark:http:response
bun run benchmark:git:ui
BENCHMARK_OUTPUT=git-partial-ui.json bun run benchmark:git:ui
bun run benchmark:git:remote:ui
BENCHMARK_OUTPUT=git-remote-ui.json bun run benchmark:git:remote:ui
bun run benchmark:git:inbox:ui
BENCHMARK_OUTPUT=git-inbox-ui.json bun run benchmark:git:inbox:ui
bun run benchmark:git:pr
BENCHMARK_SAMPLES=30 BENCHMARK_WARMUP=5 BENCHMARK_OUTPUT=git-pr-large.json bun run benchmark:git:pr
bun run benchmark:http:ui
BENCHMARK_OUTPUT=http-ui.json bun run benchmark:http:ui
bun run benchmark:database:ui
BENCHMARK_OUTPUT=database-ui.json bun run benchmark:database:ui
```

`benchmark:all` runs the service, startup, native tab/action, Runner execution
and flow, HTTP response, Git Diffs, Git PR/Issue and Inbox remote UI, the
large-data PR workload, complete HTTP, and complete Database suites
sequentially. It writes one report to `dist/benchmarks/all.json` by default,
with all raw samples, suite membership, and the source commit. Use `--suite`
with a comma-separated list of `service,startup,tui,runner-execution,runner-flow,http-response,git-ui,git-remote-ui,git-inbox-ui,git-pr,http-ui,database-ui`
to select a subset. `--samples` and `--warmup` apply to service and mounted
UI suites; startup keeps its own `--startup-samples` and `--startup-warmup`
defaults of five and one. `--external-database` opts the service suite into
the Docker-backed native-driver matrix. A failed suite stops the run without
publishing a combined report.

`benchmark` creates a temporary config directory, SQLite database, Git repository,
fake `gh` executable, Runner project, HTTP collection, and loopback HTTP server. It removes these resources
after the run. It does not open the user's project, credentials, GitHub account, or
database servers. The only persistent file is the optional `--output` path.
The Terminal suite runs in its own Bun process and returns its measured samples to
the main report. Its process has a bounded deadline, so a stalled native PTY launch
fails the run instead of leaving the whole suite waiting indefinitely.

`benchmark:database:drivers` is opt-in and requires a running Docker daemon. It
adds 30 native-driver cases to the SQLite suite: connection tests, catalog, grid,
search/sort, structure, SQL query, reviewed insert/update/delete, and ten-row
transaction for each of MySQL 8.4, MariaDB 11.8, and PostgreSQL 17. It creates
uniquely named containers on random loopback ports and removes only those containers
afterward, including when setup fails. Image layers downloaded by Docker may remain
in its cache. The fixture uses empty or trust-authenticated local container accounts;
it does not read the user's database profiles or credentials.

The default Database service suite also compiles a disposable, read-only MCP
server from the pinned Bun runtime. Six cases measure a fresh connection with
tool discovery and shutdown, then catalog, table page, editor query, later
SQL result window, and cancellation over a warm MCP session. Compilation is setup work outside
the samples. The server returns deterministic rows, uses no real database or
credentials, and is stopped with its owning client.

`benchmark:tui` uses the native OpenTUI test renderer and measures input to a
rendered frame. Ten cases cover `[Alt+1–5]` and mouse tab switches. Fourteen more
measure the Terminal Master Key, session creation, mouse and keyboard folder
folding, pinning and unpinning the sidebar, activation from another tool, session
navigation and splitting,
Database catalog search focus, Git commit graph, Runner multi view and project picker,
and HTTP help overlay. It uses a disposable project,
local Git repository and SQLite database with isolated configuration. Defaults are
20 measured samples after three warmups; `BENCHMARK_SAMPLES` and `BENCHMARK_WARMUP`
override those counts, and `BENCHMARK_OUTPUT` writes raw samples as JSON. These are
warm interactions within one mounted application. Frame capture is included; a
physical terminal's display latency is not measured. Terminal UI actions use a
fixture process handle so asynchronous shell output does not perturb frame timing;
native PTY launch and retirement are measured in the service suite.

`benchmark:runner:execution` mounts the production Runner execution hook in the
native test renderer. Three cases measure the failure-to-restart path with one
25 ms policy delay and successful completion with metadata-only or opted-in log
history. Their process callback is controlled by the fixture, while the hook's
restart timer, state updates, and real isolated settings write are measured.
A fourth case runs real child processes: the first exits with failure, the
restart policy launches a second, and the timer stops after its successful
completion. Sample, warmup, and optional `BENCHMARK_OUTPUT` settings match
`benchmark:tui`.

`benchmark:runner:flow` mounts the complete Runner against isolated saved
commands and measures the visible Run, Restart, and Stop controls. A four-command
flow completes one preparation stage, runs two commands in parallel, then
finishes a dependent command. The timer starts at the click and stops when
the final success appears in the native frame. The Stop case starts with a
long-running middle-stage child and times the click through its retirement and
the rendered stopped state; it checks that the dependent command never starts.
Each child is a real Bun process. Preparation, mounting, and the first run for
the Restart case stay outside the timer. The benchmark verifies stage order and
stops only processes it owns. Sample, warmup, and optional output settings
match `benchmark:tui`.

`benchmark:http:response` mounts the production HTTP response hook in the native
test renderer and uses a disposable loopback server. Three cases measure a
128 KiB complete download through its rendered notice, repeated activation
followed by cancellation, and closing the owning document during a stream.
They include real request preparation, transport, protected file publication
or partial-file cleanup, and frame capture. The server and HTTP workspace live
inside the isolated test fixture. Sample, warmup, and optional output settings
match `benchmark:tui`.

`benchmark:git:ui` mounts the production Git Diffs workspace against a separate
disposable repository. Three cases measure opening the complete commit graph,
opening the detailed commit log, and switching a loaded diff from unified to
two-column layout. Three more measure `[S]` from a focused diff to loaded
partial-stage panes, then line-mode selection and application in each direction.
Four more cases measure folder stage and unstage with `[Space]`, opening the
exact-target discard confirmation with `[D]`, and confirming the discard with
`[D]`. The timer includes native keyboard input, Git operations, and the final
rendered result. Preparation resets the index and remounts the workspace before
each sample; validation checks the real index and worktree after the timer,
including that an unrelated changed file remains untouched. Sample, warmup,
and optional output settings match `benchmark:tui`.

`benchmark:git:remote:ui` mounts the production PR and Issue dashboards against
an isolated `gh` fixture. Eight cases measure initial list loading through
authentication and the first rendered page, selecting another row through its
newly rendered details, reaching the final loaded row through automatic second-page
rendering, and `[R]` refresh through a newly rendered page. Each sample starts
with a fresh dashboard. The fixture returns selection-specific detail bodies and
marks each list response with a revision number, so the measurements cannot stop
on stale details or the previous page. Detail, pagination, and refresh timers
exclude the initial list load.
Sample, warmup, and optional output settings match `benchmark:tui`.

`benchmark:git:inbox:ui` mounts the production Inbox against the same isolated
`gh` fixture. Three cases time the first rendered notification page, reaching the
final loaded row through automatic second-page rendering, and `[R]` refresh
through a newly rendered page. The fixture marks each notification response with
a revision number; pagination and refresh timers exclude the initial load.
Sample, warmup, and optional output settings match `benchmark:tui`.

`benchmark:git:pr` is the specialized large-data PR suite. It measures bounded
selection movement, merging 5,000 updates into a 20,000-item cache, parsing a
256 KiB description, and parsing a 2 MiB diff. Selection latency is reported per
movement through `operationsPerSample`; the other cases report the complete
operation. `BENCHMARK_SAMPLES`, `BENCHMARK_WARMUP`, and `BENCHMARK_OUTPUT` use the
same semantics and report schema as the mounted suites. It performs no network or
filesystem writes other than the optional report.

`benchmark:http:ui` mounts the complete HTTP client with an initial URL pointing
to a disposable loopback server. Seven cases measure keyboard and mouse Send to
visible status and JSON, opening response search with `[Ctrl+F]`, typing a search
query to one rendered match, Pretty JSON selection/collapse, and
clicking the visible complete-download and cancellation controls on truncated
binary responses.
Each sample begins in a fresh mounted client with its URL ready outside the timer;
input, request preparation, transport, state updates, and frame capture are timed
for the Send cases.
The download cases verify either a published full-size file or complete removal
of the canceled partial file in the isolated HTTP home.
The server counts requests to detect duplicate sends. Sample, warmup, and optional
output settings match `benchmark:tui`.

`benchmark:database:ui` mounts the complete Database viewer with a disposable
160-row SQLite table and an isolated saved connection. Seven cases measure opening
the catalog table, filtering then opening it, moving through the first 50 rows to
load the next 40-row grid window, searching and sorting the grid, executing an
editor query with `[Ctrl+A]`, and advancing its result window until it is
rendered. Each sample starts with a fresh viewer; fixture
creation, mounting, and preparation stay outside the timer. Sample, warmup, and
optional output settings match `benchmark:tui`.

`benchmark:startup` launches a fresh CLI process for each sample in a native PTY
and feeds its ANSI output into an emulated terminal. It stops the timer when the
selected tool's first useful content is visible. The default includes the normal
startup animation; `--skip-animation` isolates the launch and workspace-load path.
It measures all five isolated tool launches with five samples and one warmup by
default. Temporary config, data, home, and project directories isolate each child;
a test preload supplies an empty credential store, and Git cannot invoke the real
`gh` executable. Only exact child processes are stopped.
The report uses the same raw-sample and percentile fields as the service suite.
Terminal emulator processing is included, but physical display latency is not.

Each service case runs sequentially. Preparation and warmup are excluded from recorded
times. A sample measures the complete operation from invocation to its resolved
result, and result validation occurs after the timer stops. Batched microbenchmarks
divide wall time by `operationsPerSample` and report milliseconds per operation.
Default settings are 3 warmups and 20 measured samples. p50 and p95 use the
nearest-rank percentile of sorted samples. The JSON report includes every raw
sample, mean, min, max, runtime, platform, source commit, and dirty-worktree flag. Compare runs on the
same host and Bun version; scheduler load, filesystem cache, and process startup
can change results. The command does not enforce a universal latency budget.

## Current coverage

The default service suite has 163 portable cases across the five tools, plus one
live Runner port-discovery case on POSIX hosts with `lsof`. The native TUI suite
has 24 cases; the mounted Git Diffs suite has ten cases; the complete HTTP and
Database UI suites have seven each; the mounted Git PR/Issue remote UI suite has
eight and the Inbox UI suite has three; the mounted HTTP response suite has three; the Runner execution
suite has four; the complete Runner flow UI suite adds three cases; and cold
startup adds five tool-specific measurements. The twelve maintained offline suites
cover 241 portable cases, plus the live Runner port case on POSIX hosts with
`lsof`. The opt-in native database
matrix adds 30 more when Docker is available. Remote Git responses come from
a disposable `gh` fixture process, so those cases include
process launch and JSON parsing without network latency.

| Tool | Measured paths |
| --- | --- |
| Database | SQLite catalog, 100/1,000-row grid windows, search/sort, editor query and later 50-row result window, structure, reviewed insert/update/delete and ten-row transaction, query-history retention/list/batch persistence, saved-query list/update, CSV serialization, SQL read policy; read-only MCP connection, catalog, grid, SQL result windows and cancellation against a disposable server; optional MySQL/MariaDB/PostgreSQL connection, catalog, grid, search/sort, structure, SQL and transaction cases |
| Git | Local status/history, diff, branch comparison, stage/unstage, partial-stage patch load/apply, single-line stage and reverse removal, bidirectional line exchange, mounted partial-stage opening and line transfer in both directions, mounted folder stage/unstage and exact-target discard confirmation/completion, tracked and untracked discard, file tree and patch parsing, PR/Issue query suggestions, fake `gh` PR/Issue and Inbox pagination, two-page PR/Issue refresh, mounted PR/Issue and Inbox list loading and refresh, PR/Issue details and detail pagination, PR workflow runs, simulated CI watch transition and real fake-`gh` check polling through notification, all 22 direct PR/Issue mutation kinds including guarded checkout, comment and close coordination through authentication/write/reconciliation, uncertain network-write classification, PR list merge and description rendering, Issue sort, Inbox merge |
| Runner | Project discovery/context, dependency planning/transitions, simulated and process-backed three-stage flows, owned process-plan restart, mounted four-command flow execution and restart from visible controls through rendered success, mounted stop through real child retirement, mounted automatic policy restart and optional history-log persistence, YAML parse, bounded log buffering/filtering/rendering/export, completed-history roundtrips with metadata only and 1,200 opted-in logs, listening-port parsing and live discovery when `lsof` is available, healthy/unhealthy/cancelled local probes, disposable process and PTY launch/exit and stop |
| HTTP | `.http` parse and project scan, request preparation/auth/variables, loopback GET/POST/multipart/file/redirect, finite and continuous chunked capture, continuous-stream truncation and midstream cancellation with transport retirement, complete 128 KiB GET download with protected publication, name collision, redirect, midstream cancellation, 404 and unsafe POST rejection, mounted response-hook completion, duplicate suppression, cancellation and owner-close abort, input-driven keyboard/mouse Send, response search, Pretty JSON collapse and visible complete download, approved cross-origin redirect with credential stripping, timeout and cancellation, bounded response capture, single-request collection run, a three-request dependency/extraction/assertion chain with redacted report, ten-row dataset execution with four workers both alone and combined with dependency chains, response inspection/diff, cookie jar, history body budget and persisted roundtrip, Postman and OpenAPI import preview/apply |
| Free Terminal | PTY output/title processing, native PTY launch and retirement, tmux record and layout parsing/fitting, mirror resize/sidebar-change decisions and scheduled refresh, process-based agent detection and state transitions, section navigation grouping and split cleanup, persisted folder assignments, pinned sidebar state relay and navigation routing, Live Diff status/scan/patch |

The older `scripts/benchmark-free-terminal.ts` remains available for its larger,
specialized terminal workload.

## Coverage still to add

The service suite measures model and service response time; the TUI suite measures
warm keyboard and mouse tab switches plus fourteen individual tool actions. The dedicated
Database UI suite adds catalog, grid, and SQL timings. The suites do not yet measure
most TUI actions, other mouse interactions,
installation, or physical terminal display
latency. Add those scenarios before treating this as full user-perceived latency
coverage. A run that visited all five tabs also produced an OpenTUI warning at 11
`keypress` listeners; investigate that count while expanding the UI suite.

- Database: other MCP controls and mounted UI, native-driver cancellation, schema
  caches, and later SQL result windows on the external drivers. The opt-in Docker matrix still needs a
  live-daemon run to verify its measurements.
- Git: coordinator cycles for the remaining non-comment actions, mounted Compare,
  command-console and remote write controls, plus other mouse interactions.
- Runner: other mounted process controls and edits to running plans. The live
  port-discovery case needs a POSIX
  host with `lsof` and has not run on Windows.
- HTTP: Postman account sync and other mounted request-builder and response
  interactions. The complete-download and cancellation controls now have UI
  timings; owner-close timing remains in the response-hook suite.
- Free Terminal: live resize, live tmux
  discovery and mirror capture against an isolated server, full folder operations and
  other mounted sidebar interactions.

External database and service cases remain opt-in and use owned disposable
resources. Never benchmark against real user credentials or projects by default.
