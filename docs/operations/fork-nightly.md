# D3SOX nightly packages

`.github/workflows/fork-nightly.yml` runs daily at 03:17 UTC and can be started with `gh workflow run fork-nightly.yml --ref main`. A scheduled run skips commits already released as `d3sox-nightly-r<commit-count>` and commits that only change documentation, the landing page, or other explicitly excluded non-build files since the last release. A manual run always rebuilds. The Android and Arch jobs must both succeed before the workflow publishes a GitHub prerelease and a signed pacman repository artifact.

`.github/workflows/fork-pages.yml` deploys that artifact to GitHub Pages after a successful nightly build. Landing-page or Pages-workflow changes on `main` deploy separately: the workflow reuses the latest signed repository artifact and overlays the current `packaging/pages/index.html`. It can also be started manually with `gh workflow run fork-pages.yml --ref main`. A skipped nightly run has no new artifact and does not redeploy Pages.

The Arch `PKGBUILD` normally follows `main`. CI sets `T3CODE_SOURCE_COMMIT` so its package uses the exact workflow commit. The Pages repository at `https://t3code.d3sox.me/arch/x86_64` contains only the newest package and a signed pacman database. GitHub Releases keep older package files and the Android APKs.

The workflow needs three repository secrets:

- `D3SOX_ANDROID_KEYSTORE`: base64-encoded PKCS#12 keystore containing alias `t3code-d3sox`.
- `D3SOX_ANDROID_KEYSTORE_PASSWORD`: password for that keystore and alias.
- `D3SOX_ARCH_GPG_KEY`: armored secret key for fingerprint `5A4D66D6943777AD48A5F169972812D8A4CFBA4D`.

The initial keys were generated for this fork. Back up `~/.local/share/t3code-d3sox/signing/` from the setup machine somewhere private: it holds the Android keystore and password, the Arch secret key, and its revocation certificate. GitHub secrets cannot be read back. Losing the Android key prevents updating the existing `com.t3tools.t3code.preview` installation; replacing the Arch key requires users to import and trust the new public key. Never commit private signing material.

The Android build uses the upstream preview package ID and link scheme so T3 Connect sign-in works, but has this fork's app name and signing key. It disables upstream Expo OTA updates, and signs the APK after the local Gradle build. Its version code is the first-parent-independent Git commit count, which increases on `main` even across merges. The public Arch key is tracked at `packaging/aur/t3code-d3sox-git/signing-key.asc` and must match the imported secret key.

The inherited upstream release, deployment, preview, and Blacksmith-backed workflows are manually disabled on this fork. `Issue Labels`, `PR Size`, and `PR Vouch` remain active because they use GitHub-hosted runners and do not need upstream service credentials. Keep those disabled workflows off until their runners, secrets, and publishing targets are deliberately adapted for the fork. The repository-wide Actions setting must be enabled for the nightly workflow to run.
