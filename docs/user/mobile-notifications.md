# Mobile notifications

Enable notifications in **Settings → Notifications** to receive alerts when an agent finishes, fails, needs approval, or asks for input. Tap an alert to open its thread. Empty completions stay quiet, and completion alerts wait for queued turns to finish.

## Android

Choose **Notification delivery** in Settings:

- **Local** uses the app's existing connection. Enable Device notifications to receive alerts and Live agent progress to follow working agents in an activity card. Enable Background connection to keep receiving updates after switching apps. This shows an ongoing notification and stops when you remove T3 from recents. Without it, Android may suspend delivery in the background. Local mode needs no distributor, Google services, cloud account, or host update.
- **UnifiedPush** delivers encrypted alerts through an optional distributor such as [ntfy](https://unifiedpush.org/users/distributors/). Install and open your distributor and complete its background-delivery setup, including any battery permission it requests. Select UnifiedPush in T3, then enable Device notifications and choose the distributor. Each paired host registers directly and must support UnifiedPush; Settings shows its registration status or asks you to update it. Direct, Tailscale, and T3 Connect connections are supported. No Google registration, API key, or T3 Connect account is required.
- **FCM / microG** uses the existing T3 Connect notification service. It requires an app build with Firebase configuration and Google Play services or compatible microG support. Our Android builds do not include Firebase credentials. Selecting FCM does not set up Firebase or register anything with Google.

Local and UnifiedPush alerts stay quiet for the thread currently visible on your phone. Viewing it on another device does not silence your phone. Disable Device notifications to stop that delivery mode, or change Notification delivery to use another one. Removing a host also unregisters its UnifiedPush receiver.

For FCM, sign in to T3 Connect, link your environments, and enable Device Notifications. Your host must have agent activity publishing enabled. Ongoing Agent Activity is also available through this mode; Android 16 can promote it to a Live Update, subject to system settings. Dismissing an activity card does not disable alerts.

Notification permission and channels are controlled in Android Settings. Force-stopping T3 or its distributor prevents delivery until you open it again. Local background connections restart when you open T3, if the setting is enabled. UnifiedPush does not require T3's background connection.

## iOS

Sign in to T3 Connect, link your environments, and enable Device Notifications. Your host must have agent activity publishing enabled. Enable Live Activity Updates to follow work without opening T3. Finished results remain visible for up to 15 minutes.
