import SwiftUI
import WebKit

// MARK: - Video detection (YouTube, Twitch, TikTok, Vimeo, generic mp4)

struct VideoEmbed: Identifiable, Hashable {
    let id: String          // original URL
    let embedURL: String    // player URL used inside the app
    let thumb: String?      // poster image
    let platform: String    // "YouTube" / "Twitch" / …

    /// Parse a URL into an embeddable video (nil if it isn't a known video link).
    static func from(_ url: String) -> VideoEmbed? {
        let u = url.trimmingCharacters(in: .whitespaces)
        let lc = u.lowercased()

        // YouTube
        if lc.contains("youtube.com/watch") || lc.contains("youtu.be/") || lc.contains("youtube.com/shorts/") {
            var vid = ""
            if let r = u.range(of: "v=") { vid = String(u[r.upperBound...]).components(separatedBy: CharacterSet(charactersIn: "&#?")).first ?? "" }
            else if let r = u.range(of: "youtu.be/") { vid = String(u[r.upperBound...]).components(separatedBy: CharacterSet(charactersIn: "&#?/")).first ?? "" }
            else if let r = u.range(of: "shorts/") { vid = String(u[r.upperBound...]).components(separatedBy: CharacterSet(charactersIn: "&#?/")).first ?? "" }
            guard !vid.isEmpty else { return nil }
            return VideoEmbed(id: u,
                              embedURL: "https://www.youtube.com/embed/\(vid)?playsinline=1&autoplay=1",
                              thumb: "https://img.youtube.com/vi/\(vid)/hqdefault.jpg",
                              platform: "YouTube")
        }
        // Twitch (videos + channels + clips)
        if lc.contains("twitch.tv/") {
            let host = "askai.local"   // parent required by Twitch embeds
            if let r = u.range(of: "twitch.tv/videos/") {
                let vid = String(u[r.upperBound...]).components(separatedBy: CharacterSet(charactersIn: "&#?/")).first ?? ""
                return VideoEmbed(id: u, embedURL: "https://player.twitch.tv/?video=\(vid)&parent=\(host)&autoplay=true", thumb: nil, platform: "Twitch")
            }
            let chan = u.components(separatedBy: "twitch.tv/").last?.components(separatedBy: CharacterSet(charactersIn: "&#?/")).first ?? ""
            if !chan.isEmpty {
                return VideoEmbed(id: u, embedURL: "https://player.twitch.tv/?channel=\(chan)&parent=\(host)&autoplay=true", thumb: nil, platform: "Twitch")
            }
        }
        // TikTok — embed the page directly (TikTok serves its own player).
        if lc.contains("tiktok.com/") && (lc.contains("/video/") || lc.contains("/@")) {
            return VideoEmbed(id: u, embedURL: u, thumb: nil, platform: "TikTok")
        }
        // Vimeo
        if lc.contains("vimeo.com/"), let vid = u.components(separatedBy: "vimeo.com/").last?.components(separatedBy: CharacterSet(charactersIn: "&#?/")).first, !vid.isEmpty {
            return VideoEmbed(id: u, embedURL: "https://player.vimeo.com/video/\(vid)?autoplay=1", thumb: nil, platform: "Vimeo")
        }
        // Direct video file
        if lc.hasSuffix(".mp4") || lc.hasSuffix(".mov") || lc.hasSuffix(".m3u8") {
            return VideoEmbed(id: u, embedURL: u, thumb: nil, platform: "Video")
        }
        return nil
    }
}

// MARK: - Inline video card (tap → fullscreen in-app player)

struct VideoCard: View {
    let video: VideoEmbed
    @State private var play = false

    var body: some View {
        Button { Haptic.medium(); play = true } label: {
            ZStack {
                if let t = video.thumb, let u = URL(string: t) {
                    AsyncImage(url: u) { i in i.resizable().scaledToFill() } placeholder: {
                        Rectangle().fill(Theme.ink3)
                    }
                } else {
                    LinearGradient(colors: [Theme.ink2, Theme.ink3], startPoint: .topLeading, endPoint: .bottomTrailing)
                }
                Rectangle().fill(.black.opacity(0.18))
                // Play button
                Circle().fill(.black.opacity(0.55))
                    .frame(width: 58, height: 58)
                    .overlay(Image(systemName: "play.fill").font(.system(size: 22)).foregroundStyle(.white).offset(x: 2))
                // Platform chip
                VStack {
                    HStack {
                        HStack(spacing: 4) {
                            Image(systemName: platformIcon).font(.caption2.weight(.bold))
                            Text(video.platform).font(.caption2.weight(.bold))
                        }
                        .foregroundStyle(.white)
                        .padding(.horizontal, 8).padding(.vertical, 4)
                        .background(.black.opacity(0.55), in: Capsule())
                        Spacer()
                    }
                    Spacer()
                }
                .padding(8)
            }
            .frame(maxWidth: 320)
            .frame(height: 190)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Theme.stroke, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .fullScreenCover(isPresented: $play) {
            VideoPlayerSheet(video: video)
        }
    }

    private var platformIcon: String {
        switch video.platform {
        case "YouTube": return "play.rectangle.fill"
        case "Twitch": return "gamecontroller.fill"
        case "TikTok": return "music.note"
        default: return "play.circle.fill"
        }
    }
}

/// Inline card for an UPLOADED video (Supabase mp4): poster frame + play button,
/// tap to play fullscreen in the app.
struct ChatVideoCard: View {
    let url: String
    var poster: String?
    @State private var play = false
    var body: some View {
        Button { Haptic.medium(); play = true } label: {
            ZStack {
                if let p = poster, let u = URL(string: p) {
                    AsyncImage(url: u) { i in i.resizable().scaledToFill() } placeholder: { Theme.ink3 }
                } else {
                    LinearGradient(colors: [Theme.ink2, Theme.ink3], startPoint: .topLeading, endPoint: .bottomTrailing)
                }
                Rectangle().fill(.black.opacity(0.18))
                Circle().fill(.black.opacity(0.55)).frame(width: 56, height: 56)
                    .overlay(Image(systemName: "play.fill").font(.system(size: 21)).foregroundStyle(.white).offset(x: 2))
                VStack { HStack {
                    HStack(spacing: 4) { Image(systemName: "video.fill").font(.caption2.weight(.bold)); Text("Video").font(.caption2.weight(.bold)) }
                        .foregroundStyle(.white).padding(.horizontal, 8).padding(.vertical, 4)
                        .background(.black.opacity(0.55), in: Capsule())
                    Spacer() }; Spacer() }.padding(8)
            }
            .frame(maxWidth: 300).frame(height: 200)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Theme.stroke, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .fullScreenCover(isPresented: $play) {
            VideoPlayerSheet(video: VideoEmbed(id: url, embedURL: url, thumb: poster, platform: "Video"))
        }
    }
}

/// Fullscreen in-app video player.
struct VideoPlayerSheet: View {
    let video: VideoEmbed
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        ZStack(alignment: .topLeading) {
            Color.black.ignoresSafeArea()
            WebView(url: video.embedURL, allowsMedia: true)
                .ignoresSafeArea(edges: .bottom)
            Button { dismiss() } label: {
                Image(systemName: "xmark").font(.system(size: 15, weight: .bold)).foregroundStyle(.white)
                    .frame(width: 38, height: 38).background(.white.opacity(0.16), in: Circle())
            }
            .padding(.horizontal, 16).padding(.top, 8)
        }
    }
}

// MARK: - In-app browser (open links without leaving the app)

struct InAppBrowser: View {
    let url: String
    @Environment(\.dismiss) private var dismiss
    @State private var progress: Double = 0
    @State private var title = ""

    var body: some View {
        NavigationStack {
            ZStack(alignment: .top) {
                Theme.ink.ignoresSafeArea()
                WebView(url: url, allowsMedia: true, progress: $progress, title: $title)
                if progress < 1 {
                    ProgressView(value: progress)
                        .tint(Theme.accent)
                }
            }
            .navigationTitle(title.isEmpty ? (URL(string: url)?.host ?? "Web") : title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: { Image(systemName: "xmark") }
                }
                ToolbarItem(placement: .primaryAction) {
                    if let u = URL(string: url) {
                        ShareLink(item: u) { Image(systemName: "square.and.arrow.up") }
                    }
                }
                ToolbarItem(placement: .bottomBar) {
                    if let u = URL(string: url) {
                        Link(destination: u) { Label("Open in Safari", systemImage: "safari") }
                    }
                }
            }
        }
    }
}

// MARK: - WKWebView wrapper

struct WebView: UIViewRepresentable {
    let url: String
    var allowsMedia: Bool = true
    var progress: Binding<Double>? = nil
    var title: Binding<String>? = nil

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeUIView(context: Context) -> WKWebView {
        let cfg = WKWebViewConfiguration()
        cfg.allowsInlineMediaPlayback = true
        cfg.mediaTypesRequiringUserActionForPlayback = allowsMedia ? [] : .all
        let web = WKWebView(frame: .zero, configuration: cfg)
        web.navigationDelegate = context.coordinator
        web.allowsBackForwardNavigationGestures = true
        web.scrollView.contentInsetAdjustmentBehavior = .never
        if progress != nil {
            context.coordinator.observe(web)
        }
        if let u = URL(string: url) { web.load(URLRequest(url: u)) }
        return web
    }

    func updateUIView(_ web: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKNavigationDelegate {
        let parent: WebView
        private var obs: NSKeyValueObservation?
        init(_ p: WebView) { parent = p }
        func observe(_ web: WKWebView) {
            obs = web.observe(\.estimatedProgress, options: .new) { [weak self] w, _ in
                self?.parent.progress?.wrappedValue = w.estimatedProgress
            }
        }
        func webView(_ web: WKWebView, didFinish nav: WKNavigation!) {
            parent.progress?.wrappedValue = 1
            if let t = web.title, !t.isEmpty { parent.title?.wrappedValue = t }
        }
    }
}
