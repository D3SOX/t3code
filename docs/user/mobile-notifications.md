# Mobile notifications

Get push alerts, Live Activities, and home-screen widgets on iOS and Android when agents finish, fail, or need your approval or input. Empty completions stay quiet, and completion alerts wait for queued turns to finish.

## Prerequisites

On iOS, and on Android with **FCM / microG** delivery:

- Sign in to **T3 Connect** on both your phone and host machine (direct/Tailscale connections alone do not deliver background push notifications).
- Enable **Publish agent activity** in **Settings → Sharing & access** on the host.
- Enable **Device Notifications** in **Settings → Notifications** on mobile (Android requires Android 7.0+ and Google Play services or compatible microG).

On Android, [Local and UnifiedPush delivery](#android-delivery) work without T3 Connect.

## Live updates and widgets

- **Live progress**: Enable **Live Activity Updates** (iOS), **Agent Live Updates** (Android 16+, check **Live Update Settings** if missing), or **Ongoing Agent Activity** (older Android). Finished results stay visible for up to 15 minutes.
- **Silent live updates (Android 8+)**: Keep **Ongoing agent activity** on and disable **Agent alerts** in Android system notification settings.
- **iOS widget**: Add the **Agent Activity** widget to your Home Screen or Lock Screen (refreshes when you open T3; marks unfinished work stale after 10 minutes).

## Android delivery

Choose **Notification delivery** in Settings:

- **Local** uses the app's existing connection. Enable Device notifications to receive alerts and Agent Live Updates on Android 16 and newer, or Ongoing Agent Activity on older versions, to follow working agents in an activity card. Enable Background connection to keep receiving updates after switching apps. This shows an ongoing notification and stops when you remove T3 from recents. Without it, Android may suspend delivery in the background. Local mode needs no distributor, Google services, cloud account, or host update.
- **UnifiedPush** delivers encrypted alerts through an optional distributor such as [ntfy](https://unifiedpush.org/users/distributors/). Install and open your distributor and complete its background-delivery setup, including any battery permission it requests. Select UnifiedPush in T3, then enable Device notifications and choose the distributor. Each paired host registers directly and must support UnifiedPush; Settings shows its registration status or asks you to update it. Direct, Tailscale, and T3 Connect connections are supported. No Google registration, API key, or T3 Connect account is required.
- **FCM / microG** uses the existing T3 Connect notification service and the [prerequisites](#prerequisites) above. It requires an app build with Firebase configuration and Google Play services or compatible microG support. Our Android builds do not include Firebase credentials. Selecting FCM does not set up Firebase or register anything with Google.

Local and UnifiedPush alerts stay quiet for the thread currently visible on your phone. Disable Device notifications to stop that delivery mode, or change Notification delivery to use another one. Removing a host also unregisters its UnifiedPush receiver. Local background connections restart when you open T3, if the setting is enabled; UnifiedPush does not require T3's background connection. Android battery-saving modes can delay expired-card removal.

## Notes

- Ordinary alerts are muted while the mobile app is in the foreground, though viewing a thread on another device does not silence your phone.
- Force-stopping T3 Code (or its UnifiedPush distributor) in Android system Settings pauses delivery until you reopen the app.
