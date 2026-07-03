import SwiftUI

enum ShellSheet: String, Identifiable {
    case agents, apps, activity, jobs, knowledge, integrations, channels, ranks
    var id: String { rawValue }
}

/// The signed-in app: a single conversation surface with a top bar (menu + new
/// chat) and a swipe-in left sidebar. No bottom tab bar — pages live in the drawer.
struct RootShell: View {
    @EnvironmentObject var app: AppState
    @State private var showSidebar = false
    @State private var current: String? = nil
    @State private var showSettings = false
    @State private var sheet: ShellSheet?
    @State private var dragX: CGFloat = 0
    @State private var showRenameChat = false
    @State private var renameChatDraft = ""
    @StateObject private var updater = UpdateChecker()

    /// Any chat (other than the open one) with an agent reply you haven't seen.
    private var hasUnread: Bool {
        app.threads.contains { app.isUnread($0) && $0.id != current }
    }

    private let sidebarWidth: CGFloat = 300

    /// How far the main screen has slid right (drives the ChatGPT push effect).
    private var slide: CGFloat {
        if showSidebar { return max(0, min(sidebarWidth + 12, sidebarWidth + 12 + dragX)) }
        return max(0, min(sidebarWidth + 12, dragX))
    }

    var body: some View {
        ZStack(alignment: .leading) {
            // Sidebar lives BEHIND the main screen (ChatGPT push style).
            SidebarView(current: $current, open: $showSidebar,
                        openSettings: { showSettings = true },
                        openSheet: { sheet = $0 })
                .frame(width: sidebarWidth)
                .offset(x: (slide / (sidebarWidth + 12) - 1) * 44)   // subtle parallax
                // Fully hidden while closed so it can't bleed through safe areas.
                .opacity(slide <= 0 ? 0 : Double(0.35 + 0.65 * slide / (sidebarWidth + 12)))

            // Main column — slides right and rounds its corners when the drawer opens.
            ZStack(alignment: .top) {
                ConversationView(threadId: $current, topInset: 54)
                // Clean solid bar (ChatGPT-style) — no grey band, no hairline.
                VStack(spacing: 0) {
                    topBar
                    UpdateBanner(updater: updater)
                }
                .background(Theme.ink)
            }
            .background(Theme.ink)
            .clipShape(RoundedRectangle(cornerRadius: slide > 4 ? 36 : 0, style: .continuous))
            .overlay {
                // Scrim while the drawer is open — tap anywhere to close.
                if showSidebar {
                    Color.black.opacity(0.05)
                        .clipShape(RoundedRectangle(cornerRadius: 36, style: .continuous))
                        .onTapGesture { setSidebar(false) }
                        .transition(.opacity)
                }
            }
            .shadow(color: .black.opacity(slide > 4 ? 0.22 : 0), radius: 24, x: -6)
            .offset(x: slide)
        }
        .background(Theme.ink.ignoresSafeArea())
        .animation(.spring(response: 0.35, dampingFraction: 0.85), value: showSidebar)
        .gesture(edgeDrag)
        .sheet(isPresented: $showSettings) { SettingsView().environmentObject(app) }
        .sheet(item: $sheet) { s in
            Group {
                switch s {
                case .agents: AgentsView().environmentObject(app)
                case .activity: ActivityView().environmentObject(app)
                case .apps: AppsView().environmentObject(app)
                case .jobs: JobsView().environmentObject(app)
                case .knowledge: KnowledgeView().environmentObject(app)
                case .integrations: IntegrationsView().environmentObject(app)
                case .channels: ChannelsView().environmentObject(app)
                case .ranks: RanksView().environmentObject(app)
                }
            }
            .tint(Theme.accent)
        }
        .alert("Rename chat", isPresented: $showRenameChat) {
            TextField("Chat name", text: $renameChatDraft)
            Button("Cancel", role: .cancel) {}
            Button("Save") {
                if let id = current, !renameChatDraft.trimmingCharacters(in: .whitespaces).isEmpty {
                    Task { await app.renameThread(id, to: renameChatDraft) }
                }
            }
        }
        .onChange(of: current) { _ in } // triggers ConversationView reload via binding
        .onAppear { applyScreenshotHook() }
        .task { await updater.check() }
    }

    // Gemini-style floating top bar: circular menu, center model selector pill,
    // circular new-chat. Content scrolls underneath.
    private var topBar: some View {
        HStack(spacing: 10) {
            Button { Haptic.light(); setSidebar(true) } label: {
                Image(systemName: "line.3.horizontal").font(.system(size: 18, weight: .semibold)).foregroundStyle(Theme.text)
                    .frame(width: 40, height: 40).glassCircle()
                    .overlay(alignment: .topTrailing) {
                        if hasUnread {
                            Circle().fill(Theme.blue).frame(width: 10, height: 10)
                                .overlay(Circle().stroke(Theme.ink, lineWidth: 2))
                                .offset(x: 1, y: -1)
                                .transition(.scale.combined(with: .opacity))
                        }
                    }
            }
            Spacer(minLength: 0)
            Text("AskAI")
                .font(.system(size: 18, weight: .bold))
                .foregroundStyle(Theme.text)
            Spacer(minLength: 0)
            if current != nil {
                // ChatGPT chat header: [new chat | ⋯] in one glass pill.
                HStack(spacing: 0) {
                    Button { Haptic.light(); current = nil } label: {
                        Image(systemName: "square.and.pencil").font(.system(size: 16, weight: .medium)).foregroundStyle(Theme.text)
                            .frame(width: 42, height: 40)
                    }
                    Rectangle().fill(Theme.stroke).frame(width: 1, height: 20)
                    Menu {
                        Button {
                            renameChatDraft = app.threads.first { $0.id == current }?.title ?? ""
                            showRenameChat = true
                        } label: { Label("Rename chat", systemImage: "pencil") }
                        Button(role: .destructive) {
                            let id = current
                            current = nil
                            if let id { Task { await app.deleteThread(id) } }
                        } label: { Label("Delete chat", systemImage: "trash") }
                    } label: {
                        Image(systemName: "ellipsis").font(.system(size: 16, weight: .medium)).foregroundStyle(Theme.text)
                            .frame(width: 42, height: 40)
                    }
                }
                .glassCapsule()
            } else {
                Button { Haptic.light(); current = nil } label: {
                    Image(systemName: "square.and.pencil").font(.system(size: 17, weight: .medium)).foregroundStyle(Theme.text)
                        .frame(width: 40, height: 40).glassCircle()
                }
            }
        }
        .padding(.horizontal, 14).padding(.top, 6).padding(.bottom, 4)
    }

    private var edgeDrag: some Gesture {
        DragGesture(minimumDistance: 10)
            .onChanged { v in
                if !showSidebar && v.startLocation.x < 80 && v.translation.width > 0 {
                    dragX = min(v.translation.width, sidebarWidth)
                } else if showSidebar && v.translation.width < 0 {
                    dragX = max(v.translation.width, -sidebarWidth)
                }
            }
            .onEnded { v in
                // Generous zone + low threshold (velocity counts) — easy to open.
                let opening = !showSidebar && v.startLocation.x < 80 &&
                              (v.translation.width > 40 || v.predictedEndTranslation.width > 120)
                let closing = showSidebar &&
                              (v.translation.width < -40 || v.predictedEndTranslation.width < -120)
                dragX = 0
                if opening { setSidebar(true) }
                else if closing { setSidebar(false) }
            }
    }

    private func setSidebar(_ on: Bool) {
        if on { hideKeyboard() }   // drawer open = reading mode, keyboard away
        withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) { showSidebar = on; dragX = 0 }
        if on { Haptic.soft() }
    }

    // CI/screenshot hook: open a page/thread per ASKAI_SCREEN.
    private func applyScreenshotHook() {
        let s = ProcessInfo.processInfo.environment["ASKAI_SCREEN"] ?? ""
        switch s {
        case "chat": Task { for _ in 0..<20 where app.threads.isEmpty { try? await Task.sleep(nanoseconds: 300_000_000) }; current = app.threads.first?.id }
        case "agents": sheet = .agents
        case "apps": sheet = .apps
        case "activity": sheet = .activity
        case "jobs": sheet = .jobs
        case "knowledge": sheet = .knowledge
        case "integrations": sheet = .integrations
        case "channels": sheet = .channels
        case "settings": showSettings = true
        case "sidebar": setSidebar(true)
        default: break
        }
    }
}
