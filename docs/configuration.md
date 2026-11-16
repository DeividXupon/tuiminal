# YAML configuration

Tuiminal loads shortcuts and theme overrides at startup. The first interactive
launch creates any missing configuration files, including tools that are not
installed yet. This first-run initialization also covers installation methods
that cannot create files in the eventual user's home directory.

## Location and precedence

The main file is selected in this order:

1. `tuiminal --config /path/to/config.yml`.
2. The `TUIMINAL_CONFIG` environment variable.
3. `$XDG_CONFIG_HOME/tuiminal/config.yml`, or
   `~/.config/tuiminal/config.yml` when `XDG_CONFIG_HOME` is unset.

The five tool files always live beside the selected main file:

```text
config.yml       global shortcuts and theme
http.yml         HTTP shortcuts
git.yml         Git shortcuts
database.yml    Database shortcuts
runner.yml      Runner shortcuts
terminal.yml    Term Agents shortcuts and Master Key
```

The five tool filenames are reserved, including case variants such as `HTTP.yml`.
The main file must use a different name, such as `config.yml` or `personal.yml`;
Tuiminal rejects a conflicting selection before creating or updating files.

Existing JSON preferences, connections, saved projects and session data retain
their existing locations. Choosing a main YAML file changes only this YAML set.
Restart Tuiminal after editing it. `--version` does not load or create user
configuration.

## Global shortcuts

Global bindings use stable action names in `config.yml`:

```yaml
shortcuts:
  workspace:
    database: [Alt+1]
    git: [Alt+2]
    runner: [Alt+3]
    http: [Alt+4]
    terminal: [Alt+5]
    settings: [","]
    quit: [q]
    escape: [Esc]
    interrupt: [Ctrl+c]
```

A binding accepts a single key, a list of alternatives, or `null`/`[]` to disable
it. For example, `settings: F6` opens settings with `[F6]`; `quit: null` disables
the ordinary quit shortcut. Escape and interrupt retain the active tool's rules:
closing an inner dialog or releasing editor focus does not also exit the app.
In Term Agents, the Master Key releases terminal input before application
navigation/settings/quit bindings become active. PTYs continue receiving their
ordinary input and interrupts.

Key names are case-insensitive. Use combinations such as `Ctrl+s`, `Alt+4`,
`Shift+m`, `F6`, `Enter`, `Esc`, `Tab`, `Up`, `Down`, `Left`, and `Right`.
`Option` and `Meta` are aliases for `Alt`; arrow glyphs are accepted too.
Quote YAML punctuation, such as `","`, `"?"`, `"["`, and `"#"`.

## Tool contexts

Tool files group bindings by their keyboard owner. The generated file lists the
available contexts and default key identities. The identity on the left stays
unchanged; the value on the right selects its physical key. For example, these
Terminal bindings move provider selection and cancellation to function keys:

```yaml
# terminal.yml
shortcuts:
  provider-picker:
    Enter: F6
    Esc: F7
  actions:
    n: F8
masterKey: Ctrl+B
```

The provider picker now uses `[F6]` to select and `[F7]` to close; after the
Master Key, `[F8]` opens a terminal. Hints follow the configured keys. Mouse
controls remain available when a keyboard binding is disabled.

Contexts preserve the existing focus hierarchy. A key may be reused by a modal
and the screen below it because the modal owns input while open. Text fields
retain literal typing, and terminal input remains owned by the PTY until the
Master Key is active. Two actions that are simultaneously eligible in the same
context cannot share a physical key. To swap two keys, change both entries;
changing only one to another action's current binding is a conflict.

`terminal.yml` also accepts `masterKey`: `Ctrl+B`, `Ctrl+A`, `Ctrl+Space`,
`Ctrl+F`, `Ctrl+G`, `Ctrl+N`, `Ctrl+P`, or `Ctrl+T`. Its default `null` inherits
the saved settings preference. An explicit YAML value applies at each startup.

## Themes

Select a built-in palette and override only the desired semantic colors:

```yaml
# config.yml
theme:
  palette: nord
  mode: dark
  colors:
    canvas: "#101820"
    panel: "#16232F"
    focus: "#80D8FF"
    success: "#82C995"
```

Available palettes are `prime`, `midnight`, `nord`, `gruvbox`, `dracula`,
`catppuccin`, `tokyo-night`, and `galaxy`; modes are `dark` and `light`.
`palette: null` and `mode: null` inherit `settings.json`. Colors must be
six-digit hexadecimal strings, with `#` quoted for YAML. Color names are the
semantic fields of the [palette contract](../packages/core/src/settings/theme-types.ts),
including surface, text, tool, status, selection, and diff colors. Unspecified
colors come from the chosen base palette. The wordmark and keyboard-hint brand
colors retain their shared UI rules.

The settings screen can change the current base palette or mode during a
session; explicit YAML values apply again on the next startup. YAML color
overrides remain applied over the current base. Existing settings preferences
are not rewritten merely by loading a YAML theme.

## Updates and invalid files

Updates fill in missing options and bindings while preserving customized values,
disabled bindings, comments, and unrelated formatting when no update is needed.
New tools receive their own default file. Files are validated with the effective
new defaults before being updated, so an added binding cannot silently replace
a customized key.

Invalid YAML, duplicate mapping keys, unknown options, invalid color/key values,
and actual same-context conflicts produce a startup warning with the filename
and problem. The affected file uses defaults for that launch and remains
unchanged. Correct the file and restart; only then can automatic additions be
saved. Tuiminal never resolves a conflict by changing your customized binding.

## Extending shortcuts

YAML shortcuts live in core's contextual registry. Add new key identities to the
owning context and route both hook and native `onKeyDown` handlers through its
adapter. Bind `withShortcutContext` to explicit stable renderable IDs (or bounded
ID prefixes), never component names; native input ownership must survive bundling.
Keep hint rendering in that same context and verify customized keys, disabled
defaults, literal typing, and a simultaneously mounted sibling panel.
