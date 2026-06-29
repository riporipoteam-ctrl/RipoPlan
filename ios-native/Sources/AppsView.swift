import SwiftUI
import WebKit

struct MiniApp: Codable, Identifiable {
    let id: String
    var name: String
    var description: String?
    var html: String?
    var created_at: String?
}

/// Mini Apps — websites/apps the agents have built and published.
struct AppsView: View {
    @EnvironmentObject var app: AppState
    @Environment(\.dismiss) private var dismiss
    @State private var apps: [MiniApp] = []
    @State private var loading = true
    @State private var preview: MiniApp?

    var body: some View {
        NavigationStack { content }
    }

    private var content: some View {
        ZStack {
            Theme.ink.ignoresSafeArea()
            if loading {
                ProgressView().tint(Theme.muted)
            } else if apps.isEmpty {
                VStack(spacing: 10) {
                    Image(systemName: "square.grid.2x2").font(.largeTitle).foregroundStyle(Theme.muted)
                    Text("No apps yet").foregroundStyle(Theme.text).font(.headline)
                    Text("Ask your agents to build a website or web app — it shows up here.")
                        .font(.subheadline).foregroundStyle(Theme.muted)
                        .multilineTextAlignment(.center).padding(.horizontal, 40)
                }
            } else {
                ScrollView {
                    LazyVStack(spacing: 10) {
                        ForEach(apps) { a in
                            Button { Haptic.light(); preview = a } label: {
                                HStack(spacing: 12) {
                                    RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Theme.ink3)
                                        .frame(width: 44, height: 44)
                                        .overlay(Image(systemName: "globe").foregroundStyle(Theme.muted))
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(a.name).foregroundStyle(Theme.text).fontWeight(.semibold).lineLimit(1)
                                        Text(a.description ?? "Web app").font(.subheadline).foregroundStyle(Theme.muted).lineLimit(1)
                                    }
                                    Spacer()
                                    Image(systemName: "chevron.right").foregroundStyle(Theme.muted).font(.caption)
                                }
                                .card(radius: 16, padding: 12)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(16)
                }
            }
        }
        .navigationTitle("Apps")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } } }
        .sheet(item: $preview) { a in
            NavigationStack {
                HTMLView(html: a.html ?? "<h3 style='font-family:sans-serif'>Nothing to preview</h3>")
                    .ignoresSafeArea(edges: .bottom)
                    .navigationTitle(a.name).navigationBarTitleDisplayMode(.inline)
            }
        }
        .task {
            if let ws = app.workspace?.id,
               let rows: [MiniApp] = try? await Supa.shared.select("mini_apps?workspace_id=eq.\(ws)&select=id,name,description,html,created_at&order=created_at.desc&limit=50") {
                apps = rows
            }
            loading = false
        }
    }
}

/// Minimal WKWebView to preview a published mini-app's HTML.
struct HTMLView: UIViewRepresentable {
    let html: String
    func makeUIView(context: Context) -> WKWebView { WKWebView() }
    func updateUIView(_ web: WKWebView, context: Context) {
        web.loadHTMLString(html, baseURL: nil)
    }
}
