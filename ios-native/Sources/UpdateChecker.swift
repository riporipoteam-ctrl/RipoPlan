import SwiftUI
import UIKit

/// Checks the published SideStore/AltStore source for a newer build and drives the
/// in-app "Update available" banner. The app auto-updates via SideStore once the
/// source is added; this banner is the nudge + one-tap path.
@MainActor
final class UpdateChecker: ObservableObject {
    @Published var latest: String?          // latest version string, if newer
    @Published var dismissed = false

    // Stable rolling-release asset URLs.
    static let sourceURL = "https://github.com/riporipoteam-ctrl/RipoPlan/releases/download/ios-latest/altstore.json"
    static let ipaURL = "https://github.com/riporipoteam-ctrl/RipoPlan/releases/download/ios-latest/AskAI-unsigned.ipa"
    // SideStore (on-device) deep links — one tap, no PC.
    //   install: download + install the new build right now.
    //   source:  add the source once so future updates install in the background.
    static var installURL: URL? { URL(string: "sidestore://install?url=\(ipaURL)") }
    static var addSourceURL: URL? { URL(string: "sidestore://source?url=\(sourceURL)") }

    var current: String { Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.0" }
    var available: Bool { latest != nil && !dismissed }

    func check() async {
        guard let u = URL(string: Self.sourceURL) else { return }
        var req = URLRequest(url: u); req.cachePolicy = .reloadIgnoringLocalCacheData; req.timeoutInterval = 15
        guard let (d, _) = try? await URLSession.shared.data(for: req),
              let j = try? JSONSerialization.jsonObject(with: d) as? [String: Any],
              let apps = j["apps"] as? [[String: Any]],
              let v = apps.first?["version"] as? String else { return }
        if Self.isNewer(v, than: current) { latest = v }
    }

    static func isNewer(_ a: String, than b: String) -> Bool {
        let x = a.split(separator: ".").map { Int($0) ?? 0 }
        let y = b.split(separator: ".").map { Int($0) ?? 0 }
        for i in 0..<max(x.count, y.count) {
            let l = i < x.count ? x[i] : 0, r = i < y.count ? y[i] : 0
            if l != r { return l > r }
        }
        return false
    }
}

/// Slim banner shown at the top of the app when a newer build is available.
struct UpdateBanner: View {
    @ObservedObject var updater: UpdateChecker
    @State private var showSheet = false
    @Environment(\.openURL) private var openURL

    var body: some View {
        if updater.available, let v = updater.latest {
            HStack(spacing: 8) {
                Image(systemName: "arrow.down.circle.fill").foregroundStyle(Theme.accent)
                Button { Haptic.light(); showSheet = true } label: {
                    Text("Update available · v\(v)").font(.caption.weight(.semibold)).foregroundStyle(Theme.text)
                    Spacer(minLength: 0)
                }.buttonStyle(.plain)
                Spacer(minLength: 0)
                // One press → installs the new build in SideStore, on-device, no PC.
                Button { Haptic.medium(); if let u = UpdateChecker.installURL { openURL(u) } } label: {
                    Text("Update").font(.caption.weight(.bold)).foregroundStyle(Theme.onAccent)
                        .padding(.horizontal, 12).padding(.vertical, 5)
                        .background(Theme.accent, in: Capsule())
                }.buttonStyle(.plain)
                Button { withAnimation { updater.dismissed = true } } label: {
                    Image(systemName: "xmark").font(.caption2).foregroundStyle(Theme.muted)
                }.buttonStyle(.plain)
            }
            .padding(.horizontal, 14).padding(.vertical, 8)
            .background(.ultraThinMaterial)
            .overlay(Divider().overlay(Theme.stroke), alignment: .bottom)
            .transition(.move(edge: .top).combined(with: .opacity))
            .sheet(isPresented: $showSheet) { UpdateSheet(updater: updater) }
        }
    }
}

/// Explains how to update: one-tap into SideStore (auto-update), or download the .ipa.
struct UpdateSheet: View {
    @ObservedObject var updater: UpdateChecker
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    @State private var copied = false

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.ink.ignoresSafeArea()
                ScrollView {
                    VStack(spacing: 16) {
                        Image(systemName: "arrow.down.circle.fill").font(.system(size: 54)).foregroundStyle(Theme.accent).padding(.top, 8)
                        Text(updater.latest != nil ? "AskAI v\(updater.latest!) is ready" : "Set up auto-updates").font(.title2.bold()).foregroundStyle(Theme.text)
                        Text(updater.latest != nil
                             ? "You're on v\(updater.current). Update to get the latest features and fixes."
                             : "You're on v\(updater.current) — the latest. Add the source below so future updates install automatically.")
                            .font(.subheadline).foregroundStyle(Theme.muted).multilineTextAlignment(.center).padding(.horizontal, 20)

                        // One press → SideStore installs the new build on-device, no PC.
                        if updater.latest != nil {
                            VStack(alignment: .leading, spacing: 10) {
                                SectionHeader(title: "Update now")
                                Text("One tap — SideStore downloads and installs it right on your iPhone. No computer.")
                                    .font(.caption).foregroundStyle(Theme.muted)
                                Button {
                                    if let u = UpdateChecker.installURL { openURL(u) }
                                } label: {
                                    Label("Update now in SideStore", systemImage: "arrow.down.app.fill")
                                        .fontWeight(.bold).frame(maxWidth: .infinity).padding(.vertical, 14)
                                        .background(Theme.accent, in: RoundedRectangle(cornerRadius: 14)).foregroundStyle(Theme.onAccent)
                                }
                            }
                            .card(radius: 16)
                        }

                        VStack(alignment: .leading, spacing: 10) {
                            SectionHeader(title: "Auto-update (set once)")
                            Text("Add AskAI's source to SideStore once — then every future update installs by itself in the background, zero taps.")
                                .font(.caption).foregroundStyle(Theme.muted)
                            Button {
                                if let u = UpdateChecker.addSourceURL { openURL(u) }
                            } label: {
                                Label("Add source to SideStore", systemImage: "plus.app.fill")
                                    .font(.subheadline.weight(.semibold)).frame(maxWidth: .infinity).padding(.vertical, 12)
                                    .background(Theme.ink3, in: RoundedRectangle(cornerRadius: 14)).foregroundStyle(Theme.text)
                            }
                            Button {
                                UIPasteboard.general.string = UpdateChecker.sourceURL
                                copied = true; Haptic.success()
                            } label: {
                                Label(copied ? "Copied source URL" : "Copy source URL", systemImage: copied ? "checkmark" : "doc.on.doc")
                                    .font(.caption).frame(maxWidth: .infinity).padding(.vertical, 10)
                                    .foregroundStyle(Theme.muted)
                            }
                        }
                        .card(radius: 16)
                        Spacer(minLength: 30)
                    }
                    .padding(16)
                }
            }
            .navigationTitle("Update").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } } }
        }
    }
}
