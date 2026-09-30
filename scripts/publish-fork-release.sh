#!/usr/bin/env bash
set -euo pipefail

test "$#" -gt 0
: "${RELEASE_TAG:?}" "${RELEASE_COUNT:?}" "${GITHUB_REPOSITORY:?}" "${GITHUB_SHA:?}"

if gh release view "$RELEASE_TAG" --repo "$GITHUB_REPOSITORY" >/dev/null 2>&1; then
  gh release upload "$RELEASE_TAG" "$@" --clobber --repo "$GITHUB_REPOSITORY"
  exit 0
fi

# Pin the tag to the build commit even when main has moved. Either publisher
# may create the tag and release first, so verify them after a creation race.
tag_endpoint="repos/$GITHUB_REPOSITORY/git/ref/tags/$RELEASE_TAG"
if ! gh api "$tag_endpoint" >/dev/null 2>&1; then
  if ! gh api --method POST "repos/$GITHUB_REPOSITORY/git/refs" \
    -f "ref=refs/tags/$RELEASE_TAG" -f "sha=$GITHUB_SHA" >/dev/null; then
    test "$(gh api "$tag_endpoint" --jq '.object.sha')" = "$GITHUB_SHA"
  fi
fi

if ! gh release create "$RELEASE_TAG" "$@" \
  --repo "$GITHUB_REPOSITORY" --verify-tag \
  --title "D3SOX nightly r${RELEASE_COUNT}" --prerelease --latest=false \
  --notes "Automated fork build from ${GITHUB_SHA}. Android and Arch assets publish independently as their builds finish. Android APK: com.t3tools.t3code.preview. Arch Linux: t3code-d3sox-git. The packages use dedicated signing keys; see the repository README before installing."; then
  gh release view "$RELEASE_TAG" --repo "$GITHUB_REPOSITORY" >/dev/null
  gh release upload "$RELEASE_TAG" "$@" --clobber --repo "$GITHUB_REPOSITORY"
fi
