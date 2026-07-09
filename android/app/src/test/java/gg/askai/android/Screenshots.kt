package gg.askai.android

import androidx.compose.material3.Surface
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipeUp
import androidx.test.core.app.ApplicationProvider
import com.github.takahirom.roborazzi.captureRoboImage
import gg.askai.android.data.AppState
import gg.askai.android.data.Msg
import gg.askai.android.data.Supa
import gg.askai.android.data.Thread
import gg.askai.android.ui.AskAITheme
import gg.askai.android.ui.Ask
import gg.askai.android.ui.ChatScreen
import gg.askai.android.ui.SettingsScreen
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** Renders the real Compose screens on the JVM and saves PNGs (no emulator). */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34], qualifiers = "w411dp-h891dp-420dpi")
class Screenshots {
    @get:Rule val compose = createComposeRule()

    @Before fun setUp() {
        Supa.init(ApplicationProvider.getApplicationContext())
    }

    private fun demoApp() = AppState().apply {
        authed = true
        displayName = "Armin"
        userEmail = "arminsunja@gmail.com"
        workspaceName = "Armin's Workspace"
        threads.addAll(listOf(
            Thread("t1", "Plan a 3-day trip to Sarajevo", null),
            Thread("t2", "Fix my resume wording", null),
            Thread("t3", "Ideas for the car-detailing promo", null),
            Thread("t4", "Explain how RLS works", null),
        ))
    }

    @Test fun chatSaveBadges() {
        val app = demoApp().apply {
            currentThread = "t1"
            messages.addAll(listOf(
                Msg("m1", "user", "Plan a 3-day trip to Sarajevo for me", "complete", null, save = "saved"),
                Msg("m2", "agent", "Here's a relaxed 3-day plan:\n\nDay 1 — Baščaršija old town, Sebilj fountain, ćevapi at Željo.\nDay 2 — War Tunnel Museum, cable car up Trebević.\nDay 3 — Vrelo Bosne springs, coffee on Ferhadija.", "complete", null, save = "saved"),
                Msg("m3", "user", "Make day 2 more food-focused", "complete", null, save = "saving"),
                Msg("m4", "agent", "", "thinking", null),
            ))
        }
        compose.mainClock.autoAdvance = false
        compose.setContent { AskAITheme(dark = true) { Surface(color = Ask.ink) { ChatScreen(app) } } }
        compose.mainClock.advanceTimeBy(600)
        compose.onRoot().captureRoboImage("screenshots/01-chat-saving-saved.png")
    }

    @Test fun chatSaveFailedRetry() {
        val app = demoApp().apply {
            currentThread = "t1"
            loadError = "Couldn't reach your workspace. Check your connection and pull to retry."
            messages.addAll(listOf(
                Msg("m1", "user", "Plan a 3-day trip to Sarajevo for me", "complete", null, save = "saved"),
                Msg("m2", "agent", "Here's a relaxed 3-day plan:\n\nDay 1 — Baščaršija old town, Sebilj fountain, ćevapi at Željo.", "complete", null, save = "saved"),
                Msg("m3", "user", "Add a day trip to Mostar too", "complete", null, save = "failed"),
            ))
        }
        compose.mainClock.autoAdvance = false
        compose.setContent { AskAITheme(dark = true) { Surface(color = Ask.ink) { ChatScreen(app) } } }
        compose.mainClock.advanceTimeBy(600)
        compose.onRoot().captureRoboImage("screenshots/02-chat-save-failed-retry.png")
    }

    @Test fun sidebarWithProfileRow() {
        val app = demoApp().apply { currentThread = "t1" }
        compose.mainClock.autoAdvance = false
        compose.setContent { AskAITheme(dark = true) { Surface(color = Ask.ink) { ChatScreen(app) } } }
        compose.mainClock.advanceTimeBy(600)
        compose.onNodeWithContentDescription("menu").performClick()
        compose.mainClock.advanceTimeBy(2000)
        compose.onRoot().captureRoboImage("screenshots/03-sidebar-profile-settings.png")
    }

    @Test fun settingsDark() {
        val app = demoApp()
        compose.mainClock.autoAdvance = false
        compose.setContent { AskAITheme(dark = true) { Surface(color = Ask.ink) { SettingsScreen(app) } } }
        compose.mainClock.advanceTimeBy(600)
        compose.onRoot().captureRoboImage("screenshots/04-settings-dark.png")
    }

    @Test fun settingsDarkBottom() {
        val app = demoApp()
        compose.mainClock.autoAdvance = false
        compose.setContent { AskAITheme(dark = true) { Surface(color = Ask.ink) { SettingsScreen(app) } } }
        compose.mainClock.advanceTimeBy(600)
        compose.onRoot().performTouchInput { swipeUp(startY = bottom * 0.9f, endY = top + 80f, durationMillis = 300) }
        compose.mainClock.advanceTimeBy(2000)
        compose.onRoot().captureRoboImage("screenshots/06-settings-dark-bottom.png")
    }

    @Test fun settingsLight() {
        val app = demoApp().apply { themeMode = "light" }
        compose.mainClock.autoAdvance = false
        compose.setContent { AskAITheme(dark = false) { Surface(color = Ask.ink) { SettingsScreen(app) } } }
        compose.mainClock.advanceTimeBy(600)
        compose.onRoot().captureRoboImage("screenshots/05-settings-light.png")
    }
}
