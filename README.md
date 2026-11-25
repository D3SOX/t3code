# D3SOX's T3 Code fork

This is my fork of [T3 Code](https://github.com/pingdotgg/t3code). It stays in sync with upstream and adds the changes below. Platforms are noted where a change doesn't apply to every client.

## Messages and the queue

- **Queue after the next tool call.** Besides upstream's Queue and Steer, a follow-up can wait for the agent's next tool call, and that's the default. Ctrl+Enter (Cmd+Enter on macOS) switches between that and waiting for the turn to end. Slash commands always wait for the turn. This needs the fork's server on the host.
- **Queue controls.** Queued messages sit above the composer. Drag them into a new order, change their timing, or turn one into a steer. You get one completion notification once the whole queue is done.
- **Queue editing.** On web and desktop, press Up in an empty composer to edit the last queued message. Editing pauses the queue until you save or cancel. Removing a message puts its text and attachments back in the composer.
- **Send while uploads run.** On web and desktop, you can send before uploads or an earlier send finish. Messages wait on your device and go out in order. Keep the tab or window open until they're sent.
- **New threads start in the background.** On web and desktop, sending from a new-thread draft starts the thread and gives you a fresh draft, and Ctrl+Enter opens the thread instead. Turn off Settings → General → Start threads in background to swap the two.
- **Interrupt feedback.** The interrupt button shows a spinner until the interrupt goes through.

## Images

- **Viewed images.** Images the agent opens get their own row in the timeline, even inside a collapsed turn. The Only viewed images tool call visibility hides every other tool call but keeps these rows.
- **Media previews.** Images and videos the agent references show up as previews under its message on every client. Videos don't autoplay.
- **Current and kept copies.** If the agent changes a local image and shows it again, you see the new version. Threads keep their own copies, so older images still load after the original files are gone.

## Notifications and pull requests

- **No alerts for nothing.** Empty replies, short PR-monitoring updates, and background jobs that finish mid-task don't mark a thread Done, notify you, or play a sound. Image-only replies and errors still notify you.
- **Background work.** Any running background command keeps a thread from settling, not only work the agent says it's waiting on. The task's result wakes the agent even if another notification arrives first, and it can wake a thread that already settled.
- **Watching PRs section.** Threads waiting on a watched pull request get their own sidebar section on every client, separate from Active, and stay there after checks finish.
- **PR wakes that matter.** Missing required checks, checks that show up later, and overlapping CI runs count as pending, and the agent wakes again when they finish. New comments from people, review findings, and bot approvals wake it too, and so does a review bot that finishes its check or only reacts to the PR description. Comment edits, bot status messages, acknowledgements, rate-limit notices, and updates for outdated commits don't.
- **PR links.** Agents link only the PRs that belong to their task. PR links open in your system browser, and on desktop you can right-click one to open it in T3 Code. In a repository with both `origin` and `upstream`, T3 Code uses `origin` for your fork's pull requests.
- **Desktop notifications.** Clicking one brings T3 Code to the front and opens its thread, even if the window is minimized or hidden. Switching back to the app clears the notification for the thread you're looking at and resets the unread badge. Notifications for other threads stay until you open them.
- **In-app notifications.** They disappear when you open their thread and stay hidden while you're there. A provider usage limit alerts you once per environment instead of once per thread.

## Sidebar and navigation

- **Collapsible sections.** On web and desktop, drafts get their own section at the top of the sidebar. Pinned and Active collapse too, and each client remembers your choice. Threads that are Done, need input, or are open stay visible in a collapsed section.
- **Your own order.** With the Working section enabled, you can drag Active threads into your own order.
- **Clearer status.** Background work looks different from a running turn, and a thread shows when it needs input even while it's still running. Working threads stay in their section while the client syncs.
- **New-thread project.** The new-thread button remembers the project you last picked for a new thread, and opening some other chat doesn't change it. On web and desktop, right-click or Shift-click the button to pick another project. The composer shows the project's icon next to its name.
- **Machine for threads without a project.** On web and desktop, pick it per device in Settings → General → New threads.
- **Cleaner history.** On web and desktop, opening Settings or Usage doesn't add Back and Forward entries. When a sidebar action takes you out of the current thread, you land on a new-thread draft in the same project.
- **Archive in bulk.** On web and desktop, right-click the Settled section to archive every settled thread, including older ones that aren't loaded yet. It always asks first, and one undo brings them all back.
- **Archived thread search.** Search archived threads in Settings by title, branch, project name or path, or environment name.
- **Unpin confirmation.** Unpinning asks first by default. Turn it off in Settings → General.

## Source control and terminals

- **Optional generated names.** In Settings → Source Control, you can turn off generated thread titles and worktree branch names for an environment or a single project. New worktree branches have no prefix by default.
- **Scheduled task branches.** Scheduled tasks default to the repository's default branch instead of `main`.
- **Clickable terminal paths.** Click a path in the terminal to open the file in T3 Code or show the folder in its file explorer, also on remote machines. Hold Ctrl or Shift to select the text instead. Right-click a URL or path to copy it.
- **Terminal shortcuts.** Ctrl+Shift+W closes the focused terminal, so Ctrl+W and Ctrl+D still reach the program running in it. Closing doesn't ask first unless you turn that on in Settings → General → Confirmations.

## Appearance

- **T3 Code Dim.** This theme in Settings → Appearance brings back the old gray dark colors on every client.
- **Thread branches.** Thread rows show their branch. Turn off Show thread branches in Settings → Appearance for slimmer rows and more room for titles.
- **Legacy controls.** On web and desktop, the Build/Plan toggle, plan commands, and the round context-window indicator are opt-in settings in Labs → Legacy.
- **Environment artwork.** On mobile, the app header shows Nightly sky or Dev blueprint artwork. Switch to a pill or turn it off in Settings → Appearance → Environment identification.

## Mobile

- **Notifications without Google services.** On Android, turn on Background connection in Settings → Notifications to keep getting alerts and live agent updates after you switch apps. Android shows an ongoing notification while it's on. It stops when you swipe T3 away from recents.
- **UnifiedPush.** Android can also get encrypted push notifications through any UnifiedPush distributor. This needs neither Google services nor a T3 Connect account, but your paired hosts have to support it.
- **Usage widget.** The Android widget gives each Codex and Claude subscription its own bar instead of averaging them, and keeps account emails off your home screen. Tap its refresh prompt to open Usage.
- **Draft markers.** Threads with unsent drafts get a yellow pen and a light highlight, like on web and desktop.
- **Smaller fixes.** Project filters and the Settings scope picker show project icons, and the Android composer keeps the cursor in view as long messages wrap.

## Providers and hosting

- **Codex capacity retries.** When Codex is out of capacity, T3 Code retries after 10 seconds and doubles the wait each time. Every client shows a countdown and a Cancel retry button. Retries keep your context and count as one turn for checkpoint restore.
- **Codex credits.** When the provider reports a balance, Usage shows your remaining Codex credits on every client.
- **Codex crashes.** If a Codex process crashes, you can send your next turn without restarting the host.
- **Desktop CLI services.** Background services installed with the desktop CLI run the installed fork and update along with the desktop app.
- **Tunnel recovery.** After a host update or service restart, clients retry temporary tunnel errors instead of staying offline until you refresh.
- **Worktree cleanup.** Storage cleanup also removes clean, merged worktrees whose branch was renamed or whose checkout is detached, including ones with submodules. It checks the submodules for uncommitted changes and unpushed commits first.

## Privacy

- Product analytics are off unless you set `T3CODE_TELEMETRY_ENABLED=true` on the server.
- The app doesn't ask you to star its GitHub repository.

## Android nightly

<a href="https://apps.obtainium.imranr.dev/redirect?r=obtainium%3A%2F%2Fapp%2F%257B%2522id%2522%253A%2522com.t3tools.t3code.preview%2522%252C%2522url%2522%253A%2522https%253A%252F%252Fgithub.com%252FD3SOX%252Ft3code%2522%252C%2522author%2522%253A%2522D3SOX%2522%252C%2522name%2522%253A%2522T3%2520Code%2520D3SOX%2522%252C%2522additionalSettings%2522%253A%2522%257B%255C%2522includePrereleases%255C%2522%253Atrue%252C%255C%2522filterReleaseTitlesByRegEx%255C%2522%253A%255C%2522%255ED3SOX%2520nightly%2520r%255B0-9%255D%252B%2524%255C%2522%257D%2522%257D"><img src="./assets/fork/badge-obtainium.png" alt="Get it on Obtainium" width="160" height="62" /></a>

Every [nightly release](https://github.com/D3SOX/t3code/releases) has a signed Android APK. It installs as **T3 Code D3SOX** (`com.t3tools.t3code.preview`) next to the regular T3 Code app, and Obtainium keeps it up to date. It doesn't use upstream's Expo over-the-air updates and doesn't send app telemetry. The [Obtainium badge](./assets/fork/badge-obtainium.png) comes from the Obtainium project ([GPL-3.0](./assets/fork/LICENSE.obtainium.txt)).

## Arch Linux nightly

The same releases have a signed `t3code-d3sox-git` package, and a pacman repository serves the newest one. To use it, download the [repository signing key](./packaging/aur/t3code-d3sox-git/signing-key.asc) and check that its fingerprint is `5A4D 66D6 9437 77AD 48A5 F169 9728 12D8 A4CF BA4D`:

```bash
curl -fsSL -o t3code-d3sox.asc https://raw.githubusercontent.com/D3SOX/t3code/main/packaging/aur/t3code-d3sox-git/signing-key.asc
gpg --show-keys --fingerprint t3code-d3sox.asc
```

Once the fingerprint matches, add the key to pacman and trust it for this repository's packages:

```bash
sudo pacman-key --add t3code-d3sox.asc
sudo pacman-key --lsign-key 5A4D66D6943777AD48A5F169972812D8A4CFBA4D
```

Then add the repository and install the package:

```bash
sudo pacman-conf --repo-list | grep -qxF 't3code-d3sox' ||
  printf '%s\n' '' '[t3code-d3sox]' 'SigLevel = Required' \
    'Server = https://t3code.d3sox.me/arch/$arch' |
  sudo tee -a /etc/pacman.conf >/dev/null
sudo pacman -Syu t3code-d3sox-git
```

This adds the repository only if it isn't configured yet, and works in bash, zsh, and fish. Keep the single quotes so pacman gets `$arch` as written. From then on, nightlies arrive with your regular pacman updates. The repository only has the latest x86_64 build. Older builds stay on [GitHub Releases](https://github.com/D3SOX/t3code/releases). The package conflicts with `t3code-bin`, so pacman will offer to replace it.

To build the rolling [`t3code-d3sox-git`](./packaging/aur/t3code-d3sox-git) package from this checkout instead:

```bash
cd packaging/aur/t3code-d3sox-git
makepkg -si
```

It uses the nightly branding and includes T3 Connect and SSH support. To update it, run `git pull --ff-only` in the checkout and `makepkg -si` again.

## Other platforms

Want this fork on another platform? [Open an issue](https://github.com/D3SOX/t3code/issues/new) and tell me which one.

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
- **Open.** Source code is MIT licensed. If you don't like something, fork it under your own branding (see [Trademarks and forks](#trademarks-and-forks)).

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

We wanted something performant, remote-ready, and truly open. If we ever go the wrong direction, we want you to have everything you need to fork the source code and build the tool that you want, under your own name and branding.

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
- Build from source with the [development runbook](./docs/operations/00_development.md#first-checkout). The [architecture overview](./docs/internals/01_architecture.md) explains how it works.
- Get help in [Discord](https://discord.gg/jn4EGJjrvv).

## License

The source code in this repository is licensed under the [MIT License](./LICENSE).

## Trademarks and forks

The MIT license applies **only to the source code**. It does not grant any rights to T3 Tools, Inc.'s trademarks, branding, or trade dress, including the **T3 Code** name, wordmark, logos, and application icons.

If you fork, redistribute, or build on T3 Code's source code:

- **Use your own branding.** Replace the T3 Code name, wordmark, logos, and application icons in any public fork, redistributed build, website, package, or app store listing.
- **Be explicitly clear that your project is unofficial.** Do not use the T3 Code name, wordmark, logo, or branding in your own projects without making it unmistakably clear that your project is unofficial and not affiliated with or endorsed by T3 Tools, Inc.

Using our name, wordmark, logo, or branding in a way that suggests official status or affiliation is trademark infringement and unlawful. **Any project indicating or implying that it is an official version of T3 Code when it is not will be pursued to the full extent of the law.**

See [TRADEMARK.md](./TRADEMARK.md) for the full trademark and branding policy.
