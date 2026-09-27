# D3SOX nightly packages

`.github/workflows/fork-nightly.yml` runs daily at 03:17 UTC and can be started with `gh workflow run fork-nightly.yml --ref main`. A scheduled run skips a commit that already has a `d3sox-nightly-r<commit-count>` release; a manual run rebuilds and replaces its assets. The Android and Arch jobs must both succeed before the workflow publishes a GitHub prerelease or replaces the pacman repository on GitHub Pages.

The Arch `PKGBUILD` normally follows `main`. CI sets `T3CODE_SOURCE_COMMIT` so its package uses the exact workflow commit. The Pages repository at `https://d3sox.github.io/t3code/arch/x86_64` contains only the newest package and a signed pacman database. GitHub Releases keep older package files and the Android APKs.

The workflow needs three repository secrets:

- `D3SOX_ANDROID_KEYSTORE`: base64-encoded PKCS#12 keystore containing alias `t3code-d3sox`.
- `D3SOX_ANDROID_KEYSTORE_PASSWORD`: password for that keystore and alias.
- `D3SOX_ARCH_GPG_KEY`: armored secret key for fingerprint `5A4D66D6943777AD48A5F169972812D8A4CFBA4D`.

The initial keys were generated for this fork. Back up `~/.local/share/t3code-d3sox/signing/` from the setup machine somewhere private: it holds the Android keystore and password, the Arch secret key, and its revocation certificate. GitHub secrets cannot be read back. Losing the Android key prevents updating the existing `com.d3sox.t3code` installation; replacing the Arch key requires users to import and trust the new public key. Never commit private signing material.

The Android build uses the preview appearance but its own package ID and link scheme. It disables upstream Expo OTA updates, and signs the APK after the local Gradle build. Its version code is the first-parent-independent Git commit count, which increases on `main` even across merges. The public Arch key is tracked at `packaging/aur/t3code-d3sox-git/signing-key.asc` and must match the imported secret key.

The inherited upstream release, deployment, preview, and Blacksmith-backed workflows are manually disabled on this fork. `Issue Labels`, `PR Size`, and `PR Vouch` remain active because they use GitHub-hosted runners and do not need upstream service credentials. Keep those disabled workflows off until their runners, secrets, and publishing targets are deliberately adapted for the fork. The repository-wide Actions setting must be enabled for the nightly workflow to run.
