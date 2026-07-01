import SwiftUI
import Foundation
import PhotosUI
import UniformTypeIdentifiers

/// Round agent/user avatar — neutral circle + initial (no loud colors).
struct Avatar: View {
    var name: String
    var color: String?
    var size: CGFloat = 36
    var spark: Bool = false
    var imageURL: String? = nil

    var body: some View {
        ZStack {
            Circle().fill(Theme.ink2)
            Circle().stroke(Theme.stroke, lineWidth: 1)
            if let s = imageURL, !s.isEmpty, let u = URL(string: s) {
                AsyncImage(url: u) { img in
                    img.resizable().scaledToFill()
                } placeholder: {
                    Text(initial).font(.system(size: size * 0.42, weight: .semibold)).foregroundStyle(Theme.text)
                }
                .frame(width: size, height: size)
                .clipShape(Circle())
            } else if spark {
                SparkMark(size: size * 0.5, color: Theme.text)
            } else {
                Text(initial).font(.system(size: size * 0.42, weight: .semibold)).foregroundStyle(Theme.text)
            }
        }
        .frame(width: size, height: size)
    }
    private var initial: String { String(name.trimmingCharacters(in: .whitespaces).prefix(1)).uppercased() }
}

/// Nebula-style colorful agent tile: rounded square with a gradient fill (from the
/// agent's color), bold white initial (or custom image), and a green online dot.
struct AgentAvatar: View {
    var name: String
    var color: String?
    var size: CGFloat = 44
    var online: Bool = true
    var spark: Bool = false
    var imageURL: String? = nil

    private var base: Color { Color(hexString: color ?? "#6e6e80") }
    var body: some View {
        let r = size * 0.30
        ZStack(alignment: .bottomTrailing) {
            ZStack {
                RoundedRectangle(cornerRadius: r, style: .continuous)
                    .fill(LinearGradient(colors: [base.opacity(0.95), base.opacity(0.65)],
                                         startPoint: .topLeading, endPoint: .bottomTrailing))
                if let s = imageURL, !s.isEmpty, let u = URL(string: s) {
                    AsyncImage(url: u) { img in img.resizable().scaledToFill() } placeholder: { Color.clear }
                        .frame(width: size, height: size)
                        .clipShape(RoundedRectangle(cornerRadius: r, style: .continuous))
                } else if spark {
                    SparkMark(size: size * 0.5, color: .white)
                } else {
                    Text(String(name.trimmingCharacters(in: .whitespaces).prefix(1)).uppercased())
                        .font(.system(size: size * 0.44, weight: .bold)).foregroundStyle(.white)
                }
            }
            .frame(width: size, height: size)
            .overlay(RoundedRectangle(cornerRadius: r, style: .continuous).stroke(.white.opacity(0.18), lineWidth: 1))
            .shadow(color: base.opacity(0.35), radius: 6, y: 3)
            if online {
                Circle().fill(Theme.good)
                    .frame(width: size * 0.26, height: size * 0.26)
                    .overlay(Circle().stroke(Theme.ink, lineWidth: size * 0.05))
                    .offset(x: size * 0.06, y: size * 0.06)
            }
        }
        .frame(width: size, height: size)
    }
}

/// Live browser preview card — shows a screenshot of a page an agent browsed,
/// with a tap/button to open it live in the browser.
struct BrowserPreviewCard: View {
    let url: String
    let host: String
    var shot: String?
    @Environment(\.openURL) private var openURL

    var body: some View {
        Button {
            Haptic.light(); if let u = URL(string: url) { openURL(u) }
        } label: {
            VStack(alignment: .leading, spacing: 0) {
                ZStack {
                    Theme.ink3
                    if let s = shot, let u = URL(string: s) {
                        AsyncImage(url: u) { i in i.resizable().scaledToFill() } placeholder: {
                            HStack(spacing: 6) { ProgressView().scaleEffect(0.7); Text("Loading live view…").font(.caption).foregroundStyle(Theme.muted) }
                        }
                    }
                }
                .frame(width: 240, height: 150).clipped()
                HStack(spacing: 6) {
                    Image(systemName: "globe").font(.caption2).foregroundStyle(Theme.accent)
                    Text(host).font(.caption.weight(.medium)).foregroundStyle(Theme.text).lineLimit(1)
                    Spacer()
                    HStack(spacing: 3) {
                        Image(systemName: "eye.fill").font(.caption2)
                        Text("View live").font(.caption2.weight(.semibold))
                    }.foregroundStyle(Theme.accent)
                }
                .padding(.horizontal, 10).padding(.vertical, 8)
            }
            .frame(width: 240)
            .background(Theme.ink2, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Theme.stroke, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }
}

/// Centered date separator between days of messages (Nebula-style).
struct DayDivider: View {
    let label: String
    var body: some View {
        HStack(spacing: 10) {
            Rectangle().fill(Theme.stroke).frame(height: 1)
            Text(label).font(.caption2.weight(.semibold)).foregroundStyle(Theme.muted)
                .fixedSize()
            Rectangle().fill(Theme.stroke).frame(height: 1)
        }
        .padding(.vertical, 2)
    }
}

/// Animated "thinking" dots.
struct TypingDots: View {
    @State private var t = 0.0
    var body: some View {
        HStack(spacing: 5) {
            ForEach(0..<3) { i in
                Circle().fill(Theme.muted)
                    .frame(width: 7, height: 7)
                    .opacity(t == Double(i) ? 1 : 0.4)
                    .scaleEffect(t == Double(i) ? 1 : 0.7)
            }
        }
        .onAppear {
            Timer.scheduledTimer(withTimeInterval: 0.4, repeats: true) { _ in
                withAnimation(.easeInOut(duration: 0.3)) { t = (t + 1).truncatingRemainder(dividingBy: 3) }
            }
        }
    }
}

/// Inline-markdown text (falls back to plain).
struct MD: View {
    let text: String
    var body: some View {
        if let attr = try? AttributedString(markdown: text, options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace)) {
            Text(attr)
        } else {
            Text(text)
        }
    }
}

struct SectionHeader: View {
    let title: String
    var trailing: String?
    var body: some View {
        HStack {
            Text(title).font(.subheadline.weight(.semibold)).foregroundStyle(Theme.muted)
            Spacer()
            if let trailing { Text(trailing).font(.subheadline).foregroundStyle(Theme.muted) }
        }
    }
}

/// ChatGPT-style composer: rounded field with a leading "+" upload button, a
/// growing text field, and a circular send button. Supports image/file attach.
struct InputBar: View {
    @Binding var text: String
    @Binding var attachments: [Attachment]
    var placeholder: String = "Ask AskAI"
    var sending: Bool = false
    var uploading: Bool = false
    var onSend: () -> Void
    var onPickPhoto: () -> Void
    var onPickFile: () -> Void

    @State private var showMenu = false
    @FocusState private var focused: Bool

    var body: some View {
        VStack(spacing: 8) {
            if !attachments.isEmpty || uploading {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(attachments) { a in attachmentChip(a) }
                        if uploading {
                            RoundedRectangle(cornerRadius: 12, style: .continuous)
                                .fill(Theme.ink3)
                                .frame(width: 56, height: 56)
                                .overlay(ProgressView())
                        }
                    }
                    .padding(.horizontal, 4)
                }
            }
            HStack(alignment: .bottom, spacing: 8) {
                Button { Haptic.light(); showMenu = true } label: {
                    Image(systemName: "plus")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(Theme.text)
                        .frame(width: 34, height: 34)
                        .background(Theme.ink3, in: Circle())
                }
                .confirmationDialog("Add attachment", isPresented: $showMenu, titleVisibility: .visible) {
                    Button("Photo Library") { onPickPhoto() }
                    Button("Files") { onPickFile() }
                    Button("Cancel", role: .cancel) {}
                }

                TextField(placeholder, text: $text, axis: .vertical)
                    .focused($focused)
                    .lineLimit(1...6)
                    .foregroundStyle(Theme.text)
                    .tint(Theme.text)
                    .padding(.vertical, 7)

                Button { Haptic.medium(); onSend() } label: {
                    ZStack {
                        if sending { ProgressView().tint(Theme.onAccent) }
                        else { Image(systemName: "arrow.up").font(.system(size: 16, weight: .bold)) }
                    }
                    .frame(width: 34, height: 34)
                    .background(canSend ? Theme.accent : Theme.muted.opacity(0.4), in: Circle())
                    .foregroundStyle(Theme.onAccent)
                }
                .disabled(!canSend)
            }
            .padding(.horizontal, 6)
            .padding(.vertical, 6)
            .liquidGlass(26)
            .overlay(RoundedRectangle(cornerRadius: 26, style: .continuous).stroke(Theme.stroke, lineWidth: 1))
        }
    }

    private var canSend: Bool {
        (!text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !attachments.isEmpty) && !sending && !uploading
    }

    @ViewBuilder private func attachmentChip(_ a: Attachment) -> some View {
        ZStack(alignment: .topTrailing) {
            if a.type == "image" {
                AsyncImage(url: URL(string: a.url)) { img in
                    img.resizable().scaledToFill()
                } placeholder: { Theme.ink3 }
                .frame(width: 56, height: 56)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            } else {
                RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Theme.ink3)
                    .frame(width: 56, height: 56)
                    .overlay(Image(systemName: "doc.fill").foregroundStyle(Theme.muted))
            }
            Button { attachments.removeAll { $0.id == a.id } } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(.system(size: 16))
                    .foregroundStyle(.white, .black.opacity(0.6))
            }
            .offset(x: 5, y: -5)
        }
    }
}
