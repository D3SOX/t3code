package expo.modules.widgets;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import static org.robolectric.Shadows.shadowOf;

import android.app.PendingIntent;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import androidx.glance.action.Action;
import androidx.glance.appwidget.action.SendBroadcastIntentAction;
import androidx.glance.appwidget.action.StartActivityIntentAction;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;

// Java can exercise expo-widgets' Kotlin-internal native action without replacing it with a mock.
@RunWith(RobolectricTestRunner.class)
@Config(sdk = {24, 36}, manifest = Config.NONE)
public class WidgetInteractionActionTest {
  private Context context;
  private ComponentName activity;

  @Before
  public void registerLauncher() {
    context = RuntimeEnvironment.getApplication();
    activity = new ComponentName(context.getPackageName(), "TestActivity");
    shadowOf(context.getPackageManager()).addActivityIfNotPresent(activity);
    IntentFilter filter = new IntentFilter(Intent.ACTION_MAIN);
    filter.addCategory(Intent.CATEGORY_LAUNCHER);
    shadowOf(context.getPackageManager()).addIntentFilterForActivity(activity, filter);
  }

  @Test
  public void widgetTapLaunchesUsageWithoutAnAppRuntime() throws Exception {
    for (String scheme : new String[] {"t3code-dev", "t3code-preview", "t3code-d3sox"}) {
      String url = scheme + "://settings/usage?tab=limits";
      Intent intent = launchIntent(url);
      assertEquals(Intent.ACTION_VIEW, intent.getAction());
      assertEquals(activity, intent.getComponent());
      assertEquals(url, intent.getDataString());
      assertTrue((intent.getFlags() & Intent.FLAG_ACTIVITY_NEW_TASK) != 0);
      assertTrue((intent.getFlags() & Intent.FLAG_ACTIVITY_CLEAR_TOP) != 0);
      assertTrue((intent.getFlags() & Intent.FLAG_ACTIVITY_SINGLE_TOP) != 0);

      PendingIntent.getActivity(context, 0, intent, PendingIntent.FLAG_IMMUTABLE).send();

      Intent launched = shadowOf(RuntimeEnvironment.getApplication()).getNextStartedActivity();
      assertEquals(activity, launched.getComponent());
      assertEquals(url, launched.getDataString());
    }
  }

  @Test
  public void unpublishedWidgetStillOpensTheApp() {
    Intent intent = launchIntent("expo-widgets://open-app");
    assertEquals(Intent.ACTION_MAIN, intent.getAction());
    assertEquals(activity, intent.getComponent());
  }

  @Test
  public void ordinaryWidgetButtonsKeepTheirBroadcastAction() {
    Action action = action(new InteractionSource.Widget("SubscriptionUsage"), "__expo_widgets_target_0");
    assertTrue(action instanceof SendBroadcastIntentAction);
  }

  @Test
  public void notificationButtonsKeepTheirBroadcastAction() {
    Action action = action(new InteractionSource.Notification("AgentActivity", "notification"), "t3code-dev://settings/usage");
    assertTrue(action instanceof SendBroadcastIntentAction);
  }

  private Intent launchIntent(String target) {
    Action action = action(new InteractionSource.Widget("SubscriptionUsage"), target);
    assertTrue("Widget tap must start an activity without a JS listener", action instanceof StartActivityIntentAction);
    return ((StartActivityIntentAction) action).getIntent();
  }

  private Action action(InteractionSource source, String target) {
    return WidgetInteractionActionKt.toGlanceAction(new WidgetInteraction(source, target), context);
  }
}
