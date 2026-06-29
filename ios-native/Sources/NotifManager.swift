import Foundation
import UserNotifications

/// Local notifications — these work for a sideloaded app (no APNs / paid account
/// needed). Daily briefing is a repeating calendar notification; task-complete
/// alerts are posted from background refresh / when the app checks Supabase.
final class NotifManager: NSObject, UNUserNotificationCenterDelegate {
    static let shared = NotifManager()
    private let center = UNUserNotificationCenter.current()
    private let dailyId = "askai.dailyBriefing"

    func configure() { center.delegate = self }

    func enable(briefHour: Int) {
        center.requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
            if granted { self.scheduleDailyBriefing(hour: briefHour) }
        }
    }

    func disable() {
        center.removeAllPendingNotificationRequests()
    }

    func scheduleDailyBriefing(hour: Int) {
        center.removePendingNotificationRequests(withIdentifiers: [dailyId])
        var date = DateComponents(); date.hour = hour; date.minute = 0
        let content = UNMutableNotificationContent()
        content.title = "Your daily briefing ☀️"
        content.body = "Open AskAI for a rundown of what your agents did and what needs you today."
        content.sound = .default
        let trigger = UNCalendarNotificationTrigger(dateMatching: date, repeats: true)
        center.add(UNNotificationRequest(identifier: dailyId, content: content, trigger: trigger))
    }

    func notify(title: String, body: String) {
        center.getNotificationSettings { settings in
            guard settings.authorizationStatus == .authorized else { return }
            let content = UNMutableNotificationContent()
            content.title = title; content.body = body; content.sound = .default
            let req = UNNotificationRequest(identifier: UUID().uuidString, content: content,
                                            trigger: UNTimeIntervalNotificationTrigger(timeInterval: 1, repeats: false))
            self.center.add(req)
        }
    }

    // Show banners even when the app is in the foreground.
    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .sound, .badge])
    }
}
