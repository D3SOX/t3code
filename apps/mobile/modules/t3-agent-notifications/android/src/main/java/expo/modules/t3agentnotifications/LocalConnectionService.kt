package expo.modules.t3agentnotifications

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.IBinder
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.ProcessLifecycleOwner
import com.facebook.react.bridge.Arguments
import com.facebook.react.ReactApplication
import com.facebook.react.bridge.ReactContext
import com.facebook.react.jstasks.HeadlessJsTaskConfig
import com.facebook.react.jstasks.HeadlessJsTaskContext
import java.lang.ref.WeakReference

/** Keeps the existing React connection alive, without starting another runtime or host session. */
class LocalConnectionService : Service() {
  private var taskId: Int? = null
  private var taskContext: HeadlessJsTaskContext? = null

  override fun onBind(intent: Intent): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == STOP) {
      UnifiedPushNotifications.setBackgroundEnabled(this, false)
    }
    val context = reactContext?.get()
    if (!UnifiedPushNotifications.backgroundEnabled(this) || context == null ||
      !context.hasActiveReactInstance()
    ) {
      stopSelf()
      return START_NOT_STICKY
    }
    val channel = "local-connection"
    if (Build.VERSION.SDK_INT >= 26) {
      getSystemService(NotificationManager::class.java).createNotificationChannel(
        NotificationChannel(channel, "Background connection", NotificationManager.IMPORTANCE_LOW)
      )
    }
    val launch = packageManager.getLaunchIntentForPackage(packageName)?.let {
      PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_IMMUTABLE)
    }
    val stop = PendingIntent.getService(
      this,
      0,
      Intent(this, LocalConnectionService::class.java).setAction(STOP),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    startForeground(
      ID,
      NotificationCompat.Builder(this, channel)
        .setSmallIcon(R.drawable.agent_activity_mark)
        .setContentTitle("T3 Code is running")
        .setContentText("Keeping host connections active for agent updates")
        .setContentIntent(launch)
        .setOngoing(true).setSilent(true).setShowWhen(false)
        .setPriority(NotificationCompat.PRIORITY_LOW)
        .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
        .addAction(0, "Stop", stop).build()
    )
    if (taskId == null) {
      // A foreground service alone does not keep React Native's JS timers running
      // after Activity.onPause. A headless task does, using the already-mounted app.
      taskContext = HeadlessJsTaskContext.getInstance(context)
      taskId = taskContext!!.startTask(
        HeadlessJsTaskConfig("T3LocalConnection", Arguments.createMap(), 0, true)
      )
    }
    running = true
    UnifiedPushNotifications.onChange?.invoke()
    return START_NOT_STICKY
  }

  override fun onTaskRemoved(rootIntent: Intent?) {
    sessionStopped = true
    AgentNotifications.stopActivity(this)
    stopSelf()
    super.onTaskRemoved(rootIntent)
  }

  override fun onDestroy() {
    running = false
    if (!ProcessLifecycleOwner.get().lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) {
      sessionStopped = true
      AgentNotifications.stopActivity(this)
    }
    taskId?.let { taskContext?.finishTask(it) }
    taskId = null
    taskContext = null
    stopForeground(STOP_FOREGROUND_REMOVE)
    UnifiedPushNotifications.onChange?.invoke()
    super.onDestroy()
  }

  companion object {
    private const val ID = 73002
    private const val STOP = "t3.local-connection.STOP"
    private var reactContext: WeakReference<ReactContext>? = null
    var running = false
      private set
    var sessionStopped = false
      private set

    fun resume(context: Context) {
      sessionStopped = false
      if (UnifiedPushNotifications.backgroundEnabled(context) && !running) {
        val current =
          (context.applicationContext as? ReactApplication)?.reactHost?.currentReactContext
            ?: return
        reactContext = WeakReference(current)
        ContextCompat.startForegroundService(
          context,
          Intent(context, LocalConnectionService::class.java)
        )
      }
    }

    fun stop(context: Context) {
      context.stopService(Intent(context, LocalConnectionService::class.java))
    }
  }
}
