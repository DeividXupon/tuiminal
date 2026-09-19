# Free Terminal

## Free Terminal

- Default and custom Free Terminal launches use the native command interpreter: `COMSPEC`/`cmd.exe` with AutoRun disabled on Windows, and the configured `SHELL` or `/bin/sh` on POSIX. Never assume zsh exists or pass POSIX login flags to the Windows interpreter. Keep real native input/output/child-retirement coverage in the Windows suite as well as the Unix gate.
- Free Terminal process exit and PTY EOF are separate events. Drain the final output before closing the PTY, with a bounded fallback for descendants retaining the stream, and keep retirement pending until that cleanup completes. ConPTY may deliver final output after the child exit promise resolves.

- This is a generic Free Terminal, not an AI-only tab. It can host shells and any CLI, including Codex, Claude, database clients, or internal tools.
- Pass custom command text unchanged to the selected shell. Do not prepend `exec`: it replaces the shell before later `&&`, `||`, or `;` commands can run and breaks leading assignments and compound statements.
- Sessions use real Bun PTYs and remain alive across tab switches. Terminal colors, cursor, interactive prompts, and fullscreen TUIs must keep working.
- Keep every mounted PTY isolated from sibling UI updates: pane callbacks stay stable and a status/output change in one session must not rerender or remount the other terminal panes.
- Resizing or reattaching a Free Terminal pane must never rerun an exited command. Assign a launch generation before awaiting a previous shell's stop; only the latest still-mounted request may launch its replacement. Closing a pane invalidates pending launches and releases its generation entry. A stale exit may release only its exact handle, never update the replacement's state or detach its input.
- Give PTYs nearly all available space. Panels are separated with simple lines rather than padded cards.
- A section supports a maximum `2 × 2` layout: at most two horizontal panes and one lower row, with up to four terminals per section. Additional terminals go into another section; the overall session limit is 12.
- `Ctrl+B` is the tmux-style prefix for creating sections, splitting right/down, moving focus, toggling focused/full-section layout, restarting/closing panes, changing sections, and temporarily releasing global tab shortcuts.
- Every split, section, focus, restart, and close control must also be available by mouse. Closing Tuiminal stops only the terminal processes it created.
- Free Terminal and Runner stop handles are asynchronous and idempotent. Keep process ownership until exit is observed, wait through the grace period, force only the exact owned group/tree, and surface a bounded-deadline failure. Restart must wait for the prior process to finish; global shutdown awaits all mounted-tool disposers before destroying the renderer.
