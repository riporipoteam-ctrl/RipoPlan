import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var app: AppState
    @Environment(\.dismiss) private var dismiss
    @AppStorage("askai.notif") private var notifOn = false
    @AppStorage("askai.brief") private var briefOn = false
    @AppStorage("askai.briefHour") private var briefHour = 8
    @AppStorage("askai.dark") private var darkMode = false
    @State private var backend = ""
    @State private var confirmSignOut = false

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.ink.ignoresSafeArea()
                ScrollView {
                    VStack(spacing: 16) {
                        // Profile header
                        VStack(spacing: 10) {
                            Avatar(name: app.profile?.display_name ?? "You", color: app.profile?.avatar_color, size: 76)
                            Text(app.profile?.display_name ?? "You").font(.title2.bold()).foregroundStyle(Theme.text)
                            Text(app.profile?.email ?? app.workspace?.name ?? "").font(.subheadline).foregroundStyle(Theme.muted)
                        }
                        .frame(maxWidth: .infinity).card(radius: 20)

                        // Appearance
                        VStack(alignment: .leading, spacing: 12) {
                            SectionHeader(title: "Appearance")
                            Toggle(isOn: $darkMode) {
                                Label(darkMode ? "Dark mode" : "Light mode",
                                      systemImage: darkMode ? "moon.stars.fill" : "sun.max.fill")
                                    .foregroundStyle(Theme.text)
                            }
                            .tint(Theme.accent)
                            .onChange(of: darkMode) { _ in Haptic.selection() }
                            Text("AskAI is light by default. Turn this on for a dark theme.")
                                .font(.caption).foregroundStyle(Theme.muted)
                        }
                        .card(radius: 16)

                        // Notifications + Daily briefing
                        VStack(alignment: .leading, spacing: 14) {
                            SectionHeader(title: "Notifications")
                            Toggle(isOn: $notifOn) {
                                Label("Task updates", systemImage: "checkmark.circle").foregroundStyle(Theme.text)
                            }
                            .tint(Theme.accent)
                            .onChange(of: notifOn) { on in if on { NotifManager.shared.requestAuth() } }
                            Text("Get notified when a background task an agent is running finishes.")
                                .font(.caption).foregroundStyle(Theme.muted)

                            Divider().overlay(Theme.stroke)

                            Toggle(isOn: $briefOn) {
                                Label("Daily briefing", systemImage: "sun.max").foregroundStyle(Theme.text)
                            }
                            .tint(Theme.accent)
                            .onChange(of: briefOn) { on in
                                if on { NotifManager.shared.enable(briefHour: briefHour) }
                                else { NotifManager.shared.cancelDailyBriefing() }
                            }
                            if briefOn {
                                Stepper(value: $briefHour, in: 5...22) {
                                    Text("Every day at \(briefHour):00").foregroundStyle(Theme.muted).font(.subheadline)
                                }
                                .onChange(of: briefHour) { h in NotifManager.shared.scheduleDailyBriefing(hour: h) }
                            }
                            Text("Each day AskAI sends you a briefing: what you worked on and what your agents got done — even after you close the app.")
                                .font(.caption).foregroundStyle(Theme.muted)
                        }
                        .card(radius: 16)

                        // Siri
                        VStack(alignment: .leading, spacing: 8) {
                            SectionHeader(title: "Siri")
                            Label("“Hey Siri, Ask AskAI…”", systemImage: "mic.fill").foregroundStyle(Theme.text)
                            Text("Hand a task to your agents hands-free. Add the shortcut in the Shortcuts app after first launch.")
                                .font(.caption).foregroundStyle(Theme.muted)
                        }
                        .card(radius: 16)

                        // Advanced
                        VStack(alignment: .leading, spacing: 8) {
                            SectionHeader(title: "Advanced")
                            Text("Backend URL (optional — speeds up replies & enables image generation)")
                                .font(.caption).foregroundStyle(Theme.muted)
                            TextField("https://your-worker.workers.dev", text: $backend)
                                .textInputAutocapitalization(.never).autocorrectionDisabled()
                                .foregroundStyle(Theme.text).tint(Theme.accent)
                                .padding(.horizontal, 12).padding(.vertical, 10)
                                .background(Theme.ink3, in: RoundedRectangle(cornerRadius: 12))
                                .overlay(RoundedRectangle(cornerRadius: 12).stroke(Theme.stroke, lineWidth: 1))
                                .onSubmit { app.backendURL = backend }
                        }
                        .card(radius: 16)

                        Button(role: .destructive) { confirmSignOut = true } label: {
                            Label("Sign out", systemImage: "rectangle.portrait.and.arrow.right")
                                .frame(maxWidth: .infinity).padding(.vertical, 14)
                                .background(Theme.bad.opacity(0.12), in: RoundedRectangle(cornerRadius: 16))
                                .foregroundStyle(Theme.bad)
                        }

                        Text("AskAI • native iOS").font(.caption2).foregroundStyle(Theme.muted)
                        Spacer(minLength: 40)
                    }
                    .padding(16)
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } } }
            .onAppear { backend = app.backendURL }
            .confirmationDialog("Sign out of AskAI?", isPresented: $confirmSignOut, titleVisibility: .visible) {
                Button("Sign out", role: .destructive) { Haptic.warning(); app.signOut() }
                Button("Cancel", role: .cancel) {}
            }
        }
    }
}
