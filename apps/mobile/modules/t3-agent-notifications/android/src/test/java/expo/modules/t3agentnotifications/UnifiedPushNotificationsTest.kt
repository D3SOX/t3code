package expo.modules.t3agentnotifications

import android.app.Activity
import android.app.Application
import android.app.NotificationManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleRegistry
import androidx.lifecycle.ProcessLifecycleOwner
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Robolectric
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.unifiedpush.android.connector.data.PushMessage

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33], manifest = Config.NONE)
class UnifiedPushNotificationsTest {
  private lateinit var context: Application
  private lateinit var manager: NotificationManager

  @Before
  fun setUp() {
    context = RuntimeEnvironment.getApplication()
    manager = context.getSystemService(NotificationManager::class.java)
    shadowOf(manager).setNotificationsEnabled(true)
    (ProcessLifecycleOwner.get().lifecycle as LifecycleRegistry).currentState =
      Lifecycle.State.CREATED
    val launcher = ComponentName(context, Activity::class.java)
    shadowOf(context.packageManager).addActivityIfNotPresent(launcher)
    shadowOf(context.packageManager).addIntentFilterForActivity(
      launcher,
      IntentFilter(Intent.ACTION_MAIN).apply {
        addCategory(Intent.CATEGORY_LAUNCHER)
      }
    )
    context.getSharedPreferences("t3-unified-push", Context.MODE_PRIVATE).edit().clear()
      .putString("transport", "unifiedpush").putBoolean("enabled", true)
      .putString("subscriptions", "{\"host\":{\"vapid\":\"test\"}}").apply()
    AgentNotifications.clear(context)
    AgentNotifications.configure(
      context,
      "device",
      "unifiedpush",
      "t3code-dev",
      false
    )
    AgentNotifications.setThreadOnScreen(null)
    LocalConnectionService.resume(context)
  }

  private fun message(
    path: String = "/threads/host/thread",
    decrypted: Boolean = true
  ) = PushMessage(
    JSONObject(
      mapOf(
        "device_id" to "device",
        "user_id" to "unifiedpush",
        "updated_at" to System.currentTimeMillis().toString(),
        "alert_id" to "completion",
        "alert_title" to "Agent finished",
        "alert_body" to "Task · Project",
        "alert_path" to path,
        "alert_group" to "host"
      )
    ).toString().toByteArray(),
    decrypted
  )

  @Test
  fun decryptedDeliveryShowsOneAlertWithThreadDeepLink() {
    val message = message()
    UnifiedPushNotifications.receive(context, "host", message)
    UnifiedPushNotifications.receive(context, "host", message)
    assertEquals(1, manager.activeNotifications.size)
    val intent = shadowOf(
      manager.activeNotifications.single().notification.contentIntent
    ).savedIntent
    assertEquals("t3code-dev://threads/host/thread", intent.data.toString())
  }

  @Test
  fun rejectsPlaintextUnknownInstancesAndCrossHostLinks() {
    UnifiedPushNotifications.receive(context, "host", message(decrypted = false))
    UnifiedPushNotifications.receive(context, "other", message())
    UnifiedPushNotifications.receive(context, "host", message(path = "/threads/other/thread"))
    assertTrue(manager.activeNotifications.isEmpty())
  }

  @Test
  fun localModeShowsLiveAgentProgressWithoutFirebaseRegistration() {
    UnifiedPushNotifications.setTransport(context, "local")
    UnifiedPushNotifications.enableLocal(context, "device", "t3code-dev")
    UnifiedPushNotifications.notifyLocal(
      context,
      mapOf(
        "device_id" to "device",
        "user_id" to "local",
        "updated_at" to System.currentTimeMillis().toString(),
        "active" to "true",
        "activity_phase" to "running",
        "activity_active_count" to "1",
        "activity_line_0" to "Working\tTask\tProject",
        "activity_path" to "/threads/host/thread"
      )
    )
    assertEquals("t3-agent-activity", manager.activeNotifications.single().tag)
    assertEquals(
      "Task",
      manager.activeNotifications.single().notification.extras
        .getCharSequence(android.app.Notification.EXTRA_TITLE).toString()
    )
    Robolectric.buildService(LocalConnectionService::class.java).create().destroy()
    assertTrue(manager.activeNotifications.isEmpty())
  }

  @Test
  fun backgroundConnectionIsOptInAndRemovalFromRecentsStopsLocalDelivery() {
    UnifiedPushNotifications.setTransport(context, "local")
    UnifiedPushNotifications.enableLocal(context, "device", "t3code-dev")
    assertEquals(false, UnifiedPushNotifications.backgroundEnabled(context))
    UnifiedPushNotifications.setBackgroundEnabled(context, true)
    assertEquals(true, UnifiedPushNotifications.backgroundEnabled(context))
    UnifiedPushNotifications.disableLocal(context)
    assertEquals(false, UnifiedPushNotifications.backgroundEnabled(context))
    UnifiedPushNotifications.enableLocal(context, "device", "t3code-dev")
    val service = Robolectric.buildService(LocalConnectionService::class.java).create()
    service.get().onTaskRemoved(null)
    assertTrue(LocalConnectionService.sessionStopped)
    val data = mapOf(
      "device_id" to "device",
      "user_id" to "local",
      "updated_at" to System.currentTimeMillis().toString(),
      "alert_id" to "after-removal",
      "alert_title" to "Agent finished",
      "alert_path" to "/threads/host/thread"
    )
    UnifiedPushNotifications.notifyLocal(context, data)
    assertTrue(manager.activeNotifications.isEmpty())
    UnifiedPushNotifications.setBackgroundEnabled(context, false)
    LocalConnectionService.resume(context)
    UnifiedPushNotifications.notifyLocal(context, data)
    assertEquals(1, manager.activeNotifications.size)
    UnifiedPushNotifications.setTransport(context, "unifiedpush")
    assertEquals(false, UnifiedPushNotifications.backgroundEnabled(context))
    service.destroy()
  }

  @Test
  fun resumingLocalModeRepairsIdentityForExistingInstalls() {
    UnifiedPushNotifications.setTransport(context, "local")
    context.getSharedPreferences("t3-unified-push", Context.MODE_PRIVATE).edit()
      .putBoolean("localEnabled", true).remove("deviceId").remove("scheme").apply()
    AgentNotifications.configure(context, "device", "local", "t3code-dev", false)
    UnifiedPushNotifications.configureLocal(context, "device", "t3code-dev")
    UnifiedPushNotifications.notifyLocal(
      context,
      mapOf(
        "device_id" to "device",
        "user_id" to "local",
        "updated_at" to System.currentTimeMillis().toString(),
        "alert_id" to "after-update",
        "alert_title" to "Agent finished",
        "alert_path" to "/threads/host/thread"
      )
    )
    assertEquals(1, manager.activeNotifications.size)
  }

  @Test
  fun localNotificationsAreIndependentOfDistributorAndStopWhenDisabled() {
    UnifiedPushNotifications.setTransport(context, "local")
    UnifiedPushNotifications.enableLocal(context, "device", "t3code-dev")
    val data = mapOf(
      "device_id" to "device",
      "user_id" to "local",
      "updated_at" to System.currentTimeMillis().toString(),
      "alert_id" to "local",
      "alert_title" to "Agent finished",
      "alert_body" to "Task",
      "alert_path" to "/threads/host/thread"
    )
    UnifiedPushNotifications.notifyLocal(context, data)
    assertEquals(1, manager.activeNotifications.size)
    UnifiedPushNotifications.disableLocal(context)
    UnifiedPushNotifications.notifyLocal(context, data + ("alert_id" to "another"))
    assertTrue(manager.activeNotifications.isEmpty())
  }
}
