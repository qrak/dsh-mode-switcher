# dsh-mode-switcher

[![ci](https://github.com/qrak/dsh-mode-switcher/actions/workflows/ci.yml/badge.svg)](https://github.com/qrak/dsh-mode-switcher/actions/workflows/ci.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Switch **Plan** and **Build** in [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) with `Tab` or a click, and let each mode keep its own **model + reasoning effort**. Set the model once in Plan, once in Build, and the switcher restores the right one on every toggle, `/plan`, `/plan off`, and plan approval.

This is an independent, MIT-licensed implementation of the idea popularized by [gaoyinxin/dsh-mode-switcher](https://github.com/gaoyinxin/dsh-mode-switcher). It contains no code or assets from that project.

## Screenshots

**Build** — `🛠️ Build ⇥ Tab`

![Build mode chip in the composer](https://raw.githubusercontent.com/qrak/dsh-mode-switcher/main/docs/build-mode.jpg)

**Plan** — `📋 Plan ⇥ Tab`

![Plan mode chip in the composer](https://raw.githubusercontent.com/qrak/dsh-mode-switcher/main/docs/plan-mode.jpg)

## Why this implementation

- **Persistence that fits each surface.** The Desktop window runs on the stable `dsh-app://app` origin, so presets live in `localStorage` and survive restarts. The browser web UI gets a random `127.0.0.1` port each launch, so the plugin also writes a host-scoped cookie and reads whichever copy is newest.
- **Only plain `Tab`.** `Shift+Tab`, `Ctrl+Tab`, `Alt+Tab` and `Meta+Tab` are left to the application; so are IME composition and auto-repeat.
- **Errors are visible.** If a saved model was removed or an effort level is unsupported, the chip shows a warning, the stale preset is cleared, and the mode still switches.
- **No network, no telemetry, no secrets.** The plugin talks only to the DSH session API and stores a small JSON preset in browser storage.
- **Tested.** The preset logic, cookie parser, keyboard predicate, chip lookup and the mode state machine have unit tests, and CI runs them on Node 22 and 24.

## Install

```bash
dsh plugin --profile <your-profile> add @qrak/dsh-mode-switcher
```

Replace `<your-profile>` with the profile you actually run. The DeepSeek Harness Desktop app keeps its profile at `desktop`, but Electron manages that one, so install it in the UI instead of the CLI: open **Plugins** in the sidebar (Settings only holds the read-only **Built-in plugins** inventory), choose **Add plugin**, enter `@qrak/dsh-mode-switcher` as the package name, and confirm with **Install**.

No build step, no dependencies, nothing to configure after install.

To test a change that is not released yet:

```bash
dsh plugin add git+https://github.com/qrak/dsh-mode-switcher.git#v1.0.3
```

## Usage

1. In **Build**, pick the model and reasoning effort you want for implementation work (for example `high`).
2. Press `Tab` (or click the chip) to enter **Plan** and pick the model/effort for planning (for example `max`).
3. Switch back and forth; each mode is restored automatically, and the chip tooltip shows the saved Plan and Build presets.
4. The presets also apply when the mode changes via `/plan`, `/plan off`, or approving a plan.

The chip replaces the native Plan-only chip, so it is always visible: `🛠️ Build ⇥ Tab` or `📋 Plan ⇥ Tab` (see [Screenshots](#screenshots)).

## Behaviour and limits

- Presets are **global across sessions** and stored in `localStorage` (Desktop `dsh-app://app`) plus the cookie `dsh_mode_switcher_presets_v1` (browser web UI). If both are blocked, they fall back to memory for the page lifetime. Clearing site data resets them; each mode then re-seeds from the model in use.
- Toggle commands are **not echoed into the chat**: the plugin hides the generic `/plan` command rows, so repeated mode switches do not flood the transcript. The chip is the mode indicator.
- DSH saves the selected model as the deployment default as well; after a mode switch, new sessions start with the model of the mode used last. This is host behaviour, not a plugin setting.
- The plugin intercepts `Tab` only while the composer has focus and no completion popup is open. If a future DSH version gives `Tab` a different meaning in the composer, disable the plugin or remove the key listener.
- `Tab` toggles **the composer the caret is in**, resolved from the focused element, not the conversation painted last. With several conversations mounted, a global "last chip" could target the wrong session.
- A second toggle of the same session within `1 s` is ignored, because it would undo the first one and leave a stale "switched to plan mode" notice queued in the chat.
- If the saved model is no longer available, the switch still happens and the warning explains why the model was not restored.

## Compatibility

Built and verified against DSH `0.2.2-rc.1`. It uses the public client surface: `ctx.slots` (`conversation.input.plan`), the `plan` and `modelSelection` projections, `remote.commands.execute`, `remote.session.selectModel`, and `ctx.locale`. A future DSH release may change these; the plugin is versioned and pinned, and the plain `/plan` command keeps working without it.

## Development

```bash
npm run check   # node --check for both entry points
npm test        # node:test, no dependencies
```

The repository has no build step and no runtime dependencies.

## Prior art

The Tab toggle and per-mode model memory were popularized by [gaoyinxin/dsh-mode-switcher](https://github.com/gaoyinxin/dsh-mode-switcher). This repository is an independent implementation under the MIT license; it does not include that project's source, icon, or screenshots.

## License

[MIT](LICENSE) © 2026 qrak
