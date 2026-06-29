import SwiftUI
import BackgroundTasks

let kRefreshTaskId = "gg.askai.refresh"

@main
struct AskAIApp: App {
    @StateObject private var app = AppState()
    @Environment(\.scenePhase) private var phase

    init() {
        // CI/screenshot hook: force dark mode for the dark-theme capture.
        if ProcessInfo.processInfo.environment["ASKAI_DARK"] == "1" {
            UserDefaults.standard.set(true, forKey: "askai.dark")
        }
        NotifManager.shared.configure()
        BGTaskScheduler.shared.register(forTaskWithIdentifier: kRefreshTaskId, using: nil) { task in
            guard let refresh = task as? BGAppRefreshTask else { task.setTaskCompleted(success: false); return }
            let work = Task { await TaskRunner.checkCompletedTasks() }
            refresh.expirationHandler = { work.cancel() }
            Task {
                _ = await work.value
                scheduleAppRefresh()
                refresh.setTaskCompleted(success: true)
            }
        }
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(app)
                .task { await TaskRunner.checkCompletedTasks() }
                .onChange(of: phase) { newPhase in
                    switch newPhase {
                    case .active:
                        Task {
                            await TaskRunner.checkCompletedTasks()
                            await app.loadNotifications()
                            await app.loadThreads()
                        }
                    case .background:
                        scheduleAppRefresh()
                    default: break
                    }
                }
        }
    }
}

/// Ask iOS for opportunistic background time to check on finished agent tasks.
func scheduleAppRefresh() {
    let req = BGAppRefreshTaskRequest(identifier: kRefreshTaskId)
    req.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60)
    try? BGTaskScheduler.shared.submit(req)
}
