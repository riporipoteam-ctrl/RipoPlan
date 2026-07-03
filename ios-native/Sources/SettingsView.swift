import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var app: AppState
    @Environment(\.dismiss) private var dismiss
    @AppStorage("askai.notif") private var notifOn = false
    @AppStorage("askai.brief") private var briefOn = false
    @AppStorage("askai.briefHour") private var briefHour = 8
    @AppStorage("askai.dark") private var darkMode = false
    @AppStorage("askai.instructions") private var instructions = ""
    @State private var confirmSignOut = false
    @State private var editName = false
    @State private var nameDraft = ""
    @State private var editInstructions = false
    @State private var instructionsDraft = ""
    @State private var editWorkspace = false
    @State private var workspaceDraft = ""
    @StateObject private var updater = UpdateChecker()
    @State private var showUpdate = false
    @State private var checking = false
    private var appVersion: String { Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.0" }

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.ink.ignoresSafeArea()
                ScrollView {
                    VStack(spacing: 16) {
                        // Profile header (tap to edit name)
                        Button {
                            nameDraft = app.profile?.display_name ?? ""; editName = true
                        } label: {
                            VStack(spacing: 10) {
                                Avatar(name: app.profile?.display_name ?? "You", color: app.profile?.avatar_color, size: 76)
                                HStack(spacing: 6) {
                                    Text(app.profile?.display_name ?? "You").font(.title2.bold()).foregroundStyle(Theme.text)
                                    Image(systemName: "pencil").font(.caption).foregroundStyle(Theme.muted)
                                }
                                Text(app.profile?.email ?? app.workspace?.name ?? "").font(.subheadline).foregroundStyle(Theme.muted)
                            }
                            .frame(maxWidth: .infinity).card(radius: 20)
                        }
                        .buttonStyle(.plain)
                        .alert("Edit name", isPresented: $editName) {
                            TextField("Display name", text: $nameDraft)
                            Button("Cancel", role: .cancel) {}
                            Button("Save") { Task { await app.updateProfile(displayName: nameDraft) } }
                        }

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

                        // Personalization
                        VStack(alignment: .leading, spacing: 12) {
                            SectionHeader(title: "Personalization")
                            Button {
                                instructionsDraft = instructions; editInstructions = true
                            } label: {
                                HStack {
                                    Label("Custom instructions", systemImage: "text.quote").foregroundStyle(Theme.text)
                                    Spacer()
                                    Text(instructions.isEmpty ? "Off" : "On")
                                        .font(.subheadline).foregroundStyle(Theme.muted)
                                    Image(systemName: "chevron.right").font(.caption).foregroundStyle(Theme.muted)
                                }
                            }
                            Text("Tell AskAI how to talk to you and what to keep in mind — every agent follows these in every chat.")
                                .font(.caption).foregroundStyle(Theme.muted)

                            Divider().overlay(Theme.stroke)

                            Button {
                                workspaceDraft = app.workspace?.name ?? ""; editWorkspace = true
                            } label: {
                                HStack {
                                    Label("Workspace name", systemImage: "building.2").foregroundStyle(Theme.text)
                                    Spacer()
                                    Text(app.workspace?.name ?? "—").font(.subheadline).foregroundStyle(Theme.muted).lineLimit(1)
                                    Image(systemName: "chevron.right").font(.caption).foregroundStyle(Theme.muted)
                                }
                            }
                        }
                        .card(radius: 16)
                        .alert("Rename workspace", isPresented: $editWorkspace) {
                            TextField("Workspace name", text: $workspaceDraft)
                            Button("Cancel", role: .cancel) {}
                            Button("Save") { Task { await app.renameWorkspace(to: workspaceDraft) } }
                        }
                        .sheet(isPresented: $editInstructions) {
                            NavigationStack {
                                VStack(alignment: .leading, spacing: 10) {
                                    Text("What should AskAI know about you, and how should it respond?")
                                        .font(.subheadline).foregroundStyle(Theme.muted)
                                    TextEditor(text: $instructionsDraft)
                                        .frame(minHeight: 200)
                                        .padding(10)
                                        .scrollContentBackground(.hidden)
                                        .background(Theme.ink2, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                                        .foregroundStyle(Theme.text)
                                    Text("Example: \"I'm Riad from Bosnia. Keep answers short. I run a car-detailing business.\"")
                                        .font(.caption).foregroundStyle(Theme.muted)
                                    Spacer()
                                }
                                .padding(16)
                                .background(Theme.ink.ignoresSafeArea())
                                .navigationTitle("Custom instructions")
                                .navigationBarTitleDisplayMode(.inline)
                                .toolbar {
                                    ToolbarItem(placement: .cancellationAction) { Button("Cancel") { editInstructions = false } }
                                    ToolbarItem(placement: .confirmationAction) {
                                        Button("Save") { instructions = instructionsDraft; editInstructions = false; Haptic.success() }
                                    }
                                }
                            }
                        }

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

                        // Updates
                        VStack(alignment: .leading, spacing: 10) {
                            SectionHeader(title: "Updates")
                            HStack {
                                Label("Version", systemImage: "app.badge").foregroundStyle(Theme.text)
                                Spacer()
                                Text("v\(appVersion)").foregroundStyle(Theme.muted)
                            }.font(.subheadline)
                            Button {
                                checking = true
                                Task { await updater.check(); checking = false; showUpdate = true }
                            } label: {
                                HStack {
                                    if checking { ProgressView().tint(Theme.text) }
                                    Label(updater.latest != nil ? "Update to v\(updater.latest!)" : "Set up auto-updates", systemImage: "arrow.down.circle")
                                        .foregroundStyle(Theme.text)
                                    Spacer()
                                    Image(systemName: "chevron.right").font(.caption).foregroundStyle(Theme.muted)
                                }
                            }
                            Text("Add AskAI's source to SideStore once and the app updates itself — no re-sideloading.")
                                .font(.caption).foregroundStyle(Theme.muted)
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
            .sheet(isPresented: $showUpdate) { UpdateSheet(updater: updater) }
            .confirmationDialog("Sign out of AskAI?", isPresented: $confirmSignOut, titleVisibility: .visible) {
                Button("Sign out", role: .destructive) { Haptic.warning(); app.signOut() }
                Button("Cancel", role: .cancel) {}
            }
        }
    }
}
