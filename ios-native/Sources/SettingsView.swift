import SwiftUI
import PhotosUI

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
    @State private var showWorkspace = false
    @State private var photoItem: PhotosPickerItem?
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
                        // Profile header — tap the photo to change it, name to edit it.
                        VStack(spacing: 10) {
                            PhotosPicker(selection: $photoItem, matching: .images) {
                                Avatar(name: app.profile?.display_name ?? "You", color: app.profile?.avatar_color,
                                       size: 84, imageURL: app.profile?.avatar_url)
                                    .overlay(alignment: .bottomTrailing) {
                                        Image(systemName: "camera.fill").font(.system(size: 11, weight: .bold))
                                            .foregroundStyle(Theme.onAccent)
                                            .frame(width: 26, height: 26)
                                            .background(Theme.accent, in: Circle())
                                            .overlay(Circle().stroke(Theme.ink, lineWidth: 2))
                                    }
                            }
                            .buttonStyle(.plain)
                            Button {
                                nameDraft = app.profile?.display_name ?? ""; editName = true
                            } label: {
                                HStack(spacing: 6) {
                                    Text(app.profile?.display_name ?? "You").font(.title2.bold()).foregroundStyle(Theme.text)
                                    Image(systemName: "pencil").font(.caption).foregroundStyle(Theme.muted)
                                }
                            }
                            .buttonStyle(.plain)
                            Text(app.profile?.email ?? "").font(.subheadline).foregroundStyle(Theme.muted)
                        }
                        .frame(maxWidth: .infinity).card(radius: 20)
                        .onChange(of: photoItem) { item in
                            guard let item else { return }
                            Task {
                                if let data = try? await item.loadTransferable(type: Data.self),
                                   let att = await app.upload(data: data, ext: "jpg", contentType: "image/jpeg", name: "avatar.jpg") {
                                    await app.updateProfileAvatar(att.url)
                                    Haptic.success()
                                }
                                photoItem = nil
                            }
                        }
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

                            Button { showWorkspace = true } label: {
                                HStack {
                                    Label("Workspace", systemImage: "building.2").foregroundStyle(Theme.text)
                                    Spacer()
                                    Text(app.workspace?.name ?? "—").font(.subheadline).foregroundStyle(Theme.muted).lineLimit(1)
                                    Image(systemName: "chevron.right").font(.caption).foregroundStyle(Theme.muted)
                                }
                            }
                            Text("Picture, name and your whole agent team.")
                                .font(.caption).foregroundStyle(Theme.muted)
                        }
                        .card(radius: 16)
                        .sheet(isPresented: $showWorkspace) { WorkspaceSheet().environmentObject(app) }
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

/// Full workspace editor — picture, name, and the whole team at a glance.
struct WorkspaceSheet: View {
    @EnvironmentObject var app: AppState
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var photoItem: PhotosPickerItem?
    @State private var saving = false

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.ink.ignoresSafeArea()
                ScrollView {
                    VStack(spacing: 16) {
                        // Picture + name
                        VStack(spacing: 12) {
                            PhotosPicker(selection: $photoItem, matching: .images) {
                                ZStack {
                                    if let s = app.workspace?.avatar_url, !s.isEmpty, let u = URL(string: s) {
                                        AsyncImage(url: u) { i in i.resizable().scaledToFill() } placeholder: {
                                            Image(systemName: "building.2.fill").font(.title).foregroundStyle(Theme.muted)
                                        }
                                    } else {
                                        Image(systemName: "building.2.fill").font(.title).foregroundStyle(Theme.muted)
                                    }
                                }
                                .frame(width: 92, height: 92)
                                .background(Theme.ink2)
                                .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
                                .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).stroke(Theme.stroke, lineWidth: 1))
                                .overlay(alignment: .bottomTrailing) {
                                    Image(systemName: "camera.fill").font(.system(size: 11, weight: .bold))
                                        .foregroundStyle(Theme.onAccent)
                                        .frame(width: 26, height: 26)
                                        .background(Theme.accent, in: Circle())
                                        .overlay(Circle().stroke(Theme.ink, lineWidth: 2))
                                        .offset(x: 6, y: 6)
                                }
                            }
                            .buttonStyle(.plain)
                            HStack(spacing: 8) {
                                TextField("Workspace name", text: $name)
                                    .font(.title3.weight(.semibold))
                                    .multilineTextAlignment(.center)
                                    .foregroundStyle(Theme.text).tint(Theme.text)
                                    .padding(.horizontal, 12).padding(.vertical, 9)
                                    .background(Theme.ink2, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                                Button {
                                    saving = true
                                    Task { await app.renameWorkspace(to: name); saving = false; Haptic.success() }
                                } label: {
                                    if saving { ProgressView().tint(Theme.onAccent) }
                                    else { Text("Save").fontWeight(.semibold) }
                                }
                                .padding(.horizontal, 16).padding(.vertical, 10)
                                .background(Theme.accent, in: Capsule())
                                .foregroundStyle(Theme.onAccent)
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .card(radius: 20)

                        // Stats
                        HStack(spacing: 10) {
                            wsStat("\(app.agents.count)", "Agents")
                            wsStat("\(app.threads.count)", "Chats")
                            wsStat("\(app.agents.filter { $0.is_supervisor == true }.count)", "Leads")
                        }

                        // Team
                        VStack(alignment: .leading, spacing: 12) {
                            SectionHeader(title: "Team")
                            ForEach(app.agents) { a in
                                HStack(spacing: 12) {
                                    AgentAvatar(name: a.name, color: a.avatar_color, size: 40,
                                                online: false, spark: a.is_supervisor == true,
                                                imageURL: a.avatar_url)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(a.name).fontWeight(.semibold).foregroundStyle(Theme.text)
                                        Text(a.role ?? "Agent").font(.caption).foregroundStyle(Theme.muted)
                                    }
                                    Spacer()
                                    if a.is_supervisor == true {
                                        Text("Chief").font(.caption2.weight(.bold))
                                            .padding(.horizontal, 8).padding(.vertical, 4)
                                            .background(Theme.ink3, in: Capsule())
                                            .foregroundStyle(Theme.text)
                                    }
                                }
                            }
                        }
                        .card(radius: 16)
                        Spacer(minLength: 30)
                    }
                    .padding(16)
                }
            }
            .navigationTitle("Workspace")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } } }
            .onAppear { name = app.workspace?.name ?? "" }
            .onChange(of: photoItem) { item in
                guard let item else { return }
                Task {
                    if let data = try? await item.loadTransferable(type: Data.self),
                       let att = await app.upload(data: data, ext: "jpg", contentType: "image/jpeg", name: "workspace.jpg") {
                        await app.setWorkspaceAvatar(att.url)
                        Haptic.success()
                    }
                    photoItem = nil
                }
            }
        }
        .tint(Theme.accent)
    }

    private func wsStat(_ value: String, _ label: String) -> some View {
        VStack(spacing: 4) {
            Text(value).font(.title3.bold()).foregroundStyle(Theme.text)
            Text(label).font(.caption).foregroundStyle(Theme.muted)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
        .background(Theme.ink2, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}
