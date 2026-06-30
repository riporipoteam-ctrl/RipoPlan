import SwiftUI
import PhotosUI
import UniformTypeIdentifiers

struct Suggestion: Identifiable {
    let id = UUID()
    let icon: String
    let label: String
    let seed: String
}

let SUGGESTIONS: [Suggestion] = [
    .init(icon: "soccerball", label: "Follow the World Cup", seed: "Give me a live World Cup update — recent results, today's fixtures, and the standings."),
    .init(icon: "photo", label: "Create an image", seed: "Create an image of "),
    .init(icon: "globe", label: "Build a website", seed: "Build me a website for "),
    .init(icon: "magnifyingglass", label: "Research a topic", seed: "Research and summarize the latest on "),
    .init(icon: "pencil", label: "Write or edit", seed: "Help me write "),
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
                SparkMark(size: 40, color: Theme.text)
                Text("How can I help\(app.firstName.isEmpty ? "" : ", \(app.firstName)")?")
                    .font(.system(size: 24, weight: .semibold))
                    .foregroundStyle(Theme.text)
                    .multilineTextAlignment(.center)
                VStack(spacing: 8) {
                    ForEach(SUGGESTIONS) { s in
                        Button { Haptic.light(); text = s.seed } label: {
                            HStack(spacing: 12) {
                                Image(systemName: s.icon).foregroundStyle(Theme.muted).frame(width: 22)
                                Text(s.label).foregroundStyle(Theme.text)
                                Spacer()
                            }
                            .padding(.horizontal, 14).padding(.vertical, 13)
                            .liquidGlass(16, shadow: false)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 14)
                Spacer(minLength: 110)
            }
            .frame(maxWidth: .infinity)
        }
    }

    // MARK: Existing thread
    private var thread: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 16) {
                    if !loaded { ProgressView().tint(Theme.muted).padding(.top, 40) }
                    ForEach(messages) { m in MessageBubble(message: m).id(m.id) }
                    Color.clear.frame(height: 1).id("end")
                }
                .padding(16)
                .padding(.top, topInset)
                .padding(.bottom, 84)
            }
            .onChange(of: messages.count) { _ in withAnimation(.easeOut(duration: 0.2)) { proxy.scrollTo("end", anchor: .bottom) } }
            .onChange(of: lastStamp) { _ in withAnimation(.easeOut(duration: 0.2)) { proxy.scrollTo("end", anchor: .bottom) } }
        }
    }

    private var lastStamp: String { (messages.last?.status ?? "") + String(messages.last?.content?.count ?? 0) }

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

    var isUser: Bool { message.sender_type == "user" }
    var thinking: Bool { message.status == "thinking" }

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            if isUser { Spacer(minLength: 40) }
            if !isUser {
                Avatar(name: app.agent(message.agent_id)?.name ?? "AskAI",
                       color: app.agent(message.agent_id)?.avatar_color,
                       size: 28, spark: message.agent_id == nil,
                       imageURL: app.agent(message.agent_id)?.avatar_url)
            }
            VStack(alignment: isUser ? .trailing : .leading, spacing: 6) {
                if !isUser, let name = app.agent(message.agent_id)?.name {
                    Text(name).font(.caption.weight(.semibold)).foregroundStyle(Theme.muted)
                }
                if let atts = message.attachments, !atts.isEmpty {
                    ForEach(atts) { a in
                        if a.type == "image" {
                            AsyncImage(url: URL(string: a.url)) { i in i.resizable().scaledToFit() } placeholder: { Theme.ink3 }
                                .frame(maxWidth: 220, maxHeight: 220)
                                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
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
                            .font(.body).foregroundStyle(Theme.text)
                            .textSelection(.enabled)
                            .padding(.horizontal, 14).padding(.vertical, 10)
                            .liquidGlass(18, shadow: false)
                    } else {
                        MD(text: message.content ?? "")
                            .font(.body).foregroundStyle(Theme.text)
                            .textSelection(.enabled)
                    }
                }
            }
            if !isUser { Spacer(minLength: 40) }
        }
    }

    @ViewBuilder private var activityOrDots: some View {
        if let acts = message.activities, let last = acts.last(where: { $0.label != nil }) {
            HStack(spacing: 6) {
                ProgressView().scaleEffect(0.7)
                Text(last.label ?? "Working…").font(.caption).foregroundStyle(Theme.muted)
            }
        } else {
            TypingDots()
        }
    }
}
