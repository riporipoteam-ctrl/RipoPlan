import SwiftUI

struct MainTabView: View {
    @EnvironmentObject var app: AppState
    @State private var tab: Tab = .home

    enum Tab: String, CaseIterable {
        case home, chats, agents, activity, settings
        var icon: String {
            switch self {
            case .home: return "sparkles"
            case .chats: return "bubble.left.and.bubble.right.fill"
            case .agents: return "person.3.fill"
            case .activity: return "bolt.fill"
            case .settings: return "gearshape.fill"
            }
        }
        var title: String { rawValue.capitalized }
    }

    var body: some View {
        ZStack(alignment: .bottom) {
            Theme.ink.ignoresSafeArea()
            ZStack {
                root(.home) { HomeView() }
                root(.chats) { ChatsView() }
                root(.agents) { AgentsView() }
                root(.activity) { ActivityView() }
                root(.settings) { SettingsView() }
            }
            if !app.hideTabBar {
                tabBar.transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.easeInOut(duration: 0.25), value: app.hideTabBar)
    }

    @ViewBuilder
    private func root<V: View>(_ t: Tab, @ViewBuilder _ content: () -> V) -> some View {
        content()
            .opacity(tab == t ? 1 : 0)
            .allowsHitTesting(tab == t)
            .zIndex(tab == t ? 1 : 0)
    }

    private var tabBar: some View {
        HStack(spacing: 0) {
            ForEach(Tab.allCases, id: \.self) { t in
                let active = tab == t
                Button {
                    Haptic.light()
                    withAnimation(.spring(response: 0.35, dampingFraction: 0.7)) { tab = t }
                } label: {
                    VStack(spacing: 4) {
                        ZStack {
                            if t == .activity && app.unread > 0 {
                                Image(systemName: t.icon)
                                    .overlay(alignment: .topTrailing) {
                                        Circle().fill(Theme.bad).frame(width: 8, height: 8).offset(x: 6, y: -4)
                                    }
                            } else {
                                Image(systemName: t.icon)
                            }
                        }
                        .font(.system(size: 19, weight: active ? .bold : .regular))
                        .foregroundStyle(active ? AnyShapeStyle(Theme.accentGradient) : AnyShapeStyle(Theme.muted))
                        .scaleEffect(active ? 1.08 : 1)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 4)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 10)
        .padding(.top, 12)
        .padding(.bottom, 4)
        .background(
            .ultraThinMaterial,
            in: RoundedRectangle(cornerRadius: 26, style: .continuous)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 26, style: .continuous)
                .stroke(Theme.stroke, lineWidth: 1)
        )
        .padding(.horizontal, 16)
        .padding(.bottom, 6)
        .shadow(color: .black.opacity(0.4), radius: 18, y: 8)
    }
}
