# D3SOX's T3 Code fork

This fork tracks [upstream T3 Code](https://github.com/pingdotgg/t3code) with these changes:

## Messaging

- Follow-up messages wait until the next tool call finishes by default. You can also queue them after the current turn or steer the agent immediately. All clients offer these choices. The server saves queued messages, which you can edit, reorder, or send immediately. On web and desktop, Up Arrow in an empty composer edits the last queued message. Completion notifications wait until all queued turns finish.
- Editing a queued message pauses the queue until you save or cancel. Saving updates the message in place and keeps its delivery timing. Removing a queued message returns its text and attachments to the composer alongside any existing draft.
- You can send or queue messages before attachments finish uploading or an earlier send finishes. They wait locally and send in order. You can keep composing while they wait. Keep web and desktop open until the messages send. Mobile saves its local queue across restarts.
- On web and desktop, Enter or the send button starts a new thread in the background and opens a fresh draft. Ctrl+Enter or Command+Enter opens the submitted thread. Turn off Start threads in background under General in Settings to reverse these actions. You can customize the shortcuts.
- Send and interrupt buttons show a loading indicator while requests are pending. You can submit another message while an earlier send is pending.
- Images the agent opens have their own timeline rows, even when the turn is collapsed. Open a row to see its preview, then click the preview to see the full image.
- Images and videos the agent cites have previews below its message on all clients. Videos have playback controls and do not autoplay.
- Local image previews refresh when an agent updates the file and shows it again, or when you reopen its preview.

## PRs and notifications

- Empty or whitespace-only final replies do not mark the thread Done or trigger completion notifications or sounds. Image-only replies and errors still alert normally.
- Short PR-monitoring updates do not send completion alerts, play sounds, or mark the thread Done while monitoring continues.
- Missing required checks stay pending, including checks that appear later. When the remaining CI checks finish, PR monitoring wakes the agent even if it already reported that the required checks passed.
- Agent instructions limit PR links to the task's pull requests. Incidental release-note edits, labels, and coordination updates do not qualify.
- PR links open in your system browser by default. On desktop, right-click a link to open it in T3 Code instead. If a repository has both `origin` and `upstream`, T3 Code uses `origin` for the fork's pull requests.
- Returning to the desktop app clears the viewed thread's system notification and resets the app's unread badge. Other threads' notifications stay in your system history until you open those threads.
- Clicking a desktop notification brings T3 Code to the foreground and opens its thread, even if the window is minimized or hidden.
- In-app completion notifications disappear when you view their thread. They stay hidden while you view it.

## Navigation and terminals

- You can collapse the Pinned and Active sections of the thread list. Each client remembers your choice. Both sections start expanded. Done threads, Input threads, and the thread you are viewing stay visible in collapsed sections.
- Turn off Show thread branches under Appearance in Settings for more compact thread rows and more room for thread titles.
- You can rearrange Active threads with the Working section enabled, and your order stays saved.
- The new-thread button remembers your last project, including one selected in the new-thread composer. On web and desktop, right-click or Shift-click the sidebar button to choose another project. All clients show the selected project's icon beside its name in the composer.
- On web and desktop, when a sidebar action takes you out of the current thread, you return to a new-thread draft in the same project instead of opening another thread.
- On web and desktop, right-click the Settled section to archive all settled threads. This always asks for confirmation, even when individual archive confirmations are turned off.
- In Source Control settings, you can turn off automatic thread titles and worktree branch names for an environment or a project. New worktree branches have no prefix by default. You can set a prefix in the same settings.
- Click a terminal path to open a file in T3 Code or a workspace folder in its file explorer. This also works on remote machines. Hold Ctrl or Shift to select path text without opening it. Right-click a URL or path for Copy link or Copy path.
- Ctrl+Shift+W closes the focused terminal. Terminal close confirmation is off by default. You can enable it under General, Confirmations in Settings. Ctrl+W and Ctrl+D still go to the terminal.

## Mobile and accounts

- Mobile shows Nightly sky or Dev blueprint artwork across the app header by default. Under Appearance, Environment identification in Settings, choose Artwork, Pill, or None. Your device saves the choice.
- The Android usage widget shows each Codex or Claude subscription separately. It does not average accounts into one bar or show account emails on the home screen.
- The Android composer keeps the cursor visible as long messages wrap onto new lines.
- Mobile marks threads with unsent drafts with a yellow pen and a subtle highlight, as upstream does on web and desktop. Send or remove the draft to clear the indicator.
- Switching Codex accounts in a thread keeps its agent-session context.
- If Codex archives an idle session, your next follow-up unarchives it and retries once with the same conversation and context. You do not need to run `codex unarchive`. Update the host server to use this fix.
- Codex model-capacity failures retry after 10 seconds, then 20, 40, and so on. All clients show a countdown and a Cancel retry button. Retries keep your context and count as one T3 turn for checkpoint restore. Update the client and host server to use this feature.

## Privacy

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
Server = https://t3code.d3sox.me/arch/$arch
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
