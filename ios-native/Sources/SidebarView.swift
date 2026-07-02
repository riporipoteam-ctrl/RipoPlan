import SwiftUI

/// ChatGPT-style left drawer: search, pages, recent chat history, account row.
struct SidebarView: View {
    @EnvironmentObject var app: AppState
    @Binding var current: String?
    @Binding var open: Bool
    var openSettings: () -> Void
    var openSheet: (ShellSheet) -> Void

    @State private var search = ""
    @State private var showRename = false
    @State private var renameTarget: String?
    @State private var renameDraft = ""

    private var filtered: [ThreadRow] {
        guard !search.isEmpty else { return app.threads }
        return app.threads.filter { ($0.title ?? "").localizedCaseInsensitiveContains(search) }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header
            HStack {
                Text("AskAI").font(.system(size: 22, weight: .bold)).foregroundStyle(Theme.text)
                Spacer()
                Button { Haptic.light(); newChat() } label: {
                    Image(systemName: "square.and.pencil").font(.system(size: 18, weight: .medium)).foregroundStyle(Theme.text)
                }
            }
            .padding(.horizontal, 18).padding(.top, 8).padding(.bottom, 12)

            // Search
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass").foregroundStyle(Theme.muted)
                TextField("Search", text: $search).foregroundStyle(Theme.text).tint(Theme.text)
            }
            .padding(.horizontal, 12).padding(.vertical, 9)
            .background(Theme.ink2, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .padding(.horizontal, 14)

            // Pages
            ScrollView {
                VStack(spacing: 2) {
                    navRow("person.2.fill", "Agents", "#8b5cf6") { openSheet(.agents) }
                    navRow("number", "Channels", "#3b82f6") { openSheet(.channels) }
                    navRow("square.grid.2x2.fill", "Apps", "#10b981") { openSheet(.apps) }
                    navRow("clock.arrow.circlepath", "Jobs", "#f59e0b") { openSheet(.jobs) }
                    navRow("book.fill", "Knowledge", "#ec4899") { openSheet(.knowledge) }
                    navRow("puzzlepiece.extension.fill", "Integrations", "#14b8a6") { openSheet(.integrations) }
                    navRow("bell.fill", "Activity", "#ef4444") { openSheet(.activity) }

                    Text("Recents").font(.caption.weight(.semibold)).foregroundStyle(Theme.muted)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 14).padding(.top, 14).padding(.bottom, 4)

                    ForEach(filtered) { t in
                        Button { Haptic.light(); current = t.id; close() } label: {
                            HStack {
                                Text(t.title ?? "New chat").foregroundStyle(Theme.text).lineLimit(1)
                                Spacer()
                            }
                            .padding(.horizontal, 14).padding(.vertical, 10)
                            .background(current == t.id ? Theme.ink2 : Color.clear, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                        }
                        .buttonStyle(.plain)
                        .contextMenu {
                            Button { renameTarget = t.id; renameDraft = t.title ?? ""; showRename = true } label: {
                                Label("Rename", systemImage: "pencil")
                            }
                            Button(role: .destructive) { Task { await app.deleteThread(t.id); if current == t.id { current = nil } } } label: {
                                Label("Delete", systemImage: "trash")
                            }
                        }
                    }
                }
                .padding(.horizontal, 8).padding(.top, 10)
            }

            Divider().overlay(Theme.stroke)

            // Account row
            Button { Haptic.light(); openSettings() } label: {
                HStack(spacing: 10) {
                    Avatar(name: app.profile?.display_name ?? "You", color: app.profile?.avatar_color, size: 34)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(app.profile?.display_name ?? "You").foregroundStyle(Theme.text).fontWeight(.semibold).lineLimit(1)
                        Text(app.profile?.email ?? "Account").font(.caption).foregroundStyle(Theme.muted).lineLimit(1)
                    }
                    Spacer()
                    Image(systemName: "gearshape").foregroundStyle(Theme.muted)
                }
                .padding(.horizontal, 16).padding(.vertical, 12)
            }
            .buttonStyle(.plain)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(Theme.ink.ignoresSafeArea())
        .overlay(alignment: .trailing) { Rectangle().fill(Theme.stroke).frame(width: 1).ignoresSafeArea() }
        .alert("Rename chat", isPresented: $showRename) {
            TextField("Chat name", text: $renameDraft)
            Button("Cancel", role: .cancel) {}
            Button("Save") {
                if let id = renameTarget, !renameDraft.trimmingCharacters(in: .whitespaces).isEmpty {
                    Task { await app.renameThread(id, to: renameDraft) }
                }
            }
        }
    }

    private func navRow(_ icon: String, _ label: String, _ tint: String, _ action: @escaping () -> Void) -> some View {
        Button { Haptic.light(); action(); close() } label: {
            HStack(spacing: 12) {
                Image(systemName: icon).font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Color(hexString: tint))
                    .frame(width: 28, height: 28)
                    .background(Color(hexString: tint).opacity(0.14), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                Text(label).foregroundStyle(Theme.text).fontWeight(.medium)
                Spacer()
                Image(systemName: "chevron.right").font(.caption2).foregroundStyle(Theme.muted.opacity(0.6))
            }
            .padding(.horizontal, 14).padding(.vertical, 8)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func newChat() { current = nil; close() }
    private func close() { withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) { open = false } }
}
