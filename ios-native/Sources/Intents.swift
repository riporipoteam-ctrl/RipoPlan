import AppIntents

/// Siri / Shortcuts integration: "Hey Siri, Ask AskAI to research the World Cup".
/// The task is enqueued server-side so agents run even with the app closed.
struct AskAgentsIntent: AppIntent {
    static var title: LocalizedStringResource = "Ask AskAI"
    static var description = IntentDescription("Hand a task to your AskAI agents. They run in the background and the answer appears in the app.")
    static var openAppWhenRun: Bool = false

    @Parameter(title: "Task", requestValueDialog: "What should your agents do?")
    var prompt: String

    func perform() async throws -> some IntentResult & ProvidesDialog {
        guard Supa.shared.isAuthed else {
            return .result(dialog: "Open AskAI and sign in first, then I can hand tasks to your agents.")
        }
        let tid = await TaskRunner.enqueue(prompt: prompt)
        if tid != nil {
            return .result(dialog: "On it — your agents are working on that now. I'll have it ready in AskAI.")
        }
        return .result(dialog: "I couldn't reach your workspace just now. Open AskAI and try again.")
    }
}

struct AskAIShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: AskAgentsIntent(),
            phrases: [
                "Ask \(.applicationName)",
                "Ask \(.applicationName) to \(\.$prompt)",
                "Tell \(.applicationName) to \(\.$prompt)"
            ],
            shortTitle: "Ask AskAI",
            systemImageName: "sparkles"
        )
    }
}
