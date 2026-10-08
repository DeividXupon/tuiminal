# Cross-tool conventions

Use for shared UI, keyboard/focus, i18n, tutorials and documentation.
The [control contract](../design/ui-controls.md) owns component geometry, settings,
clipboard and notification behavior; [architecture](../architecture.md) owns
initialization and dependency boundaries.

## UI and keyboard

- Keep content dense, responsive and mouse-accessible. Reuse core controls when
  ownership matches; features retain keyboard scopes, focus stacks and write guards.
- Use `InlineButton`, `DirectionalButton`, `ShortcutText` and `ModalSurface` for
  their documented roles. Selectable rows may use native buttons. Bracketed hints
  use the fixed brand accent; data branches disable hint highlighting.
- Contextual creation uses `[N]` unless the local editor requires a modifier.
  Primary horizontal strips use `[A←]`/`[F→]`; nested strips use
  `[Z←]`/`[V→]`. Show and handle actions only in their owning focus scope.
- Global `[Alt+1–5]` selects tools; `[,]` opens settings. Accept OpenTUI
  `meta` and `option`, Kitty escapes and traditional Alt fallback. Plain
  numbers belong to tools. Inputs, editors, PTYs, pickers and modals retain keys.
- `[Esc]` unwinds autocomplete/input, modal, then workspace. Consume it with
  `preventDefault()` and `stopPropagation()`; Database's global exit must wait
  for local handlers. Register modal focus IDs in feature `keyboard.ts` and
  the app guard, including empty dialogs.
- Closed dialogs must not retain keyboard/dimension listeners. Retained SQL/HTTP
  editor trees preserve state but inactive trees cannot handle input. Bound renderer
  selection listeners by documented mounted-editor limits; test resize/key leaks.
- Preserve native refs, buffers and focus across theme, language and layout changes.
  Never key tab trees by appearance. Use `LAYOUT.workspaceBackground` for outer
  surfaces; Term Agents always uses compact geometry.
- Password fields use core `PasswordInput` with runtime registration. Mask the
  full rendered width and expose only mask text to selection APIs, including
  Unicode, resize, scrolling and clearing.
- Loading plasma keeps usable content mounted; incremental refresh stays inline.
  Use bounded native text documents and clocks, not per-cell React nodes.
  Notifications never take focus; timers belong only to retained cards.

## Initialization and text

- Initialize settings at bootstrap before importing color-capturing feature UI.
  Importing theme must not read preferences or change global language/masking.
  Version queries avoid UI/settings imports; help retains language behavior.
- Resolve CLI aliases through own-property lookup; inherited object names remain
  directory arguments. Isolated mode initializes only the requested feature.
- Fixed text uses `translateUi` and the [catalog](../../packages/core/src/i18n/index.ts).
  Keep all six languages complete; never translate child output, code or user data.
- Preserve catalog precedence, whitespace and markers. Index message tuples once;
  process nested prefixes iteratively without truncation or repeated suffix scans.
- Measure/truncate by grapheme display width and iterate visible prefixes lazily.
  Validate saved palette IDs as own registry keys without rewriting on read.

## Documentation and demos

- Keep current contracts in their owning specification; update it when behavior
  changes. Preserve commands, identifiers, fixtures and license text when translating.
  Release prose is English; translation must retain claims and release metadata.
- Regenerate README demos with `bun run docs:demos` after material UI/workflow
  changes. Set isolated config/data/project paths before runtime imports, retaining
  the settings-path assertion. SVG captures position text by display columns and
  paint backgrounds before foregrounds.
- Tutorials simulate only the active tool. Enter the demonstrated state, target its
  visible result, then restore the demo; keep step discovery stable and mark
  state-dependent targets `stateful`. Cover targets, translations and absence of I/O.
- Tutorial hit overlays stay paintless; outlines occupy only free cells outside
  targets. Preserve wide glyphs and edge-aligned one-row controls.
