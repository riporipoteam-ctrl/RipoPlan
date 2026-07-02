import SwiftUI
import UIKit
import PhotosUI
import UniformTypeIdentifiers

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

    @State private var photoItem: PhotosPickerItem?
    @State private var showPhoto = false
    @State private var showFiles = false
    @State private var heroIn = false
    @State private var showScrollDown = false

    var body: some View {
        ZStack(alignment: .bottom) {
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
                         onSend: send, onPickPhoto: { showPhoto = true }, onPickFile: { showFiles = true })
                    .padding(.horizontal, 12)
                    .padding(.bottom, 8)
                    .background(Theme.ink.opacity(0.001))
            }
        }
        .background(AuroraBackground())
        .photosPicker(isPresented: $showPhoto, selection: $photoItem, matching: .images)
        .onChange(of: photoItem) { item in Task { await loadPhoto(item) } }
        .fileImporter(isPresented: $showFiles, allowedContentTypes: [.item], allowsMultipleSelection: false) { result in
            Task { await loadFile(result) }
        }
        .task(id: threadId) { await poll() }
    }

    // MARK: New chat (empty state)
    private var newChat: some View {
        ScrollView {
            VStack(spacing: 18) {
                Spacer(minLength: 70 + topInset)
                BrandSpark(size: 42)
                    .scaleEffect(heroIn ? 1 : 0.7).opacity(heroIn ? 1 : 0)
                Text(greeting)
                    .font(.system(size: 30, weight: .bold))
                    .foregroundStyle(Theme.brandGradient)
                    .multilineTextAlignment(.center)
                    .opacity(heroIn ? 1 : 0).offset(y: heroIn ? 0 : 8)
                Text("What should your team get done?")
                    .font(.subheadline).foregroundStyle(Theme.muted)
                    .opacity(heroIn ? 1 : 0)
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                    ForEach(Array(SUGGESTIONS.enumerated()), id: \.element.id) { i, s in
                        Button { Haptic.light(); text = s.seed } label: {
                            VStack(alignment: .leading, spacing: 10) {
                                Image(systemName: s.icon)
                                    .font(.system(size: 17, weight: .semibold))
                                    .foregroundStyle(Color(hexString: s.color))
                                    .frame(width: 34, height: 34)
                                    .background(Color(hexString: s.color).opacity(0.14), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                                Text(s.label).font(.subheadline.weight(.semibold)).foregroundStyle(Theme.text)
                                    .multilineTextAlignment(.leading).lineLimit(2)
                                Spacer(minLength: 0)
                            }
                            .padding(13)
                            .frame(maxWidth: .infinity, minHeight: 104, alignment: .topLeading)
                            .liquidGlass(18, shadow: false)
                        }
                        .pressable()
                        .opacity(heroIn ? 1 : 0)
                        .offset(y: heroIn ? 0 : 14)
                        .animation(.spring(response: 0.45, dampingFraction: 0.85).delay(0.05 * Double(i) + 0.1), value: heroIn)
                    }
                }
                .padding(.horizontal, 14)
                Spacer(minLength: 110)
            }
            .frame(maxWidth: .infinity)
        }
        .onAppear { withAnimation(.spring(response: 0.5, dampingFraction: 0.8)) { heroIn = true } }
    }

    // MARK: Existing thread
    private var thread: some View {
        ScrollViewReader { proxy in
            GeometryReader { geo in
                ScrollView {
                    LazyVStack(spacing: 16) {
                        if !loaded { ProgressView().tint(Theme.muted).padding(.top, 40) }
                        ForEach(Array(messages.enumerated()), id: \.element.id) { idx, m in
                            if let label = dayDivider(at: idx) { DayDivider(label: label) }
                            MessageBubble(message: m, onResend: { body in
                                Task { _ = await app.send(body, threadId: threadId) }
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
            .onChange(of: lastStamp) { _ in withAnimation(.easeOut(duration: 0.2)) { proxy.scrollTo("end", anchor: .bottom) } }
            .overlay(alignment: .bottom) {
                if showScrollDown {
                    Button { withAnimation { proxy.scrollTo("end", anchor: .bottom) } } label: {
                        Image(systemName: "arrow.down").font(.system(size: 16, weight: .semibold)).foregroundStyle(Theme.text)
                            .frame(width: 38, height: 38)
                            .background(.ultraThinMaterial, in: Circle())
                            .overlay(Circle().stroke(Theme.stroke, lineWidth: 1))
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
        while !Task.isCancelled {
            let m = await app.messages(thread: tid)
            messages = m; loaded = true
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
    private func loadPhoto(_ item: PhotosPickerItem?) async {
        guard let item else { return }
        uploading = true
        if let data = try? await item.loadTransferable(type: Data.self) {
            if let att = await app.upload(data: data, ext: "jpg", contentType: "image/jpeg", name: "Photo.jpg") {
                attachments.append(att); Haptic.success()
            }
        }
        uploading = false; photoItem = nil
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
    @State private var showTrail = false
    @State private var appeared = false
    @State private var viewerURL: String?

    var isUser: Bool { message.sender_type == "user" }
    var thinking: Bool { message.status == "thinking" }
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
                                AsyncImage(url: URL(string: a.url)) { i in i.resizable().scaledToFit() } placeholder: {
                                    RoundedRectangle(cornerRadius: 18, style: .continuous).fill(Theme.ink3)
                                        .frame(height: 220)
                                        .overlay(ProgressView().tint(Theme.muted))
                                }
                                .frame(maxWidth: 300)
                                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                                .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(Theme.stroke, lineWidth: 1))
                            }
                            .buttonStyle(.plain)
                        } else if a.type == "link" {
                            BrowserPreviewCard(url: a.url, host: a.name, shot: a.preview, live: thinking)
                        } else {
                            HStack(spacing: 6) { Image(systemName: "doc.fill"); Text(a.name).lineLimit(1) }
                                .font(.footnote).foregroundStyle(Theme.muted)
                        }
                    }
                }
                if thinking && (message.content ?? "").isEmpty {
                    activityOrDots
                } else if !(message.content ?? "").isEmpty {
                    if isUser {
                        MD(text: message.content ?? "")
                            .font(.body).foregroundStyle(.white)
                            .textSelection(.enabled)
                            .padding(.horizontal, 15).padding(.vertical, 11)
                            .background(
                                UnevenRoundedRectangle(topLeadingRadius: 20, bottomLeadingRadius: 20,
                                                       bottomTrailingRadius: 6, topTrailingRadius: 20, style: .continuous)
                                    .fill(Theme.brandGradient)
                            )
                            .shadow(color: Theme.brandB.opacity(0.3), radius: 8, y: 4)
                    } else {
                        RichText(text: message.content ?? "")
                    }
                }
                if !doneActivities.isEmpty { activityTrail }
            }
            if !isUser { Spacer(minLength: 40) }
        }
        .opacity(appeared ? 1 : 0)
        .offset(y: appeared ? 0 : 10)
        .onAppear { withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) { appeared = true } }
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
            }
        }
        .fullScreenCover(isPresented: Binding(get: { viewerURL != nil }, set: { if !$0 { viewerURL = nil } })) {
            if let u = viewerURL { ImageViewer(url: u) }
        }
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
