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
