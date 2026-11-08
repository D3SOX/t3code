package expo.modules.t3agentnotifications

import android.content.Context
import org.json.JSONObject
import org.unifiedpush.android.connector.UnifiedPush
import org.unifiedpush.android.connector.PushService
import org.unifiedpush.android.connector.FailedReason
import org.unifiedpush.android.connector.data.PushEndpoint
import org.unifiedpush.android.connector.data.PushMessage

internal object UnifiedPushNotifications {
  private const val STORE = "t3-unified-push"
  var onChange: (() -> Unit)? = null
  private fun prefs(context: Context) = context.getSharedPreferences(STORE, Context.MODE_PRIVATE)
  fun transport(context: Context): String = prefs(context).getString("transport", null)
    ?: if (context.resources.getIdentifier("google_app_id", "string", context.packageName) !=
      0
    ) {
      "fcm"
    } else {
      "local"
    }
  fun usesUnifiedPush(context: Context) = transport(context) == "unifiedpush"
  fun enabled(context: Context) =
    usesUnifiedPush(context) && prefs(context).getBoolean("enabled", false)

  fun backgroundEnabled(context: Context) = transport(context) == "local" &&
    prefs(context).getBoolean("localEnabled", false) &&
    prefs(context).getBoolean("backgroundEnabled", false)

  fun setBackgroundEnabled(context: Context, enabled: Boolean) {
    prefs(context).edit().putBoolean("backgroundEnabled", enabled).apply()
    if (!enabled) LocalConnectionService.stop(context)
    onChange?.invoke()
  }

  fun setLocalActivityEnabled(context: Context, enabled: Boolean) {
    prefs(context).edit().putBoolean("localActivityEnabled", enabled).apply()
    configureLocal(context)
    onChange?.invoke()
  }

  fun configureLocal(context: Context, deviceId: String? = null, scheme: String? = null) {
    if (transport(context) != "local" || !prefs(context).getBoolean("localEnabled", false)) return
    val prefs = prefs(context)
    if (deviceId != null && scheme != null) {
      prefs.edit().putString("deviceId", deviceId).putString("scheme", scheme).apply()
    }
    AgentNotifications.configure(
      context,
      prefs.getString("deviceId", "") ?: "",
      "local",
      prefs.getString("scheme", "t3code") ?: "t3code",
      prefs.getBoolean("localActivityEnabled", true)
    )
  }

  fun state(context: Context): Map<String, Any?> {
    val prefs = prefs(context)
    val subscriptions = JSONObject(prefs.getString("subscriptions", "{}") ?: "{}")
    return mapOf(
      "transport" to transport(context),
      "enabled" to enabled(context),
      "localEnabled" to prefs.getBoolean("localEnabled", false),
      "backgroundEnabled" to prefs.getBoolean("backgroundEnabled", false),
      "backgroundRunning" to LocalConnectionService.running,
      "localActivityEnabled" to prefs.getBoolean("localActivityEnabled", true),
      "distributor" to UnifiedPush.getSavedDistributor(context),
      "distributors" to UnifiedPush.getDistributors(context).map { pkg ->
        mapOf(
          "id" to pkg,
          "label" to
            context.packageManager.getApplicationLabel(
              context.packageManager.getApplicationInfo(pkg, 0)
            ).toString()
        )
      },
      "subscriptions" to subscriptions.keys().asSequence().associateWith { instance ->
        val value = subscriptions.getJSONObject(instance)
        value.keys().asSequence().associateWith { value.get(it) }
      }
    )
  }

  @Synchronized
  fun setTransport(context: Context, transport: String) {
    require(transport in listOf("unifiedpush", "fcm", "local"))
    disable(context)
    LocalConnectionService.stop(context)
    prefs(
      context
    ).edit().putString("transport", transport).putBoolean("localEnabled", false).apply()
    onChange?.invoke()
  }

  fun enableLocal(context: Context, deviceId: String, scheme: String) {
    prefs(context).edit().putBoolean("localEnabled", true)
      .putString("deviceId", deviceId).putString("scheme", scheme).apply()
    configureLocal(context)
    onChange?.invoke()
  }

  fun disableLocal(context: Context) {
    prefs(context).edit().putBoolean("localEnabled", false).apply()
    LocalConnectionService.stop(context)
    AgentNotifications.clear(context)
    onChange?.invoke()
  }

  fun notifyLocal(context: Context, data: Map<String, String>) {
    if (transport(context) == "local" &&
      prefs(context).getBoolean("localEnabled", false) && !LocalConnectionService.sessionStopped
    ) {
      AgentNotifications.receive(context, data)
    }
  }

  @Synchronized
  fun enable(context: Context, distributor: String, deviceId: String, scheme: String) {
    require(distributor in UnifiedPush.getDistributors(context)) {
      "Install and enable a UnifiedPush distributor first."
    }
    val prefs = prefs(context)
    if (UnifiedPush.getSavedDistributor(context) != distributor) disable(context)
    UnifiedPush.saveDistributor(context, distributor)
    prefs.edit().putString("transport", "unifiedpush").putBoolean("enabled", true)
      .putString("deviceId", deviceId).putString("scheme", scheme).apply()
    AgentNotifications.configure(context, deviceId, "unifiedpush", scheme, false)
    onChange?.invoke()
  }

  @Synchronized
  fun disable(context: Context) {
    val prefs = prefs(context)
    prefs.edit().putBoolean("enabled", false).apply()
    val subscriptions = JSONObject(prefs.getString("subscriptions", "{}") ?: "{}")
    subscriptions.keys().asSequence().toList().forEach { UnifiedPush.unregister(context, it) }
    prefs.edit().putString("subscriptions", "{}").apply()
    AgentNotifications.clear(context)
    onChange?.invoke()
  }

  @Synchronized
  fun register(context: Context, instance: String, vapid: String) {
    if (!enabled(context)) return
    val prefs = prefs(context)
    val subscriptions = JSONObject(prefs.getString("subscriptions", "{}") ?: "{}")
    val previous = subscriptions.optJSONObject(instance)
    if (previous?.optString("vapid") != vapid) {
      if (previous != null) UnifiedPush.unregister(context, instance)
      subscriptions.put(instance, JSONObject().put("vapid", vapid))
      prefs.edit().putString("subscriptions", subscriptions.toString()).apply()
    }
    UnifiedPush.register(context, instance, vapid = vapid)
  }

  @Synchronized
  fun forgetHost(context: Context, instance: String) {
    val prefs = prefs(context)
    val subscriptions = JSONObject(prefs.getString("subscriptions", "{}") ?: "{}")
    if (!subscriptions.has(instance)) return
    UnifiedPush.unregister(context, instance)
    subscriptions.remove(instance)
    prefs.edit().putString("subscriptions", subscriptions.toString()).apply()
    onChange?.invoke()
  }

  @Synchronized
  fun update(
    context: Context,
    instance: String,
    endpoint: PushEndpoint? = null,
    error: String? = null
  ) {
    if (!enabled(context)) return
    val prefs = prefs(context)
    val subscriptions = JSONObject(prefs.getString("subscriptions", "{}") ?: "{}")
    val previous = subscriptions.optJSONObject(instance) ?: return
    val next = JSONObject().put("vapid", previous.getString("vapid"))
    if (endpoint != null && endpoint.pubKeySet != null && !endpoint.temporary) {
      next.put("endpoint", endpoint.url).put("publicKey", endpoint.pubKeySet!!.pubKey)
        .put("auth", endpoint.pubKeySet!!.auth)
    } else {
      next.put("error", error ?: "Waiting for a permanent encrypted push endpoint.")
    }
    subscriptions.put(instance, next)
    prefs.edit().putString("subscriptions", subscriptions.toString()).apply()
    onChange?.invoke()
  }

  fun receive(context: Context, instance: String, message: PushMessage) {
    if (!enabled(context) || !message.decrypted) return
    val prefs = prefs(context)
    val subscriptions = JSONObject(prefs.getString("subscriptions", "{}") ?: "{}")
    if (!subscriptions.has(instance)) return
    try {
      val json = JSONObject(message.content.toString(Charsets.UTF_8))
      val data = json.keys().asSequence().associateWith { json.getString(it) }
      if (data["alert_path"]?.startsWith("/threads/${android.net.Uri.encode(instance)}/") == true) {
        AgentNotifications.receive(context, data)
      }
    } catch (_: org.json.JSONException) {
      // A malformed distributor message must not crash the receiver service.
    }
  }
}

class UnifiedPushService : PushService() {
  override fun onNewEndpoint(
    endpoint: PushEndpoint,
    instance: String
  ) = UnifiedPushNotifications.update(this, instance, endpoint)
  override fun onMessage(
    message: PushMessage,
    instance: String
  ) = UnifiedPushNotifications.receive(this, instance, message)
  override fun onRegistrationFailed(
    reason: FailedReason,
    instance: String
  ) = UnifiedPushNotifications.update(this, instance, error = reason.name)
  override fun onUnregistered(
    instance: String
  ) = UnifiedPushNotifications.update(
    this,
    instance,
    error = "Distributor unregistered this host. Reconnect to register again."
  )
  override fun onTempUnavailable(
    instance: String
  ) = UnifiedPushNotifications.update(
    this,
    instance,
    error = "Distributor temporarily unavailable."
  )
}
