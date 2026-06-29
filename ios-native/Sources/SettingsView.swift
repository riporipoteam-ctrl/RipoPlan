import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var app: AppState
    @AppStorage("askai.notif") private var notifOn = false
    @AppStorage("askai.briefHour") private var briefHour = 8
    @State private var backend = ""
    @State private var confirmSignOut = false

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.backdrop.ignoresSafeArea()
                ScrollView {
                    VStack(spacing: 16) {
                        // Profile header
                        VStack(spacing: 10) {
                            Avatar(name: app.profile?.display_name ?? "You", color: app.profile?.avatar_color, size: 76)
                            Text(app.profile?.display_name ?? "You").font(.title2.bold()).foregroundStyle(Theme.text)
                            Text(app.profile?.email ?? app.workspace?.name ?? "").font(.subheadline).foregroundStyle(Theme.muted)
                        }
                        .frame(maxWidth: .infinity).glass(radius: 22)

                        // Notifications
                        VStack(alignment: .leading, spacing: 12) {
                            SectionHeader(title: "Notifications")
                            Toggle(isOn: $notifOn) {
                                Label("Push briefings & task updates", systemImage: "bell.badge.fill").foregroundStyle(Theme.text)
                            }
                            .tint(Theme.accent)
                            .onChange(of: notifOn) { on in
                                if on {
                                    NotifManager.shared.enable(briefHour: briefHour)
                                } else {
                                    NotifManager.shared.disable()
                                }
                            }
                            if notifOn {
                                Stepper(value: $briefHour, in: 5...22) {
                                    Text("Daily briefing at \(briefHour):00").foregroundStyle(Theme.muted).font(.subheadline)
                                }
                                .onChange(of: briefHour) { h in NotifManager.shared.scheduleDailyBriefing(hour: h) }
                            }
                            Text("AskAI notifies you when background tasks finish and sends a daily briefing — even after you close the app.")
                                .font(.caption).foregroundStyle(Theme.muted)
                        }
                        .glass(radius: 18)

                        // Siri
                        VStack(alignment: .leading, spacing: 8) {
                            SectionHeader(title: "Siri")
                            Label("“Hey Siri, Ask AskAI…”", systemImage: "mic.fill").foregroundStyle(Theme.text)
                            Text("Hand a task to your agents hands-free. Add the shortcut in the Shortcuts app after first launch.")
                                .font(.caption).foregroundStyle(Theme.muted)
                        }
                        .glass(radius: 18)

                        // Backend (optional)
                        VStack(alignment: .leading, spacing: 8) {
                            SectionHeader(title: "Advanced")
                            Text("Backend URL (optional — speeds up replies & enables image generation)")
                                .font(.caption).foregroundStyle(Theme.muted)
                            TextField("https://your-worker.workers.dev", text: $backend)
                                .textInputAutocapitalization(.never).autocorrectionDisabled()
                                .foregroundStyle(Theme.text).tint(Theme.accent)
                                .padding(.horizontal, 12).padding(.vertical, 10)
                                .background(Color.white.opacity(0.05), in: RoundedRectangle(cornerRadius: 12))
                                .overlay(RoundedRectangle(cornerRadius: 12).stroke(Theme.stroke, lineWidth: 1))
                                .onSubmit { app.backendURL = backend }
                        }
                        .glass(radius: 18)

                        Button(role: .destructive) { confirmSignOut = true } label: {
                            Label("Sign out", systemImage: "rectangle.portrait.and.arrow.right")
                                .frame(maxWidth: .infinity).padding(.vertical, 14)
                                .background(Theme.bad.opacity(0.15), in: RoundedRectangle(cornerRadius: 16))
                                .foregroundStyle(Theme.bad)
                        }

                        Text("AskAI • native iOS").font(.caption2).foregroundStyle(Theme.muted)
                        Spacer(minLength: 100)
                    }
                    .padding(16)
                }
            }
            .navigationTitle("Settings")
            .toolbarColorScheme(.dark, for: .navigationBar)
            .onAppear { backend = app.backendURL }
            .confirmationDialog("Sign out of AskAI?", isPresented: $confirmSignOut, titleVisibility: .visible) {
                Button("Sign out", role: .destructive) { Haptic.warning(); app.signOut() }
                Button("Cancel", role: .cancel) {}
            }
        }
    }
}
