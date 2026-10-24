package expo.modules.t3agentnotifications

import android.content.ActivityNotFoundException
import android.content.Intent
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.modules.ModuleDefinitionBuilder

class T3AgentNotificationsModule : Module() {
  private fun ModuleDefinitionBuilder.pushFunctions() {
    Events("unifiedPushChanged")
    OnCreate {
      UnifiedPushNotifications.onChange =
        { sendEvent("unifiedPushChanged", emptyMap<String, Any>()) }
    }
    OnDestroy {
      appContext.reactContext?.let { LocalConnectionService.stop(it) }
      UnifiedPushNotifications.onChange = null
    }
    Function("getUnifiedPushState") {
      UnifiedPushNotifications.state(requireNotNull(appContext.reactContext))
    }
    Function("setPushTransport") { transport: String ->
      UnifiedPushNotifications.setTransport(requireNotNull(appContext.reactContext), transport)
    }
    Function("enableUnifiedPush") { distributor: String, deviceId: String, scheme: String ->
      UnifiedPushNotifications.enable(
        requireNotNull(appContext.reactContext),
        distributor,
        deviceId,
        scheme
      )
    }
    Function("disableUnifiedPush") {
      UnifiedPushNotifications.disable(requireNotNull(appContext.reactContext))
    }
    Function("enableLocalNotifications") { deviceId: String, scheme: String ->
      UnifiedPushNotifications.enableLocal(
        requireNotNull(appContext.reactContext),
        deviceId,
        scheme
      )
    }
    Function("disableLocalNotifications") {
      UnifiedPushNotifications.disableLocal(requireNotNull(appContext.reactContext))
    }
    Function("setLocalBackgroundEnabled") { enabled: Boolean ->
      val context = requireNotNull(appContext.reactContext)
      UnifiedPushNotifications.setBackgroundEnabled(context, enabled)
      if (enabled) LocalConnectionService.resume(context)
    }
    Function("setLocalActivityEnabled") { enabled: Boolean ->
      UnifiedPushNotifications.setLocalActivityEnabled(
        requireNotNull(appContext.reactContext),
        enabled
      )
    }
    Function("resumeLocalNotifications") { deviceId: String, scheme: String ->
      val context = requireNotNull(appContext.reactContext)
      UnifiedPushNotifications.configureLocal(context, deviceId, scheme)
      LocalConnectionService.resume(context)
    }
    Function("notifyLocal") { data: Map<String, String> ->
      UnifiedPushNotifications.notifyLocal(requireNotNull(appContext.reactContext), data)
    }
    Function("registerUnifiedPush") { environmentId: String, vapid: String ->
      UnifiedPushNotifications.register(
        requireNotNull(appContext.reactContext),
        environmentId,
        vapid
      )
    }
    Function("forgetUnifiedPushHost") { environmentId: String ->
      UnifiedPushNotifications.forgetHost(requireNotNull(appContext.reactContext), environmentId)
    }
  }

  override fun definition() = ModuleDefinition {
    Name("T3AgentNotifications")
    pushFunctions()

    Function("configure") {
        deviceId: String,
        userId: String,
        scheme: String,
        ongoingEnabled: Boolean
      ->
      appContext.reactContext?.let {
        if (UnifiedPushNotifications.transport(it) == "fcm") {
          AgentNotifications.configure(it, deviceId, userId, scheme, ongoingEnabled)
        }
      }
    }

    Function("clear") {
      appContext.reactContext?.let {
        if (UnifiedPushNotifications.transport(it) == "fcm") {
          AgentNotifications.clear(it)
        }
      }
    }

    Function("showShowcaseActivity") { scheme: String, data: Map<String, String> ->
      appContext.reactContext?.let { AgentNotifications.showcase(it, scheme, data) }
    }

    Function("setThreadOnScreen") { path: String? ->
      AgentNotifications.setThreadOnScreen(path)
    }

    Function("openLiveUpdateSettings") {
      val context = appContext.reactContext
      if (context == null || Build.VERSION.SDK_INT < 36) {
        false
      } else {
        try {
          context.startActivity(
            Intent(Settings.ACTION_APP_NOTIFICATION_PROMOTION_SETTINGS)
              .putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
              .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          )
          true
        } catch (_: ActivityNotFoundException) {
          false
        }
      }
    }
  }
}
