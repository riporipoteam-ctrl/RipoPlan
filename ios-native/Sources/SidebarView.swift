import SwiftUI

/// ChatGPT-style drawer: big wordmark + search, plain nav rows, a "More"
/// expander, plain Recents rows with a blue unread dot, and a floating blue
/// "Chat" button with the account avatar at the bottom.
struct SidebarView: View {
    @EnvironmentObject var app: AppState
    @Binding var current: String?
    @Binding var open: Bool
    var openSettings: () -> Void
    var openSheet: (ShellSheet) -> Void

    @State private var search = ""
    @State private var searching = false
    @State private var showMore = false
    @State private var showRename = false
    @State private var renameTarget: String?
    @State private var renameDraft = ""
    @FocusState private var searchFocus: Bool

    private var filtered: [ThreadRow] {
        guard !search.isEmpty else { return app.threads }
        return app.threads.filter { ($0.title ?? "").localizedCaseInsensitiveContains(search) }
    }

    /// ChatGPT-style recency sections: Today / Yesterday / Previous 7 days / Older.
    private var grouped: [(String, [ThreadRow])] {
        let cal = Calendar.current
        var today: [ThreadRow] = [], yesterday: [ThreadRow] = [], week: [ThreadRow] = [], older: [ThreadRow] = []
        for t in filtered {
            let d = RelTime.parse(t.last_activity_at ?? t.created_at) ?? .distantPast
            if cal.isDateInToday(d) { today.append(t) }
            else if cal.isDateInYesterday(d) { yesterday.append(t) }
            else if d > Date().addingTimeInterval(-7 * 86400) { week.append(t) }
            else { older.append(t) }
        }
        var out: [(String, [ThreadRow])] = []
        if !today.isEmpty { out.append(("Today", today)) }
        if !yesterday.isEmpty { out.append(("Yesterday", yesterday)) }
        if !week.isEmpty { out.append(("Previous 7 days", week)) }
        if !older.isEmpty { out.append(("Older", older)) }
        return out
    }

    var body: some View {
        ZStack(alignment: .bottom) {
            VStack(alignment: .leading, spacing: 0) {
                // Header — big wordmark + circular search toggle (ChatGPT layout).
                HStack {
                    Text("AskAI").font(.system(size: 28, weight: .bold)).foregroundStyle(Theme.text)
                    Spacer()
                    Button {
                        Haptic.light()
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { searching.toggle() }
                        searchFocus = searching
                        if !searching { search = "" }
                    } label: {
                        Image(systemName: "magnifyingglass")
                            .font(.system(size: 17, weight: .medium)).foregroundStyle(Theme.text)
                            .frame(width: 40, height: 40).glassCircle()
                    }
                    .buttonStyle(.plain)
                }
                .padding(.horizontal, 20).padding(.top, 10).padding(.bottom, 6)

                if searching {
                    HStack(spacing: 8) {
                        Image(systemName: "magnifyingglass").foregroundStyle(Theme.muted)
                        TextField("Search chats", text: $search)
                            .focused($searchFocus)
                            .foregroundStyle(Theme.text).tint(Theme.text)
                    }
                    .padding(.horizontal, 12).padding(.vertical, 9)
                    .background(Theme.ink2, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .padding(.horizontal, 16).padding(.bottom, 4)
                    .transition(.opacity.combined(with: .move(edge: .top)))
                }

                ScrollView {
                    VStack(alignment: .leading, spacing: 0) {
                        navRow("person.2", "Agents") { openSheet(.agents) }
                        navRow("number", "Channels") { openSheet(.channels) }
                        navRow("square.grid.2x2", "Apps") { openSheet(.apps) }
                        Button {
                            Haptic.light()
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) { showMore.toggle() }
                        } label: {
                            HStack(spacing: 14) {
                                Image(systemName: "ellipsis").font(.system(size: 17, weight: .medium))
                                    .foregroundStyle(Theme.text).frame(width: 26)
                                Text("More").font(.system(size: 19, weight: .semibold)).foregroundStyle(Theme.text)
                                Spacer()
                                Image(systemName: "chevron.down").font(.caption.weight(.semibold))
                                    .foregroundStyle(Theme.muted)
                                    .rotationEffect(.degrees(showMore ? 180 : 0))
                            }
                            .padding(.horizontal, 20).padding(.vertical, 11)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        if showMore {
                            Group {
                                navRow("clock.arrow.circlepath", "Jobs") { openSheet(.jobs) }
                                navRow("book", "Knowledge") { openSheet(.knowledge) }
                                navRow("puzzlepiece.extension", "Integrations") { openSheet(.integrations) }
                                navRow("bell", "Activity") { openSheet(.activity) }
                                navRow("trophy", "Ranks") { openSheet(.ranks) }
                            }
                            .transition(.opacity.combined(with: .move(edge: .top)))
                        }

                        Text("Recents").font(.system(size: 20, weight: .bold)).foregroundStyle(Theme.text)
                            .padding(.horizontal, 20).padding(.top, 22).padding(.bottom, 2)

                        ForEach(grouped, id: \.0) { section, rows in
                            Text(section)
                                .font(.footnote.weight(.semibold)).foregroundStyle(Theme.muted)
                                .padding(.horizontal, 20).padding(.top, 12).padding(.bottom, 2)
                            ForEach(rows) { t in
                                threadRow(t)
                            }
                        }
                        Spacer(minLength: 90)
                    }
                    .padding(.top, 8)
                }
                .refreshable { await app.loadThreads() }
            }

            // Floating bottom controls — blue Chat pill + account avatar.
            HStack {
                Button { Haptic.medium(); newChat() } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "square.and.pencil").font(.system(size: 16, weight: .semibold))
                        Text("Chat").font(.system(size: 18, weight: .bold))
                    }
                    .foregroundStyle(.white)
                    .padding(.horizontal, 22).padding(.vertical, 13)
                    .background(Theme.blue, in: Capsule())
                    .shadow(color: Theme.blue.opacity(0.4), radius: 12, y: 5)
                }
                .buttonStyle(.plain)
                .pressable()
                Spacer()
                Button { Haptic.light(); openSettings() } label: {
                    Avatar(name: app.profile?.display_name ?? "You", color: app.profile?.avatar_color, size: 44)
                        .overlay(Circle().stroke(Theme.stroke, lineWidth: 1))
                        .shadow(color: .black.opacity(0.12), radius: 8, y: 3)
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 18).padding(.bottom, 12)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(Theme.ink.ignoresSafeArea())
        .task { await app.loadThreads() }
        .onChange(of: open) { o in if o { Task { await app.loadThreads() } } }
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

    private func threadRow(_ t: ThreadRow) -> some View {
        Button { Haptic.light(); current = t.id; app.markRead(t.id); close() } label: {
            HStack(spacing: 8) {
                Text(t.title ?? "New chat")
                    .font(.system(size: 18))
                    .foregroundStyle(Theme.text).lineLimit(1)
                Spacer()
                if app.isUnread(t) && current != t.id {
                    Circle().fill(Theme.blue).frame(width: 9, height: 9)
                        .transition(.scale.combined(with: .opacity))
                }
            }
            .padding(.horizontal, 20).padding(.vertical, 11)
            .background(current == t.id ? Theme.ink2 : Color.clear,
                        in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .contentShape(Rectangle())
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

    private func navRow(_ icon: String, _ label: String, _ action: @escaping () -> Void) -> some View {
        Button { Haptic.light(); action(); close() } label: {
            HStack(spacing: 14) {
                Image(systemName: icon).font(.system(size: 17, weight: .medium))
                    .foregroundStyle(Theme.text).frame(width: 26)
                Text(label).font(.system(size: 19, weight: .semibold)).foregroundStyle(Theme.text)
                Spacer()
            }
            .padding(.horizontal, 20).padding(.vertical, 11)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func newChat() { current = nil; close() }
    private func close() { withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) { open = false } }
}
