# D3SOX's T3 Code fork

This fork tracks [upstream T3 Code](https://github.com/pingdotgg/t3code) with these changes:

- Follow-up messages wait until the next tool call finishes by default. You can instead queue after the current turn or steer immediately. Web, desktop, and mobile offer the same timing choices. Queued messages are saved on the server and can be edited, reordered, or sent immediately. Completion notifications wait until the queued turns have finished too.
- Images an agent opens appear in their own timeline rows, even when the rest of the turn is collapsed. Open a row to show its preview, then click the preview to see the full image.
- Images and videos an agent cites appear as previews below its message on web, desktop, and mobile. Videos have playback controls and do not autoplay.
- Mobile shows Nightly sky or Dev blueprint artwork across the full app header by default. In Settings → Appearance → Environment identification, choose Artwork, Pill, or None; the choice is saved on your device.
- The Android usage widget shows each Codex or Claude subscription separately instead of averaging accounts into one bar, without putting account emails on the home screen.
- The Android composer keeps the cursor visible as long messages wrap onto new lines.
- Pinned and Active thread-list sections can be collapsed or expanded. Both start expanded and remember your choice on each client; Done and Input threads, along with the thread you're viewing, stay visible when their section is collapsed.
- Mobile gains the yellow pen and subtle thread highlight for unsent drafts already available upstream on web and desktop. The indicator clears when you send or remove the draft.
- Pull request links open in your system browser by default. On desktop, right-click a link to choose T3 Code instead. When a repository has both `origin` and `upstream`, T3 Code uses `origin` for the fork's pull requests.
- The new-thread button remembers the last project you used, including one chosen in the “What should we build in…” composer. On desktop/web, right-click or Shift-click the sidebar button to choose a different project. The composer shows the selected project's icon beside its name on web, desktop, and mobile.
- On web and desktop, Enter or the send button starts a new thread in the background and opens another draft by default; Ctrl/⌘+Enter opens the submitted thread. Turning off **Settings → General → Start threads in background** reverses these actions. The shortcuts remain configurable.
- Send and interrupt buttons show a loading indicator while the request is pending and prevent duplicate clicks.
- Switching Codex accounts in an existing thread preserves its agent-session context.
- If Codex has archived an idle session, sending a follow-up automatically unarchives it and retries once, keeping the same conversation and context. No manual `codex unarchive` command is needed; update the host/server to use this fix.
- Codex model-capacity failures retry automatically after 10 seconds, then 20, 40, and so on. Web, desktop, and mobile show a countdown with **Cancel retry**. Retries keep your context and remain one T3 turn for checkpoint restore; update both the client and host/server to use this feature.
- Focusing the desktop app clears only the notification for the thread you're viewing, leaving other threads' alerts in your system's notification history. Opening another thread clears its retained alert too. The app's unread badge still resets when you return to T3 Code.
- In-app completion notifications clear when you view their thread and stay hidden while you're viewing it.
- You can turn off automatic thread titles and worktree branch names for the current environment or one project in Settings → Source Control.
- Terminal path clicks open files in T3 Code or workspace folders in its file explorer, including on remote machines. Hold Ctrl or Shift to select path text without opening it. Right-click a URL or path in the terminal for **Copy link** or **Copy path**.
- Terminal close confirmation is optional and off by default under Settings → General → Confirmations. Ctrl+W and Ctrl+D still go to the terminal.
- Product usage collection is off unless you set `T3CODE_TELEMETRY_ENABLED=true` on the server.

## Android nightly

<a href="https://apps.obtainium.imranr.dev/redirect?r=obtainium%3A%2F%2Fapp%2F%257B%2522id%2522%253A%2522com.t3tools.t3code.preview%2522%252C%2522url%2522%253A%2522https%253A%252F%252Fgithub.com%252FD3SOX%252Ft3code%2522%252C%2522author%2522%253A%2522D3SOX%2522%252C%2522name%2522%253A%2522T3%2520Code%2520D3SOX%2522%252C%2522additionalSettings%2522%253A%2522%257B%255C%2522includePrereleases%255C%2522%253Atrue%252C%255C%2522filterReleaseTitlesByRegEx%255C%2522%253A%255C%2522%255ED3SOX%2520nightly%2520r%255B0-9%255D%252B%2524%255C%2522%257D%2522%257D"><img src="./assets/fork/badge-obtainium.png" alt="Get it on Obtainium" width="160" height="62" /></a>

The [nightly releases](https://github.com/D3SOX/t3code/releases) include a signed Android APK. It installs as **T3 Code D3SOX** (`com.t3tools.t3code.preview`) alongside the upstream production app and updates through Obtainium. This build does not use upstream Expo over-the-air updates or export app telemetry. The [Obtainium badge](./assets/fork/badge-obtainium.png) is from the Obtainium project ([GPL-3.0](./assets/fork/LICENSE.obtainium.txt)).

## Arch Linux nightly

The same releases contain a signed `t3code-d3sox-git` package. For automatic updates through pacman, import the [repository signing key](./packaging/aur/t3code-d3sox-git/signing-key.asc) and verify its fingerprint is `5A4D 66D6 9437 77AD 48A5 F169 9728 12D8 A4CF BA4D`:

```bash
wget -O t3code-d3sox.asc https://raw.githubusercontent.com/D3SOX/t3code/main/packaging/aur/t3code-d3sox-git/signing-key.asc
gpg --show-keys --fingerprint t3code-d3sox.asc
sudo pacman-key --add t3code-d3sox.asc
sudo pacman-key --lsign-key 5A4D66D6943777AD48A5F169972812D8A4CFBA4D
```

Add this repository to `/etc/pacman.conf`:

```ini
[t3code-d3sox]
SigLevel = Required
Server = https://d3sox.me/t3code/arch/$arch
```

Then run `sudo pacman -Syu t3code-d3sox-git`. The repository keeps the newest x86_64 package; older builds remain in [GitHub Releases](https://github.com/D3SOX/t3code/releases). The package conflicts with `t3code-bin`, so pacman will ask to replace it.

To build the rolling [`t3code-d3sox-git`](./packaging/aur/t3code-d3sox-git) package yourself instead, use this checkout:

```bash
cd packaging/aur/t3code-d3sox-git
makepkg -si
```

The package uses nightly branding and includes T3 Connect and SSH support. To rebuild later, run `git pull --ff-only` in this checkout and repeat `makepkg -si`.

## Other platforms

Interested in this fork but need releases for another platform? [Open an issue](https://github.com/D3SOX/t3code/issues/new) and let me know which platform you'd like supported.

---

# T3 Code

T3 Code is an "agent harness control surface". It enables control of the agents on your machine with a best-in-class mobile app ([iOS](https://apps.apple.com/us/app/t3-code-remote-claude-more/id6787819824), [Android](https://play.google.com/store/apps/details?id=com.t3tools.t3code)), [web app](https://app.t3.codes) and [Electron-based desktop app](https://t3.codes).

Works with your subscriptions on Claude Code, Codex, Cursor, Grok Build, OpenCode, and Google Antigravity. If they're set up on your computer, T3 Code can control them.

## "Wait, what are you selling me?"

Nothing. We built T3 Code because we wanted the best possible development experience with agents. We were inspired by existing solutions like the Codex desktop app, Conductor, Claude Desktop and Cursor Glass, but none met our bar.

We wanted something performant, remote-ready, and truly open. If we ever go the wrong direction, we want you to have everything you need to fork and build the editor that you want.

## Installation

> [!WARNING]
> T3 Code currently supports Codex, Claude, Cursor, Grok Build, OpenCode, and Antigravity. Install and authenticate at least one provider before use:
>
> - Codex: install [Codex CLI](https://developers.openai.com/codex/cli) and run `codex login`
> - Claude: install [Claude Code](https://claude.com/product/claude-code) and run `claude auth login`
> - Cursor: install [Cursor CLI](https://cursor.com/cli) and run `agent login`
> - Grok Build: install [Grok Build CLI](https://x.ai/cli) and run `grok login`
> - OpenCode: install [OpenCode](https://opencode.ai) and run `opencode auth login`
> - Antigravity: enable it in Settings, then use **Install Antigravity** and **Sign in with Google**. No CLI is required.

### Command line

```bash
curl -fsSL https://t3.codes/install.sh | sh
```

On Windows, in PowerShell:

```powershell
irm https://t3.codes/install.ps1 | iex
```

Then run `t3` to start the server and open the local web app. `t3 service install` keeps it running in the background, `t3 update` moves to a newer release, and `t3 --help` has the full reference.

To try it once without installing, run `npx t3@latest` instead.

### Desktop app

Install the latest version of the desktop app from [GitHub Releases](https://github.com/pingdotgg/t3code/releases), or from your favorite package registry:

#### Windows (`winget`)

```bash
winget install T3Tools.T3Code
```

#### macOS (Homebrew)

```bash
brew install --cask t3-code
```

#### Debian, Ubuntu (`.deb`)

Download the `.deb` from [GitHub Releases](https://github.com/pingdotgg/t3code/releases), then:

```bash
sudo apt install ./T3-Code-*.deb
```

#### Arch Linux (AUR)

Stable:

```bash
yay -S t3code-bin
```

Nightly:

```bash
yay -S t3code-nightly-bin
```

The AUR packaging is maintained in this repository under [`packaging/aur`](./packaging/aur).

## Some notes

We are very very early in this project. Expect bugs.

We are (mostly) not accepting contributions yet. Small fixes may be considered. Big features will not be.

## Documentation

Full docs live in [docs/](./docs). There's no docs site yet.

- [Install and first run](./docs/user/install.md)
- [Permission modes](./docs/user/permission-modes.md)
- [Keyboard shortcuts](./docs/user/keybindings.md)
- [Project settings](./docs/user/project-settings.md)
- [Appearance preferences](./docs/user/appearance.md)
- [Remote access from a phone or another machine](./docs/user/remote-access.md)
- [Connect Claude Code, Codex, ChatGPT and other agents over MCP](./docs/user/outside-agents.md)
- [Keeping app and server in sync](./docs/user/updating.md)
- [Source control integrations](./docs/user/source-control.md)
- Multiple accounts: [Codex](./docs/user/providers-codex.md) · [Claude](./docs/user/providers-claude.md)
- [Run T3 Code as a background service](./docs/user/background-service.md)

Building from source? Start at [docs/internals/overview.md](./docs/internals/overview.md).

## If you REALLY want to contribute still.... read this first

### Install `vp`

T3 Code uses Vite+ so you'll need to install the global `vp` command-line tool.

#### macOS / Linux

```bash
curl -fsSL https://vite.plus | bash
```

#### Windows

```bash
irm https://vite.plus/ps1 | iex
```

Checkout their getting started guide for more information: https://viteplus.dev/guide/

### Install dependencies

```bash
vp i
```

Read [CONTRIBUTING.md](./CONTRIBUTING.md) before reporting a bug or opening a PR.

Have a feature request? Start an [Ideas discussion](https://github.com/pingdotgg/t3code/discussions/categories/ideas).

Need support? Join the [Discord](https://discord.gg/jn4EGJjrvv).
