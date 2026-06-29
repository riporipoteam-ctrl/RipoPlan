import SwiftUI

struct ChatView: View {
    @EnvironmentObject var app: AppState
    let threadId: String

    @State private var messages: [Message] = []
    @State private var text = ""
    @State private var sending = false
    @State private var loaded = false

    private var title: String { app.threads.first { $0.id == threadId }?.title ?? "Chat" }

    var body: some View {
        ZStack {
            Theme.backdrop.ignoresSafeArea()
            VStack(spacing: 0) {
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(spacing: 14) {
                            if !loaded {
                                ProgressView().tint(Theme.muted).padding(.top, 40)
                            }
                            ForEach(messages) { m in
                                MessageBubble(message: m).id(m.id)
                            }
                            Color.clear.frame(height: 1).id("bottom")
                        }
                        .padding(16)
                    }
                    .onChange(of: messages.count) { _ in
                        withAnimation(.easeOut(duration: 0.25)) { proxy.scrollTo("bottom", anchor: .bottom) }
                    }
                    .onChange(of: lastStatus) { _ in
                        withAnimation(.easeOut(duration: 0.25)) { proxy.scrollTo("bottom", anchor: .bottom) }
                    }
                }
                InputBar(text: $text, placeholder: "Reply…", sending: sending) { send() }
                    .padding(.horizontal, 14)
                    .padding(.bottom, 8)
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) {
                Text(title).font(.headline).foregroundStyle(Theme.text).lineLimit(1)
            }
        }
        .onAppear { app.hideTabBar = true }
        .onDisappear { app.hideTabBar = false }
        .task(id: threadId) { await pollLoop() }
    }

    private var lastStatus: String { messages.last?.status ?? "" }

    private func pollLoop() async {
        while !Task.isCancelled {
            let m = await app.messages(thread: threadId)
            if !m.isEmpty || loaded { messages = m }
            loaded = true
            try? await Task.sleep(nanoseconds: 2_500_000_000)
        }
    }

    private func send() {
        let t = text
        sending = true; text = ""
        Task {
            _ = await app.send(t, threadId: threadId)
            messages = await app.messages(thread: threadId)
            sending = false
        }
    }
}

struct MessageBubble: View {
    @EnvironmentObject var app: AppState
    let message: Message

    var isUser: Bool { message.sender_type == "user" }
    var thinking: Bool { message.status == "thinking" }

    var body: some View {
        HStack(alignment: .bottom, spacing: 8) {
            if isUser { Spacer(minLength: 40) }
            if !isUser {
                Avatar(name: app.agent(message.agent_id)?.name ?? "AskAI",
                       color: app.agent(message.agent_id)?.avatar_color,
                       size: 30, spark: message.agent_id == nil)
            }
            VStack(alignment: isUser ? .trailing : .leading, spacing: 6) {
                if !isUser, let name = app.agent(message.agent_id)?.name {
                    Text(name).font(.caption.bold()).foregroundStyle(Theme.muted)
                }
                if let acts = message.activities, !acts.isEmpty, thinking || hasRunning(acts) {
                    ForEach(Array(acts.enumerated()), id: \.offset) { _, a in
                        if let label = a.label {
                            HStack(spacing: 6) {
                                Image(systemName: a.status == "done" ? "checkmark.circle.fill" : "circle.dotted")
                                    .font(.caption2)
                                    .foregroundStyle(a.status == "done" ? Theme.good : Theme.accent)
                                Text(label).font(.caption).foregroundStyle(Theme.muted)
                            }
                        }
                    }
                }
                if thinking && (message.content ?? "").isEmpty {
                    TypingDots().padding(.vertical, 4)
                } else if !(message.content ?? "").isEmpty {
                    MD(text: message.content ?? "")
                        .font(.body)
                        .foregroundStyle(isUser ? Color.white : Theme.text)
                        .textSelection(.enabled)
                }
            }
            .padding(.horizontal, 14).padding(.vertical, 10)
            .background(bubbleBG)
            .overlay(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .stroke(isUser ? Color.clear : Theme.stroke, lineWidth: 1)
            )
            if !isUser { Spacer(minLength: 40) }
        }
    }

    private func hasRunning(_ acts: [Activity]) -> Bool { acts.contains { $0.status == "running" } }

    @ViewBuilder private var bubbleBG: some View {
        if isUser {
            Theme.accentGradient.clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        } else {
            RoundedRectangle(cornerRadius: 18, style: .continuous).fill(.ultraThinMaterial)
        }
    }
}
