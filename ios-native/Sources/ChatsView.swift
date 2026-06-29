import SwiftUI

struct ChatsView: View {
    @EnvironmentObject var app: AppState
    @State private var path: [String] = []
    @State private var search = ""
    @State private var renaming: ThreadRow?
    @State private var newTitle = ""

    private var filtered: [ThreadRow] {
        guard !search.isEmpty else { return app.threads }
        return app.threads.filter { ($0.title ?? "").localizedCaseInsensitiveContains(search) }
    }

    var body: some View {
        NavigationStack(path: $path) {
            ZStack {
                Theme.backdrop.ignoresSafeArea()
                if app.threads.isEmpty {
                    emptyState
                } else {
                    ScrollView {
                        LazyVStack(spacing: 10) {
                            ForEach(filtered) { t in
                                Button { Haptic.light(); path.append(t.id) } label: { ThreadRowView(thread: t) }
                                    .buttonStyle(.plain)
                                    .contextMenu {
                                        Button { renaming = t; newTitle = t.title ?? "" } label: { Label("Rename", systemImage: "pencil") }
                                        Button(role: .destructive) { Task { await app.deleteThread(t.id) } } label: { Label("Delete", systemImage: "trash") }
                                    }
                            }
                        }
                        .padding(16)
                        .padding(.bottom, 100)
                    }
                    .refreshable { await app.loadThreads() }
                }
            }
            .navigationTitle("Chats")
            .toolbarColorScheme(.dark, for: .navigationBar)
            .searchable(text: $search, prompt: "Search chats")
            .navigationDestination(for: String.self) { tid in
                ChatView(threadId: tid).environmentObject(app)
            }
            .task {
                // CI/screenshot hook: open the first thread for the chat capture.
                if ProcessInfo.processInfo.environment["ASKAI_SCREEN"] == "chat" {
                    for _ in 0..<20 where app.threads.isEmpty {
                        try? await Task.sleep(nanoseconds: 300_000_000)
                    }
                    if let first = app.threads.first, path.isEmpty { path.append(first.id) }
                }
            }
            .alert("Rename chat", isPresented: Binding(get: { renaming != nil }, set: { if !$0 { renaming = nil } })) {
                TextField("Title", text: $newTitle)
                Button("Cancel", role: .cancel) { renaming = nil }
                Button("Save") {
                    if let r = renaming { Task { await app.renameThread(r.id, to: newTitle) } }
                    renaming = nil
                }
            }
        }
    }

    private var emptyState: some View {
        VStack(spacing: 14) {
            SparkMark(size: 50).opacity(0.8)
            Text("No chats yet").font(.title3.bold()).foregroundStyle(Theme.text)
            Text("Start one from the Home tab and your agents get to work.")
                .font(.subheadline).foregroundStyle(Theme.muted)
                .multilineTextAlignment(.center).padding(.horizontal, 40)
        }
    }
}
