# D3SOX's T3 Code fork

This fork tracks [upstream T3 Code](https://github.com/pingdotgg/t3code) with these changes:

## Messaging

- Follow-up messages wait until the next tool call finishes by default. You can also queue them after the current turn or steer the agent immediately. All clients offer these choices. The server saves queued messages, which you can edit, reorder, or send immediately. On web and desktop, Up Arrow in an empty composer edits the last queued message. Completion notifications wait until all queued turns finish.
- Editing a queued message pauses the queue until you save or cancel. Saving updates the message in place and keeps its delivery timing. Removing a queued message returns its text and attachments to the composer alongside any existing draft.
- You can keep composing and sending while earlier messages or their attachments wait. Messages queue locally and send in order. Keep web and desktop open until the messages send. Mobile saves its local queue across restarts.
- On web and desktop, Enter or the send button starts a new thread in the background and opens a fresh draft. Ctrl+Enter or Command+Enter opens the submitted thread. Turn off Start threads in background under General in Settings to reverse these actions. You can customize the shortcuts.
- The interrupt button shows a loading indicator until the request finishes.
- Images the agent opens have their own timeline rows, even when the turn is collapsed. Open a row to see its preview, then click the preview to see the full image.
- Images and videos the agent cites have previews below its message on all clients. Videos have playback controls and do not autoplay.
- Local image previews refresh when an agent updates the file and shows it again, or when you reopen its preview. Thread previews keep saved copies so older images remain available after their source files are removed.

## PRs and notifications

- Empty or whitespace-only final replies do not mark the thread Done or trigger completion notifications or sounds. Image-only replies and errors still alert normally.
- Short PR-monitoring updates and intermediate background-job completions do not send completion alerts, play sounds, or mark the thread Done while work continues.
- Awaited background tasks resume the agent even if another notification arrives first. Automatic settlement waits until pending background work finishes, and task completion can wake a settled thread.
- Missing required checks stay pending, including checks that appear later. When the remaining CI checks finish, PR monitoring wakes the agent even if it already reported that the required checks passed. Overlapping CI runs remain pending until they finish, and CI notifications for outdated commits are ignored.
- PR monitoring ignores edits to existing comments and bot status messages, acknowledgements, and rate-limit notices. New human comments, review findings, check results, and conflicts still wake the agent.
- On web and desktop, the same provider usage limit alerts once per environment instead of once per affected thread.
- Agent instructions limit PR links to the task's pull requests. Incidental release-note edits, labels, and coordination updates do not qualify.
- PR links open in your system browser by default. On desktop, right-click a link to open it in T3 Code instead. If a repository has both `origin` and `upstream`, T3 Code uses `origin` for the fork's pull requests.
- Returning to the desktop app clears the viewed thread's system notification and resets the app's unread badge. Other threads' notifications stay in your system history until you open those threads.
- Clicking a desktop notification brings T3 Code to the foreground and opens its thread, even if the window is minimized or hidden.
- In-app notifications disappear when you open their thread, including through the Open action on a background-thread notification. They stay hidden while you view it.

## Navigation and terminals

- On web and desktop, drafts have their own collapsible section at the top of the sidebar. Your device remembers whether it is expanded.
- You can collapse the Pinned and Active sections of the thread list. Each client remembers your choice. Both sections start expanded. Done threads, Input threads, and the thread you are viewing stay visible in collapsed sections.
- You can rearrange Active threads with the Working section enabled, and your order stays saved.
- The sidebar distinguishes background work from active agent turns and shows pending input while the agent is still running. Working threads stay in their section during synchronization.
- The new-thread button remembers the project last selected for a new thread. Opening another chat does not change that choice. On web and desktop, right-click or Shift-click the sidebar button to choose another project. All clients show the selected project's icon beside its name in the composer.
- On web and desktop, choose a machine for threads without a project under General, New threads in Settings. The choice is saved on this device, and the selected machine must be connected.
- Opening or closing Settings and Usage on web and desktop does not add entries to navigation history. Back and Forward keep following your thread navigation.
- On web and desktop, when a sidebar action takes you out of the current thread, you return to a new-thread draft in the same project instead of opening another thread.
- On web and desktop, right-click the Settled section to archive all settled threads, including older threads that are not currently loaded. Several threads archive at once, with one undo action for the batch. This always asks for confirmation, even when individual archive confirmations are turned off.
- Search archived threads under Settings by thread title, branch, project name or path, or environment name.
- In Source Control settings, you can turn off automatic thread titles and worktree branch names for an environment or a project. New worktree branches have no prefix by default. You can set a prefix in the same settings.
- Click a terminal path to open a file in T3 Code or a workspace folder in its file explorer. This also works on remote machines. Hold Ctrl or Shift to select path text without opening it. Right-click a URL or path for Copy link or Copy path.
- Ctrl+Shift+W closes the focused terminal. Terminal close confirmation is off by default. You can enable it under General, Confirmations in Settings. Ctrl+W and Ctrl+D still go to the terminal.

## Appearance

- Choose T3 Code Dim under Appearance in Settings for the previous gray dark-theme colors on every client.
- Turn off Show thread branches under Appearance in Settings for more compact thread rows and more room for thread titles.
- Web and desktop retain the Build/Plan toggle, plan commands, and circular context-window indicator as optional settings under Labs, Legacy.
- Mobile shows Nightly sky or Dev blueprint artwork across the app header by default. Under Appearance, Environment identification in Settings, choose Artwork, Pill, or None. Your device saves the choice.

## Mobile and accounts

- Android offers local notifications without Google services. Enable Background connection under Notifications in Settings to keep alerts and live agent updates working after switching apps. It shows an ongoing notification and stops when you remove T3 from recents.
- Optional UnifiedPush delivers encrypted notifications through a compatible distributor without Google services or a T3 Connect account. Paired hosts must support UnifiedPush.
- Usage shows remaining Codex credits as whole numbers with thousands separators on every client when the provider reports a balance.
- The Android usage widget shows each Codex or Claude subscription separately. It does not average accounts into one bar or show account emails on the home screen. Tap its refresh prompt to open Usage in the app.
- Mobile project filters and the Settings scope picker show project icons.
- The Android composer keeps the cursor visible as long messages wrap onto new lines.
- Mobile marks threads with unsent drafts with a yellow pen and a subtle highlight, as upstream does on web and desktop. Send or remove the draft to clear the indicator.
- Codex capacity retries start after 10 seconds and double the delay on each attempt, with no attempt limit. All clients show a countdown and a Cancel retry button. Retries keep your context and count as one T3 turn for checkpoint restore. Update the client and host server to use this feature.

## Connections and recovery

- Background services installed through the desktop CLI use the installed fork runtime and follow desktop updates.
- After host updates or service restarts, clients retry temporary tunnel errors instead of staying offline until refreshed.
- After a Codex process exits unexpectedly, you can send another turn without restarting the host.
- Storage cleanup can remove clean, merged worktrees after branch renames or a detached checkout, including worktrees with submodules. It checks submodules for local changes and unpublished commits before removal. Repeated submodule-removal failures do not produce a warning on every sweep.

## Privacy

- Product usage collection is off unless you set `T3CODE_TELEMETRY_ENABLED=true` on the server.
- The app no longer asks you to star its GitHub repository.

## Android nightly

<a href="https://apps.obtainium.imranr.dev/redirect?r=obtainium%3A%2F%2Fapp%2F%257B%2522id%2522%253A%2522com.t3tools.t3code.preview%2522%252C%2522url%2522%253A%2522https%253A%252F%252Fgithub.com%252FD3SOX%252Ft3code%2522%252C%2522author%2522%253A%2522D3SOX%2522%252C%2522name%2522%253A%2522T3%2520Code%2520D3SOX%2522%252C%2522additionalSettings%2522%253A%2522%257B%255C%2522includePrereleases%255C%2522%253Atrue%252C%255C%2522filterReleaseTitlesByRegEx%255C%2522%253A%255C%2522%255ED3SOX%2520nightly%2520r%255B0-9%255D%252B%2524%255C%2522%257D%2522%257D"><img src="./assets/fork/badge-obtainium.png" alt="Get it on Obtainium" width="160" height="62" /></a>

The [nightly releases](https://github.com/D3SOX/t3code/releases) include a signed Android APK. It installs as **T3 Code D3SOX** (`com.t3tools.t3code.preview`) alongside the upstream production app and updates through Obtainium. This build does not use upstream Expo over-the-air updates or export app telemetry. The [Obtainium badge](./assets/fork/badge-obtainium.png) is from the Obtainium project ([GPL-3.0](./assets/fork/LICENSE.obtainium.txt)).

## Arch Linux nightly

The same releases contain a signed `t3code-d3sox-git` package. For automatic updates through pacman, import the [repository signing key](./packaging/aur/t3code-d3sox-git/signing-key.asc) and verify its fingerprint is `5A4D 66D6 9437 77AD 48A5 F169 9728 12D8 A4CF BA4D`:

```bash
curl -fsSL -o t3code-d3sox.asc https://raw.githubusercontent.com/D3SOX/t3code/main/packaging/aur/t3code-d3sox-git/signing-key.asc
gpg --show-keys --fingerprint t3code-d3sox.asc
```

Only after the fingerprint matches, trust the key for packages from this repository:

```bash
sudo pacman-key --add t3code-d3sox.asc
sudo pacman-key --lsign-key 5A4D66D6943777AD48A5F169972812D8A4CFBA4D
```

Configure the repository and install the package:

```bash
sudo pacman-conf --repo-list | grep -qxF 't3code-d3sox' ||
  printf '%s\n' '' '[t3code-d3sox]' 'SigLevel = Required' \
    'Server = https://t3code.d3sox.me/arch/$arch' |
  sudo tee -a /etc/pacman.conf >/dev/null
sudo pacman -Syu t3code-d3sox-git
```

The command adds the repository only if it is missing. Keep the single quotes so `$arch` reaches pacman literally. It works in bash, zsh, and fish. Future nightly updates arrive with your normal pacman updates. The repository keeps the newest x86_64 package; older builds remain in [GitHub Releases](https://github.com/D3SOX/t3code/releases). The package conflicts with `t3code-bin`, so pacman will ask to replace it.

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

<h1 align="center">T3 Code</h1>

<p align="center">The open-source control plane for coding agents.</p>

<p align="center">
  <a href="https://t3.codes/download"><strong>Download</strong></a> ·
  <a href="https://apps.apple.com/us/app/t3-code-remote-claude-more/id6787819824">iOS</a> ·
  <a href="https://play.google.com/store/apps/details?id=com.t3tools.t3code">Android</a> ·
  <a href="https://app.t3.codes">Web</a> ·
  <a href="./docs/README.md">Docs</a> ·
  <a href="https://discord.gg/jn4EGJjrvv">Discord</a>
</p>

<p align="center">
  <a href="https://t3.codes">
    <img src="./.github/readme/hero.webp" width="100%" alt="T3 Code on desktop with a finished Claude thread, next to the phone app asking to approve a command from Codex" />
  </a>
</p>

T3 Code runs the coding agents on your machine and gives them one fast interface. Start a thread at your desk, then approve the next step from your phone.

It works with Claude Code, Codex, Cursor, OpenCode, Grok Build, Antigravity, Kiro, Pi, Muse Code, fx, and any [ACP](./docs/user/providers-acp.md) agent. If an agent is set up on your computer, T3 Code can control it.

## What you get

- **Your subscriptions.** T3 Code does not resell tokens. It drives the agents you are already signed in to.
- **Every agent in one place.** Change models in the middle of a thread. Let Claude hand a task to Codex.
- **Desktop, web, and phone.** One server, and every client shows the same threads. There are apps for iOS and Android.
- **Remote ready.** Run agents on any machine. Connect over your local network, Tailscale, or [T3 Connect](./docs/user/remote-access.md).
- **Git built in.** Each thread can work in its own worktree. Review the diff, then commit, push, and open a pull request with one button.
- **Fast.** Performance is a feature here. We measure it, and we treat a dropped frame as a bug.
- **Open.** MIT licensed. If you don't like something, fork it.

## Install

### Desktop app

[Download T3 Code](https://t3.codes/download) for macOS, Windows, or Linux. You can also use a package manager:

| Platform       | Command                                                              |
| -------------- | -------------------------------------------------------------------- |
| macOS          | `brew install --cask t3-code`                                        |
| Windows        | `winget install T3Tools.T3Code` or `scoop install extras/t3code`     |
| Arch Linux     | `yay -S t3code-bin`                                                  |
| Nix            | `nix profile add github:NixOS/nixpkgs/nixos-unstable#t3code`         |
| Debian, Ubuntu | `.deb` from [Releases](https://github.com/pingdotgg/t3code/releases) |

### Command line

This installs the `t3` command. Run `t3` to start the server and open the web app.

```bash
curl -fsSL https://t3.codes/install.sh | sh
```

On Windows, in PowerShell:

```powershell
irm https://t3.codes/install.ps1 | iex
```

To try it once without an install, run `npx t3@latest`.

### Phone

Get the app from the [App Store](https://apps.apple.com/us/app/t3-code-remote-claude-more/id6787819824) or [Google Play](https://play.google.com/store/apps/details?id=com.t3tools.t3code). Then follow [remote access](./docs/user/remote-access.md) to connect it to your computer.

### Sign in to an agent

T3 Code needs one agent that is installed and signed in. For example, install [Claude Code](https://claude.com/product/claude-code) and run `claude auth login`, or install [Codex CLI](https://developers.openai.com/codex/cli) and run `codex login`.

[Provider setup](./docs/user/install.md#providers) has the steps for each agent. [Install T3 Code](./docs/user/install.md) covers nightly builds, AppImage, WSL, and NixOS.

## "Wait, what are you selling me?"

Nothing. We built T3 Code because we wanted the best possible development experience with agents. We were inspired by existing solutions like the Codex desktop app, Conductor, Claude Desktop and Cursor Glass, but none met our bar.

We wanted something performant, remote-ready, and truly open. If we ever go the wrong direction, we want you to have everything you need to fork and build the tool that you want.

## Documentation

- [Install and first run](./docs/user/install.md)
- [Remote access from a phone or another machine](./docs/user/remote-access.md)
- [Permission modes](./docs/user/permission-modes.md)
- [Source control](./docs/user/source-control.md)
- [Connect outside agents over MCP](./docs/user/outside-agents.md)
- [FAQ](./docs/user/faq.md)

[All docs](./docs/README.md) has the full list.

## Contributing

We have limited review capacity. Small, focused fixes are the most likely to be merged. Features need an approved discussion first.

- Read [CONTRIBUTING.md](./CONTRIBUTING.md) before you report a bug or open a pull request.
- Put feature requests in [Ideas](https://github.com/pingdotgg/t3code/discussions/categories/ideas).
- Build from source with the [development runbook](./docs/operations/development.md#first-checkout). The [architecture overview](./docs/internals/overview.md) explains how it works.
- Get help in [Discord](https://discord.gg/jn4EGJjrvv).

## License

[MIT](./LICENSE)
