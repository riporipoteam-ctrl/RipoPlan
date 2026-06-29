import SwiftUI

enum ShellSheet: String, Identifiable {
    case agents, apps, activity, jobs, knowledge, integrations, channels
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

    private let sidebarWidth: CGFloat = 300

    var body: some View {
        ZStack(alignment: .leading) {
            // Main column — content scrolls under the frosted top bar.
            ZStack(alignment: .top) {
                ConversationView(threadId: $current, topInset: 50)
                topBar
            }
            .background(AuroraBackground())
            .disabled(showSidebar)

            // Dim overlay
            if showSidebar {
                Color.black.opacity(0.35)
                    .ignoresSafeArea()
                    .transition(.opacity)
                    .onTapGesture { setSidebar(false) }
            }

            // Sidebar
            SidebarView(current: $current, open: $showSidebar,
                        openSettings: { showSettings = true },
                        openSheet: { sheet = $0 })
                .frame(width: sidebarWidth)
                .offset(x: showSidebar ? 0 : -sidebarWidth - 10)
                .offset(x: showSidebar ? min(0, dragX) : max(-sidebarWidth - 10, dragX))
        }
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
                }
            }
            .tint(Theme.accent)
        }
        .onChange(of: current) { _ in } // triggers ConversationView reload via binding
        .onAppear { applyScreenshotHook() }
    }

    private var topBar: some View {
        ZStack {
            Text(current == nil ? "AskAI" : (app.threads.first { $0.id == current }?.title ?? "Chat"))
                .font(.headline).foregroundStyle(Theme.text).lineLimit(1).padding(.horizontal, 60)
            HStack {
                Button { Haptic.light(); setSidebar(true) } label: {
                    Image(systemName: "line.3.horizontal").font(.system(size: 19, weight: .semibold)).foregroundStyle(Theme.text)
                }
                Spacer()
                Button { Haptic.light(); current = nil } label: {
                    Image(systemName: "square.and.pencil").font(.system(size: 18, weight: .medium)).foregroundStyle(Theme.text)
                }
            }
            .padding(.horizontal, 16)
        }
        .frame(height: 50)
        .background(.ultraThinMaterial)
        .overlay(Divider().overlay(Theme.stroke), alignment: .bottom)
    }

    private var edgeDrag: some Gesture {
        DragGesture(minimumDistance: 12)
            .onChanged { v in
                if !showSidebar && v.startLocation.x < 28 && v.translation.width > 0 {
                    dragX = min(v.translation.width, sidebarWidth)
                } else if showSidebar && v.translation.width < 0 {
                    dragX = max(v.translation.width, -sidebarWidth)
                }
            }
            .onEnded { v in
                let opening = !showSidebar && v.startLocation.x < 28 && v.translation.width > 70
                let closing = showSidebar && v.translation.width < -70
                dragX = 0
                if opening { setSidebar(true) }
                else if closing { setSidebar(false) }
            }
    }

    private func setSidebar(_ on: Bool) {
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
        case "settings": showSettings = true
        case "sidebar": setSidebar(true)
        default: break
        }
    }
}
