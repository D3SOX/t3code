# D3SOX's T3 Code fork

This is my fork of [T3 Code](https://github.com/pingdotgg/t3code). It stays in sync with upstream and adds the changes below.

## Messaging

- Messages you send while the agent is working go into a queue. By default, each one is delivered after the current tool call. On every client you can also hold a message until the turn ends, or steer the agent with it right away. The server keeps the queue, so you can edit, reorder, or send any message early. On web and desktop, press Up in an empty composer to edit the last queued message. You get one completion notification once the whole queue is done.
- Editing a queued message pauses the queue until you save or cancel. A saved message keeps its place and delivery timing. Removing one puts its text and attachments back in the composer, next to whatever you had already typed.
- You don't have to wait for earlier messages or uploads before sending more. New messages queue on your device and go out in order. Web and desktop have to stay open until they're sent. Mobile keeps the queue across restarts.
- On web and desktop, sending from a new-thread draft starts the thread in the background and gives you a fresh draft, so you can start several threads in a row. Ctrl+Enter (Cmd+Enter on macOS) sends and opens the thread. Turn off Start threads in background in Settings → General to swap the two. Both shortcuts can be rebound.
- The interrupt button shows a spinner until the interrupt goes through.
- Images the agent opens get their own row in the timeline, even inside a collapsed turn. Expand the row to see a preview, and click the preview for the full image.
- Images and videos the agent references show up as previews under its message on every client. Videos have playback controls and don't autoplay.
- If the agent changes a local image and shows it again, or you reopen its preview, you see the new version. Threads keep their own copies, so older images still load after the original files are gone.

## PRs and notifications

- A final reply that is empty or only whitespace doesn't mark the thread Done, send a notification, or play a sound. Image-only replies and errors still notify you.
- Short PR-monitoring updates and background jobs that finish mid-task don't count as completion either. The thread stays unmarked and quiet while work continues.
- When the agent is waiting on a background task, that task's result wakes it even if another notification arrives first. Threads don't settle while background work is pending, and a finished task can wake a thread that has already settled.
- PR monitoring treats missing required checks as pending, including checks that only show up later. When the remaining checks finish, it wakes the agent again, even if the agent already reported that the required ones passed. Overlapping CI runs stay pending until they finish, and notifications for outdated commits are ignored.
- PR monitoring ignores comment edits, bot status messages, acknowledgements, and rate-limit notices. New comments from people, review findings, check results, and merge conflicts still wake the agent.
- On web and desktop, hitting a provider usage limit alerts you once per environment, not once for every thread it affects.
- Agents are told to link only the PRs that belong to their task, not PRs they touched for release notes, labels, or coordination.
- PR links open in your system browser. On desktop, right-click a link to open it inside T3 Code instead. In a repository with both `origin` and `upstream`, T3 Code uses `origin` for your fork's pull requests.
- Switching back to the desktop app clears the system notification for the thread you're looking at and resets the unread badge. Notifications for other threads stay in your notification history until you open those threads.
- Clicking a desktop notification brings T3 Code to the front and opens its thread, even if the window is minimized or hidden.
- In-app notifications disappear when you open their thread, including through the Open button on a background-thread notification, and stay hidden while you're there.

## Navigation and terminals

- On web and desktop, drafts get their own collapsible section at the top of the sidebar. Each device remembers whether it's open.
- You can collapse the Pinned and Active sections too. They start expanded, and each client remembers your choice. Threads that are Done, need input, or are open right now stay visible in a collapsed section.
- With the Working section enabled, you can drag Active threads into your own order, and the order is saved.
- The sidebar shows background work differently from a running turn, and shows when the agent needs input even while it's still running. Working threads stay in their section while the client syncs.
- The new-thread button remembers the project you last picked for a new thread. Opening some other chat doesn't change it. On web and desktop, right-click or Shift-click the button to pick a different project. Every client shows the project's icon next to its name in the composer.
- On web and desktop, you can pick the machine for threads without a project in Settings → General → New threads. The choice is saved per device, and that machine has to be connected.
- On web and desktop, opening and closing Settings or Usage doesn't add history entries, so Back and Forward keep moving through your threads.
- On web and desktop, when a sidebar action takes you out of the current thread, you land on a new-thread draft in the same project instead of in some other thread.
- On web and desktop, right-click the Settled section to archive every settled thread, including older ones that aren't loaded yet. They're archived together with a single undo. This always asks first, even if you turned off archive confirmations.
- In Settings, you can search archived threads by title, branch, project name or path, or environment name.
- In Settings → Source Control, you can turn off generated thread titles and worktree branch names for an environment or a single project. New worktree branches have no prefix by default. You can set one in the same place.
- Click a path in the terminal to open the file in T3 Code, or to show a workspace folder in T3 Code's file explorer. This works on remote machines too. Hold Ctrl or Shift to select the text instead of opening it. Right-click a URL or path to copy it.
- Ctrl+Shift+W closes the focused terminal without asking. To get a confirmation prompt, turn it on in Settings → General → Confirmations. Ctrl+W and Ctrl+D still go to the program running in the terminal.

## Appearance

- The T3 Code Dim theme in Settings → Appearance brings back the old gray dark colors on every client.
- Turn off Show thread branches in Settings → Appearance for slimmer thread rows and more room for titles.
- On web and desktop, the Build/Plan toggle, plan commands, and the round context-window indicator are still there as opt-in settings in Labs → Legacy.
- On mobile, the app header shows Nightly sky or Dev blueprint artwork by default. You can switch to a pill or turn it off in Settings → Appearance → Environment identification. Each device keeps its own choice.

## Mobile and accounts

- Android notifications work without Google services. Turn on Background connection in Settings → Notifications to keep getting alerts and live agent updates after you switch apps. While it's on, Android shows an ongoing notification. It stops when you swipe T3 away from recents.
- You can also get encrypted push notifications through UnifiedPush with any compatible distributor. This needs neither Google services nor a T3 Connect account, but your paired hosts have to support UnifiedPush.
- When the provider reports a balance, Usage shows your remaining Codex credits as whole numbers with thousands separators on every client.
- The Android usage widget gives each Codex and Claude subscription its own bar instead of averaging them, and keeps account emails off your home screen. Tap its refresh prompt to open Usage in the app.
- On mobile, project filters and the Settings scope picker show project icons.
- The Android composer keeps the cursor in view as long messages wrap.
- On mobile, threads with unsent drafts get a yellow pen and a light highlight, like upstream already does on web and desktop. Sending or deleting the draft clears it.
- When Codex is out of capacity, T3 Code keeps retrying. The first retry comes after 10 seconds, and the wait doubles each time. Every client shows a countdown and a Cancel retry button. Retries keep your context and count as one turn for checkpoint restore. This needs an up-to-date client and host.

## Connections and recovery

- Background services installed with the desktop CLI run the installed fork and update along with the desktop app.
- After a host update or service restart, clients retry temporary tunnel errors instead of staying offline until you refresh.
- If a Codex process crashes, you can send your next turn without restarting the host.
- Storage cleanup also removes clean, merged worktrees whose branch was renamed or whose checkout is detached, including worktrees with submodules. It first checks the submodules for uncommitted changes and unpushed commits. If a submodule can't be removed, you get the warning once instead of on every cleanup run.

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
