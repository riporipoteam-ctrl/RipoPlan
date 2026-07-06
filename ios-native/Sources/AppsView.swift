import SwiftUI
import UIKit
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
            AppPreviewSheet(miniApp: a).environmentObject(app)
        }
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        if let ws = app.workspace?.id,
           let rows: [MiniApp] = try? await Supa.shared.select("mini_apps?workspace_id=eq.\(ws)&select=id,name,description,html,created_at&order=created_at.desc&limit=50") {
            apps = rows
        }
        loading = false
    }
}

/// Full app preview: live render + view/copy the code + ask an agent to improve it.
struct AppPreviewSheet: View {
    @EnvironmentObject var app: AppState
    @Environment(\.dismiss) private var dismiss
    let miniApp: MiniApp
    @State private var showCode = false
    @State private var copied = false
    @State private var askEdit = false
    @State private var editRequest = ""
    @State private var editSent = false
    @State private var showConsole = false
    @State private var logs: [String] = []

    var body: some View {
        NavigationStack {
            HTMLView(html: miniApp.html ?? "<h3 style='font-family:sans-serif'>Nothing to preview</h3>",
                     onLog: { line in
                         logs.append(line)
                         if logs.count > 200 { logs.removeFirst(logs.count - 200) }
                     })
                .ignoresSafeArea(edges: .bottom)
                .navigationTitle(miniApp.name).navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } }
                    ToolbarItem(placement: .navigationBarTrailing) {
                        HStack(spacing: 14) {
                            Button { Haptic.light(); showConsole.toggle() } label: {
                                Image(systemName: "terminal")
                                    .foregroundStyle(showConsole ? Theme.text : Theme.muted)
                            }
                            Button { Haptic.light(); showCode = true } label: {
                                Image(systemName: "chevron.left.forwardslash.chevron.right").foregroundStyle(Theme.text)
                            }
                            Button { Haptic.light(); askEdit = true } label: {
                                Image(systemName: "wand.and.stars").foregroundStyle(Theme.text)
                            }
                        }
                    }
                }
                .safeAreaInset(edge: .bottom) {
                    if showConsole { consolePanel }
                }
                .alert("Improve with AI", isPresented: $askEdit) {
                    TextField("What should the agent change?", text: $editRequest)
                    Button("Cancel", role: .cancel) {}
                    Button("Send") {
                        let req = editRequest.trimmingCharacters(in: .whitespaces)
                        guard !req.isEmpty else { return }
                        Task {
                            _ = await app.send("Use the edit_app tool to update the mini app named \"\(miniApp.name)\": \(req). Load its current code first with list_apps if needed, keep what works, and apply the changes with modern design.")
                            editSent = true; Haptic.success()
                        }
                        editRequest = ""
                    }
                } message: { Text("An agent will edit \"\(miniApp.name)\" and republish it.") }
                .overlay(alignment: .bottom) {
                    if editSent {
                        Text("✅ Sent to your agents — check the chat")
                            .font(.caption.weight(.semibold)).foregroundStyle(Theme.text)
                            .padding(.horizontal, 14).padding(.vertical, 9)
                            .background(.ultraThinMaterial, in: Capsule())
                            .padding(.bottom, 24)
                            .transition(.move(edge: .bottom).combined(with: .opacity))
                            .task { try? await Task.sleep(nanoseconds: 2_500_000_000); withAnimation { editSent = false } }
                    }
                }
                .sheet(isPresented: $showCode) {
                    NavigationStack {
                        ScrollView {
                            Text(miniApp.html ?? "")
                                .font(.system(.caption, design: .monospaced))
                                .foregroundStyle(Theme.text)
                                .textSelection(.enabled)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(14)
                        }
                        .background(Theme.ink)
                        .navigationTitle("Code — \(miniApp.name)").navigationBarTitleDisplayMode(.inline)
                        .toolbar {
                            ToolbarItem(placement: .cancellationAction) { Button("Done") { showCode = false } }
                            ToolbarItem(placement: .navigationBarTrailing) {
                                Button {
                                    UIPasteboard.general.string = miniApp.html ?? ""
                                    copied = true; Haptic.success()
                                } label: {
                                    Label(copied ? "Copied" : "Copy", systemImage: copied ? "checkmark" : "doc.on.doc")
                                        .font(.subheadline.weight(.semibold)).foregroundStyle(Theme.text)
                                }
                            }
                        }
                    }
                }
        }
    }

    /// Terminal-style command panel: live console output from the running app,
    /// so you can watch its virtual backend work right inside the preview.
    private var consolePanel: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("CONSOLE")
                .font(.system(size: 10, weight: .bold, design: .monospaced))
                .foregroundStyle(Color(red: 0.54, green: 0.89, blue: 0.2))
            ScrollView {
                VStack(alignment: .leading, spacing: 2) {
                    if logs.isEmpty {
                        Text("— no output yet —")
                            .font(.system(size: 11, design: .monospaced))
                            .foregroundStyle(Color(white: 0.5))
                    }
                    ForEach(Array(logs.enumerated()), id: \.offset) { _, line in
                        Text(line)
                            .font(.system(size: 11, design: .monospaced))
                            .foregroundStyle(Color(white: 0.85))
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
            }
            .frame(maxHeight: 170)
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(red: 0.066, green: 0.07, blue: 0.08))
    }
}

/// WKWebView preview that pipes console.log/warn/error out to a live panel.
struct HTMLView: UIViewRepresentable {
    let html: String
    var onLog: (String) -> Void = { _ in }

    final class Coord: NSObject, WKScriptMessageHandler {
        let onLog: (String) -> Void
        var lastHTML: String = ""
        init(onLog: @escaping (String) -> Void) { self.onLog = onLog }
        func userContentController(_ ucc: WKUserContentController, didReceive message: WKScriptMessage) {
            if let s = message.body as? String { onLog(s) }
        }
    }
    func makeCoordinator() -> Coord { Coord(onLog: onLog) }

    func makeUIView(context: Context) -> WKWebView {
        let cfg = WKWebViewConfiguration()
        let js = """
        (function(){
          function send(tag,args){try{window.webkit.messageHandlers.console.postMessage(tag+' '+Array.from(args).map(function(a){try{return typeof a==='object'?JSON.stringify(a):String(a)}catch(e){return String(a)}}).join(' '))}catch(e){}}
          var L=console.log,W=console.warn,E=console.error;
          console.log=function(){send('\\u203a',arguments);L.apply(console,arguments)};
          console.warn=function(){send('\\u26a0',arguments);W.apply(console,arguments)};
          console.error=function(){send('\\u2716',arguments);E.apply(console,arguments)};
          window.addEventListener('error',function(e){send('\\u2716',[e.message])});
        })();
        """
        let script = WKUserScript(source: js, injectionTime: .atDocumentStart, forMainFrameOnly: false)
        cfg.userContentController.addUserScript(script)
        cfg.userContentController.add(context.coordinator, name: "console")
        return WKWebView(frame: .zero, configuration: cfg)
    }
    func updateUIView(_ web: WKWebView, context: Context) {
        // Only reload when the HTML actually changed (state toggles like the
        // console panel must not restart the running app).
        guard context.coordinator.lastHTML != html else { return }
        context.coordinator.lastHTML = html
        web.loadHTMLString(html, baseURL: nil)
    }
}
