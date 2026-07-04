import SwiftUI
import UIKit
import PhotosUI
import UniformTypeIdentifiers
import AVFoundation

struct Suggestion: Identifiable {
    let id = UUID()
    let icon: String
    let label: String
    let seed: String
    var color: String = "#6e6e80"
}

/// Tracks the chat's bottom marker position to toggle the scroll-to-bottom button.
struct BottomOffsetKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = nextValue() }
}

/// Dismiss the keyboard from anywhere (tap-to-read in chat).
func hideKeyboard() {
    UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
}

let SUGGESTIONS: [Suggestion] = [
    .init(icon: "soccerball", label: "World Cup live", seed: "Give me a live World Cup update — recent results, today's fixtures, and the standings.", color: "#10b981"),
    .init(icon: "photo.fill", label: "Create an image", seed: "Create an image of ", color: "#8b5cf6"),
    .init(icon: "globe", label: "Build a website", seed: "Build me a website for ", color: "#3b82f6"),
    .init(icon: "magnifyingglass", label: "Research a topic", seed: "Research and summarize the latest on ", color: "#f59e0b"),
    .init(icon: "pencil.and.outline", label: "Write or edit", seed: "Help me write ", color: "#ec4899"),
    .init(icon: "newspaper.fill", label: "Today's news", seed: "Give me a detailed briefing of today's top news.", color: "#14b8a6"),
]

/// The main surface — a new chat when `threadId` is nil, otherwise a live thread.
/// Mirrors ChatGPT: empty space + suggestions above a bottom composer.
struct ConversationView: View {
    @EnvironmentObject var app: AppState
    @Binding var threadId: String?
    var topInset: CGFloat = 0

    @State private var messages: [Message] = []
    @State private var text = ""
    @State private var attachments: [Attachment] = []
    @State private var sending = false
    @State private var uploading = false
    @State private var loaded = false

    @State private var photoItems: [PhotosPickerItem] = []
    @State private var showPhoto = false
    @State private var showFiles = false
    @State private var heroIn = false
    @State private var showScrollDown = false
    @State private var showVoice = false
    @State private var browserURL: String?
    @State private var videoURL: String?
    @State private var wcIntro = false
    @Environment(\.scenePhase) private var scene

    private var mentionsWorldCup: Bool {
        messages.contains { ($0.content ?? "").range(of: "world cup", options: .caseInsensitive) != nil }
    }
    private var wcSeenKey: String { "askai.wc.seen.\(threadId ?? "none")" }

    var body: some View {
        ZStack(alignment: .bottom) {
            // World Cup 2026 themed backdrop once the chat mentions it.
            if mentionsWorldCup || wcIntro {
                WorldCupBackground(intro: $wcIntro).transition(.opacity)
            }
            Group {
                if threadId == nil { newChat } else { thread }
            }
            // Floating glass composer — content scrolls underneath it (real glass).
            VStack(spacing: 0) {
                LinearGradient(colors: [Theme.ink.opacity(0), Theme.ink.opacity(0.9), Theme.ink],
                               startPoint: .top, endPoint: .bottom)
                    .frame(height: 24).allowsHitTesting(false)
                InputBar(text: $text, attachments: $attachments,
                         sending: sending, uploading: uploading,
                         onSend: send, onPickPhoto: { showPhoto = true }, onPickFile: { showFiles = true },
                         onVoice: { showVoice = true })
                    .padding(.horizontal, 12)
                    .padding(.bottom, 8)
                    .background(Theme.ink.opacity(0.001))
            }
        }
        .background(Theme.ink.ignoresSafeArea())
        // Tapping a link in any reply opens it INSIDE the app (video links get the
        // in-app player; everything else the in-app browser).
        .environment(\.openURL, OpenURLAction { url in
            if VideoEmbed.from(url.absoluteString) != nil { videoURL = url.absoluteString }
            else { browserURL = url.absoluteString }
            return .handled
        })
        .fullScreenCover(isPresented: $showVoice) {
            VoiceCallView().environmentObject(app)
        }
        .sheet(isPresented: Binding(get: { browserURL != nil }, set: { if !$0 { browserURL = nil } })) {
            if let u = browserURL { InAppBrowser(url: u) }
        }
        .fullScreenCover(isPresented: Binding(get: { videoURL != nil }, set: { if !$0 { videoURL = nil } })) {
            if let u = videoURL, let v = VideoEmbed.from(u) { VideoPlayerSheet(video: v) }
        }
        .photosPicker(isPresented: $showPhoto, selection: $photoItems, maxSelectionCount: 6,
                      matching: .any(of: [.images, .videos]))
        .onChange(of: photoItems) { items in Task { await loadPicked(items) } }
        .fileImporter(isPresented: $showFiles, allowedContentTypes: [.item], allowsMultipleSelection: false) { result in
            Task { await loadFile(result) }
        }
        .task(id: threadId) { await poll() }
        .onChange(of: mentionsWorldCup) { mentions in
            // First time the World Cup comes up in this chat → play the intro once.
            guard mentions, !UserDefaults.standard.bool(forKey: wcSeenKey) else { return }
            UserDefaults.standard.set(true, forKey: wcSeenKey)
            withAnimation(.easeOut(duration: 0.4)) { wcIntro = true }
            Haptic.success()
            Task {
                try? await Task.sleep(nanoseconds: 5_500_000_000)
                withAnimation(.easeInOut(duration: 1.0)) { wcIntro = false }   // settle to ambient
            }
        }
        .onChange(of: scene) { p in
            // Coming back from background → refresh immediately, don't wait for
            // the next poll tick.
            guard p == .active, let tid = threadId else { return }
            Task { let m = await app.messages(thread: tid); if m != messages { messages = m } }
        }
    }

    // MARK: New chat (empty state) — ChatGPT layout: calm blank space with
    // plain suggestion rows sitting just above the composer.
    private var newChat: some View {
        VStack(alignment: .leading, spacing: 0) {
            Spacer()
            VStack(alignment: .leading, spacing: 4) {
                ForEach(Array(SUGGESTIONS.prefix(4).enumerated()), id: \.element.id) { i, s in
                    Button { Haptic.light(); text = s.seed } label: {
                        HStack(spacing: 16) {
                            Image(systemName: s.icon)
                                .font(.system(size: 18, weight: .regular))
                                .foregroundStyle(Theme.muted)
                                .frame(width: 26)
                            Text(s.label)
                                .font(.system(size: 20, weight: .medium))
                                .foregroundStyle(Theme.text)
                                .lineLimit(1)
                            Spacer(minLength: 0)
                        }
                        .padding(.horizontal, 22).padding(.vertical, 13)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .pressable()
                    .opacity(heroIn ? 1 : 0)
                    .offset(y: heroIn ? 0 : 16)
                    .animation(.spring(response: 0.5, dampingFraction: 0.85).delay(0.06 * Double(i)), value: heroIn)
                }
            }
            .padding(.bottom, 108)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .onAppear { withAnimation(.spring(response: 0.5, dampingFraction: 0.8)) { heroIn = true } }
    }

    // MARK: Existing thread
    private var thread: some View {
        ScrollViewReader { proxy in
            GeometryReader { geo in
                ScrollView {
                    LazyVStack(spacing: 16) {
                        if !loaded && messages.isEmpty {
                            SkeletonBubble(alignRight: true)
                            SkeletonBubble()
                            SkeletonBubble(alignRight: true)
                            SkeletonBubble(tall: true)
                        }
                        ForEach(Array(messages.enumerated()), id: \.element.id) { idx, m in
                            if let label = dayDivider(at: idx) { DayDivider(label: label) }
                            MessageBubble(message: m, onResend: { body in
                                Task { _ = await app.send(body, threadId: threadId) }
                            }, onGrow: {
                                // Follow the typing only while the user is at the bottom.
                                if !showScrollDown { proxy.scrollTo("end", anchor: .bottom) }
                            }).id(m.id)
                        }
                        Color.clear.frame(height: 1).id("end")
                            .background(GeometryReader { g in
                                Color.clear.preference(key: BottomOffsetKey.self,
                                                       value: g.frame(in: .named("scroll")).maxY)
                            })
                    }
                    .padding(16)
                    .padding(.top, topInset)
                    .padding(.bottom, 84)
                }
                .coordinateSpace(name: "scroll")
                .scrollDismissesKeyboard(.interactively)
                .onTapGesture { hideKeyboard() }
                .onPreferenceChange(BottomOffsetKey.self) { y in
                    // Bottom marker below the visible area → user scrolled up.
                    showScrollDown = y > geo.size.height + 120
                }
            }
            .onChange(of: messages.count) { _ in withAnimation(.easeOut(duration: 0.2)) { proxy.scrollTo("end", anchor: .bottom) } }
            .onChange(of: lastStamp) { _ in
                // Content updates only pull the view down if you're already there —
                // never yank you while you're reading older messages.
                guard !showScrollDown else { return }
                withAnimation(.easeOut(duration: 0.2)) { proxy.scrollTo("end", anchor: .bottom) }
            }
            .overlay(alignment: .bottom) {
                if showScrollDown {
                    Button { withAnimation { proxy.scrollTo("end", anchor: .bottom) } } label: {
                        Image(systemName: "arrow.down").font(.system(size: 16, weight: .semibold)).foregroundStyle(Theme.text)
                            .frame(width: 38, height: 38)
                            .glassCircle()
                            .shadow(color: .black.opacity(0.15), radius: 6, y: 3)
                    }
                    .buttonStyle(.plain)
                    .padding(.bottom, 92)
                    .transition(.scale.combined(with: .opacity))
                }
            }
        }
    }

    private var lastStamp: String { (messages.last?.status ?? "") + String(messages.last?.content?.count ?? 0) }

    private var greeting: String {
        let h = Calendar.current.component(.hour, from: Date())
        let base = h < 5 ? "Up late" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"
        return app.firstName.isEmpty ? "\(base)!" : "\(base), \(app.firstName)!"
    }

    /// Returns a date label ("Today"/"Yesterday"/"Mar 5") when the message at
    /// `idx` starts a new day vs the previous message.
    private func dayDivider(at idx: Int) -> String? {
        guard idx < messages.count, let d = RelTime.parse(messages[idx].created_at) else { return nil }
        let cal = Calendar.current
        if idx > 0, let prev = RelTime.parse(messages[idx - 1].created_at), cal.isDate(prev, inSameDayAs: d) { return nil }
        if cal.isDateInToday(d) { return "Today" }
        if cal.isDateInYesterday(d) { return "Yesterday" }
        let f = DateFormatter(); f.dateFormat = "MMM d"; return f.string(from: d)
    }

    private func poll() async {
        guard let tid = threadId else { messages = []; loaded = false; return }
        loaded = false
        // Instant paint from cache; the network copy replaces it right after.
        if let cached = app.msgCache[tid], !cached.isEmpty {
            messages = cached; loaded = true
        }
        var cycle = 0
        while !Task.isCancelled {
            let m = await app.messages(thread: tid)
            // Only touch state when something actually changed — otherwise every
            // poll re-rendered the whole chat (flashing images, broken typing).
            if m != messages { messages = m }
            loaded = true
            app.markRead(tid)                       // viewing = read (clears blue dot)
            if cycle % 6 == 0 { await app.loadThreads() }  // keep unread dots fresh
            cycle += 1
            try? await Task.sleep(nanoseconds: 2_500_000_000)
        }
    }

    private func send() {
        let body = text; let atts = attachments
        sending = true; text = ""; attachments = []
        Task {
            if let tid = threadId {
                _ = await app.send(body, threadId: tid, attachments: atts)
                messages = await app.messages(thread: tid)
            } else {
                if let newId = await app.send(body, attachments: atts) {
                    threadId = newId   // switches the view into the live thread
                }
            }
            sending = false
        }
    }

    // MARK: Uploads
    /// Handle a batch of picked photos AND videos. Photos are downscaled and
    /// uploaded in PARALLEL (fast); videos are uploaded and get a poster frame so
    /// the agent can "see" them.
    private func loadPicked(_ items: [PhotosPickerItem]) async {
        guard !items.isEmpty else { return }
        uploading = true
        await withTaskGroup(of: Attachment?.self) { group in
            for item in items {
                group.addTask { await loadOne(item) }
            }
            for await att in group {
                if let att { await MainActor.run { attachments.append(att); Haptic.success() } }
            }
        }
        uploading = false; photoItems = []
    }

    private func loadOne(_ item: PhotosPickerItem) async -> Attachment? {
        let isVideo = item.supportedContentTypes.contains { $0.conforms(to: .movie) }
        guard let data = try? await item.loadTransferable(type: Data.self) else { return nil }
        if isVideo {
            guard let vid = await app.upload(data: data, ext: "mp4", contentType: "video/mp4", name: "Video.mp4") else { return nil }
            // Poster frame so chat shows a thumbnail and the agent can view it.
            var att = vid
            att.type = "video"
            if let frame = await firstFrame(data), let shot = await app.upload(data: frame, ext: "jpg", contentType: "image/jpeg", name: "frame.jpg") {
                att.preview = shot.url
            }
            return att
        } else {
            let compact = compressForUpload(data)
            return await app.upload(data: compact, ext: "jpg", contentType: "image/jpeg", name: "Photo.jpg")
        }
    }

    /// Grab a representative frame from a video (for the poster + agent vision).
    private func firstFrame(_ data: Data) async -> Data? {
        let tmp = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".mp4")
        guard (try? data.write(to: tmp)) != nil else { return nil }
        defer { try? FileManager.default.removeItem(at: tmp) }
        let asset = AVURLAsset(url: tmp)
        let gen = AVAssetImageGenerator(asset: asset); gen.appliesPreferredTrackTransform = true
        gen.maximumSize = CGSize(width: 768, height: 768)
        let time = CMTime(seconds: 1, preferredTimescale: 600)
        guard let cg = try? gen.copyCGImage(at: time, actualTime: nil) else { return nil }
        return UIImage(cgImage: cg).jpegData(compressionQuality: 0.6)
    }

    private func compressForUpload(_ data: Data, maxSide: CGFloat = 1280) -> Data {
        guard let img = UIImage(data: data) else { return data }
        let scale = min(1, maxSide / max(img.size.width, img.size.height))
        let target = CGSize(width: img.size.width * scale, height: img.size.height * scale)
        let fmt = UIGraphicsImageRendererFormat.default()
        fmt.scale = 1
        let resized = UIGraphicsImageRenderer(size: target, format: fmt).image { _ in
            img.draw(in: CGRect(origin: .zero, size: target))
        }
        // Smaller target + q0.6 → much faster upload and display.
        return resized.jpegData(compressionQuality: 0.6) ?? data
    }

    private func loadFile(_ result: Result<[URL], Error>) async {
        guard case .success(let urls) = result, let url = urls.first else { return }
        uploading = true
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        if let data = try? Data(contentsOf: url) {
            let ext = url.pathExtension.isEmpty ? "bin" : url.pathExtension
            let mime = UTType(filenameExtension: ext)?.preferredMIMEType ?? "application/octet-stream"
            if let att = await app.upload(data: data, ext: ext, contentType: mime, name: url.lastPathComponent) {
                attachments.append(att); Haptic.success()
            }
        }
        uploading = false
    }
}

struct MessageBubble: View {
    @EnvironmentObject var app: AppState
    let message: Message
    var onResend: ((String) -> Void)? = nil
    var onGrow: () -> Void = {}
    @State private var showTrail = false
    @State private var appeared = false
    @State private var viewerURL: String?
    @State private var liked = false
    @State private var disliked = false

    var isUser: Bool { message.sender_type == "user" }
    var thinking: Bool { message.status == "thinking" }

    private var reactKey: String { "askai.react.\(message.id)" }
    private func loadReaction() {
        let r = UserDefaults.standard.string(forKey: reactKey)
        liked = r == "up"; disliked = r == "down"
    }
    private func saveReaction() {
        if liked { UserDefaults.standard.set("up", forKey: reactKey) }
        else if disliked { UserDefaults.standard.set("down", forKey: reactKey) }
        else { UserDefaults.standard.removeObject(forKey: reactKey) }
    }

    /// Type out only fresh replies, once, and never giant ones.
    private var shouldType: Bool {
        guard !isUser, message.status == "complete",
              let body = message.content, !body.isEmpty, body.count < 6000,
              !app.animatedIds.contains(message.id),
              let d = RelTime.parse(message.created_at),
              Date().timeIntervalSince(d) < 180 else { return false }
        return true
    }
    private var doneActivities: [Activity] {
        guard !isUser, message.status == "complete" else { return [] }
        return (message.activities ?? []).filter { ($0.status ?? "") == "done" && ($0.label != nil) }
    }

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            if isUser { Spacer(minLength: 40) }
            if !isUser {
                AgentAvatar(name: app.agent(message.agent_id)?.name ?? "AskAI",
                       color: app.agent(message.agent_id)?.avatar_color,
                       size: 30, online: false, spark: message.agent_id == nil,
                       imageURL: app.agent(message.agent_id)?.avatar_url)
            }
            VStack(alignment: isUser ? .trailing : .leading, spacing: 6) {
                if !isUser, let name = app.agent(message.agent_id)?.name {
                    Text(name).font(.caption.weight(.semibold)).foregroundStyle(Theme.muted)
                }
                if let atts = message.attachments, !atts.isEmpty {
                    ForEach(atts) { a in
                        if a.type == "image" {
                            Button { Haptic.light(); viewerURL = a.url } label: {
                                // Fixed frame — the layout can't jump (and yank the
                                // scroll position) when the image finishes loading.
                                AsyncImage(url: URL(string: a.url)) { i in
                                    i.resizable().scaledToFill()
                                } placeholder: {
                                    ZStack {
                                        Theme.ink3
                                        ProgressView().tint(Theme.muted)
                                    }
                                }
                                .frame(maxWidth: 300)
                                .frame(height: 220)
                                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                                .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(Theme.stroke, lineWidth: 1))
                            }
                            .buttonStyle(.plain)
                        } else if a.type == "video" {
                            ChatVideoCard(url: a.url, poster: a.preview)
                        } else if a.type != "link" {
                            HStack(spacing: 6) { Image(systemName: "doc.fill"); Text(a.name).lineLimit(1) }
                                .font(.footnote).foregroundStyle(Theme.muted)
                        }
                    }
                    // All browsed pages collapse into ONE drop-down browser card.
                    let links = atts.filter { $0.type == "link" }
                    if !links.isEmpty {
                        BrowserSessionCard(pages: links, live: thinking)
                    }
                }
                if thinking && (message.content ?? "").isEmpty {
                    activityOrDots
                } else if !(message.content ?? "").isEmpty {
                    if isUser {
                        // ChatGPT look — soft grey capsule, regular text.
                        MD(text: message.content ?? "")
                            .font(.body).foregroundStyle(Theme.text)
                            .textSelection(.enabled)
                            .padding(.horizontal, 16).padding(.vertical, 11)
                            .background(Theme.ink2, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
                    } else {
                        TypewriterText(text: message.content ?? "",
                                       animate: shouldType,
                                       onGrow: onGrow,
                                       onDone: { app.animatedIds.insert(message.id) })
                    }
                }
                if !doneActivities.isEmpty { activityTrail }
                if !isUser, message.status == "complete", !(message.content ?? "").isEmpty {
                    actionRow
                }
            }
            if !isUser { Spacer(minLength: 40) }
        }
        .opacity(appeared ? 1 : 0)
        .offset(y: appeared ? 0 : 10)
        .onAppear {
            loadReaction()
            withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) { appeared = true }
        }
        .contextMenu {
            if let body = message.content, !body.isEmpty {
                Button { UIPasteboard.general.string = body; Haptic.success() } label: {
                    Label("Copy", systemImage: "doc.on.doc")
                }
                ShareLink(item: body) { Label("Share", systemImage: "square.and.arrow.up") }
                if isUser, let onResend {
                    Button { Haptic.medium(); onResend(body) } label: {
                        Label("Send again", systemImage: "arrow.clockwise")
                    }
                }
                if !isUser, message.status == "complete", let tid = message.thread_id {
                    Button { Haptic.medium(); Task { await app.regenerate(threadId: tid) } } label: {
                        Label("Regenerate", systemImage: "arrow.triangle.2.circlepath")
                    }
                }
            }
        }
        .fullScreenCover(isPresented: Binding(get: { viewerURL != nil }, set: { if !$0 { viewerURL = nil } })) {
            if let u = viewerURL { ImageViewer(url: u) }
        }
    }

    // ChatGPT-style action row under every finished assistant reply.
    private var actionRow: some View {
        HStack(spacing: 22) {
            Button { UIPasteboard.general.string = message.content ?? ""; Haptic.success() } label: {
                Image(systemName: "doc.on.doc")
            }
            Button {
                Haptic.light()
                withAnimation(.spring(response: 0.3, dampingFraction: 0.6)) { liked.toggle(); if liked { disliked = false } }
                saveReaction()
            } label: {
                Image(systemName: liked ? "hand.thumbsup.fill" : "hand.thumbsup")
                    .scaleEffect(liked ? 1.15 : 1)
            }
            Button {
                Haptic.light()
                withAnimation(.spring(response: 0.3, dampingFraction: 0.6)) { disliked.toggle(); if disliked { liked = false } }
                saveReaction()
            } label: {
                Image(systemName: disliked ? "hand.thumbsdown.fill" : "hand.thumbsdown")
                    .scaleEffect(disliked ? 1.15 : 1)
            }
            ShareLink(item: message.content ?? "") {
                Image(systemName: "square.and.arrow.up")
            }
            if let tid = message.thread_id {
                Button { Haptic.medium(); Task { await app.regenerate(threadId: tid) } } label: {
                    Image(systemName: "arrow.triangle.2.circlepath")
                }
            }
        }
        .font(.system(size: 15))
        .foregroundStyle(Theme.muted)
        .buttonStyle(.plain)
        .padding(.top, 4)
    }

    // Nebula-style "N actions · view" trail under a completed agent message.
    @ViewBuilder private var activityTrail: some View {
        VStack(alignment: .leading, spacing: 6) {
            Button { withAnimation(.easeInOut(duration: 0.2)) { showTrail.toggle() } } label: {
                HStack(spacing: 6) {
                    Image(systemName: "bolt.fill").font(.caption2)
                    Text("\(doneActivities.count) action\(doneActivities.count == 1 ? "" : "s")").font(.caption.weight(.semibold))
                    Image(systemName: showTrail ? "chevron.up" : "chevron.down").font(.caption2)
                }
                .foregroundStyle(Theme.muted)
                .padding(.horizontal, 10).padding(.vertical, 5)
                .background(Theme.ink2, in: Capsule())
            }
            .buttonStyle(.plain)
            if showTrail {
                VStack(alignment: .leading, spacing: 4) {
                    ForEach(Array(doneActivities.enumerated()), id: \.offset) { _, a in
                        HStack(spacing: 7) {
                            Image(systemName: "checkmark.circle.fill").font(.caption2).foregroundStyle(Theme.good)
                            Text(a.label ?? "").font(.caption).foregroundStyle(Theme.muted)
                        }
                    }
                }
                .padding(.leading, 4)
                .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .padding(.top, 2)
    }

    @ViewBuilder private var activityOrDots: some View {
        if let acts = message.activities, let last = acts.last(where: { $0.label != nil }) {
            HStack(spacing: 7) {
                ProgressView().scaleEffect(0.7)
                ShimmerText(text: last.label ?? "Working…")
            }
        } else {
            TypingDots()
        }
    }
}

/// Pulsing placeholder rows while a chat loads (nicer than a spinner).
struct SkeletonBubble: View {
    var alignRight = false
    var tall = false
    @State private var pulse = false
    var body: some View {
        HStack {
            if alignRight { Spacer(minLength: 80) }
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(Theme.ink2)
                .frame(maxWidth: alignRight ? 190 : 270)
                .frame(height: alignRight ? 42 : (tall ? 120 : 76))
            if !alignRight { Spacer(minLength: 80) }
        }
        .opacity(pulse ? 0.45 : 0.9)
        .onAppear {
            withAnimation(.easeInOut(duration: 0.85).repeatForever(autoreverses: true)) { pulse = true }
        }
    }
}

/// ChatGPT-style typewriter — a freshly finished reply types itself out, then
/// swaps to full rich rendering. Driven by a structured task (not a timer), so
/// parent re-renders can't stutter or restart it.
struct TypewriterText: View {
    let text: String
    var animate: Bool
    var onGrow: () -> Void = {}
    var onDone: () -> Void = {}
    @State private var shown = 0
    @State private var finished = false
    @State private var caretOn = true

    var body: some View {
        Group {
            if finished || !animate {
                RichText(text: text)
            } else {
                // Reveal word-by-word (smoother than char-by-char) with a soft
                // fade on the newest chunk and a blinking caret while it types.
                (Text(MD.attributed(String(text.prefix(shown))))
                    + Text(caretOn ? " ▍" : "  ").foregroundColor(Theme.accent))
                    .font(.body)
                    .foregroundStyle(Theme.text)
                    .animation(.easeOut(duration: 0.12), value: shown)
            }
        }
        .task(id: text) {
            guard animate, !finished else { return }
            let ns = text as NSString
            while shown < ns.length, !Task.isCancelled {
                // Advance to the end of the next word for a natural cadence.
                var next = min(ns.length, shown + 3)
                while next < ns.length, ns.character(at: next) != 32, ns.character(at: next) != 10 {
                    next += 1
                }
                shown = next
                onGrow()
                try? await Task.sleep(nanoseconds: 34_000_000)
            }
            if shown >= ns.length { finished = true; onDone() }
        }
        .task {
            // Blink the caret while typing.
            while !finished, !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 480_000_000)
                caretOn.toggle()
            }
        }
    }
}

/// Gemini-style shimmering status text while the agent works.
struct ShimmerText: View {
    let text: String
    @State private var phase: CGFloat = -1

    var body: some View {
        Text(text)
            .font(.subheadline.weight(.medium))
            .foregroundStyle(Theme.muted)
            .overlay(
                LinearGradient(colors: [.clear, Theme.text.opacity(0.9), .clear],
                               startPoint: .leading, endPoint: .trailing)
                    .frame(width: 70)
                    .offset(x: phase * 160)
                    .mask(Text(text).font(.subheadline.weight(.medium)))
            )
            .onAppear {
                withAnimation(.linear(duration: 1.4).repeatForever(autoreverses: false)) { phase = 1 }
            }
    }
}
