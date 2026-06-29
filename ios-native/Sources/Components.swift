import SwiftUI
import Foundation

/// Round agent/user avatar — gradient ring + initial. Reliable (no emoji-keyword mapping).
struct Avatar: View {
    var name: String
    var color: String?
    var size: CGFloat = 36
    var spark: Bool = false

    var body: some View {
        ZStack {
            Circle().fill(
                LinearGradient(colors: [Color(hexString: color), Color(hexString: color).opacity(0.7)],
                               startPoint: .topLeading, endPoint: .bottomTrailing)
            )
            if spark {
                SparkMark(size: size * 0.55, gradient: LinearGradient(colors: [.white, .white], startPoint: .top, endPoint: .bottom))
                    .opacity(0.95)
            } else {
                Text(initial).font(.system(size: size * 0.42, weight: .bold)).foregroundStyle(.white)
            }
        }
        .frame(width: size, height: size)
        .overlay(Circle().stroke(Color.white.opacity(0.15), lineWidth: 1))
    }
    private var initial: String {
        String(name.trimmingCharacters(in: .whitespaces).prefix(1)).uppercased()
    }
}

/// Animated "thinking" dots.
struct TypingDots: View {
    @State private var phase = 0.0
    var body: some View {
        HStack(spacing: 5) {
            ForEach(0..<3) { i in
                Circle().fill(Theme.muted)
                    .frame(width: 7, height: 7)
                    .scaleEffect(phase == Double(i) ? 1.0 : 0.55)
                    .opacity(phase == Double(i) ? 1 : 0.5)
            }
        }
        .onAppear {
            withAnimation(.easeInOut(duration: 0.45).repeatForever()) { phase = 2 }
            Timer.scheduledTimer(withTimeInterval: 0.45, repeats: true) { _ in
                phase = (phase + 1).truncatingRemainder(dividingBy: 3)
            }
        }
    }
}

/// Simple markdown-rendered text (inline styling; falls back to plain).
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

/// A glass composer bar with a growing text field and a gradient send button.
struct InputBar: View {
    @Binding var text: String
    var placeholder: String = "Message your agents…"
    var sending: Bool = false
    var onSend: () -> Void

    @FocusState private var focused: Bool

    var body: some View {
        HStack(alignment: .bottom, spacing: 10) {
            TextField(placeholder, text: $text, axis: .vertical)
                .focused($focused)
                .lineLimit(1...6)
                .foregroundStyle(Theme.text)
                .tint(Theme.accent)
                .padding(.vertical, 10)
                .padding(.leading, 14)

            Button {
                Haptic.medium(); onSend()
            } label: {
                ZStack {
                    if sending { ProgressView().tint(.white) }
                    else { Image(systemName: "arrow.up").font(.system(size: 17, weight: .bold)) }
                }
                .frame(width: 38, height: 38)
                .background(Theme.accentGradient, in: Circle())
                .foregroundStyle(.white)
                .opacity(canSend ? 1 : 0.4)
            }
            .disabled(!canSend)
            .padding(4)
        }
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).stroke(Theme.stroke, lineWidth: 1))
    }
    private var canSend: Bool { !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !sending }
}

/// Section header used across screens.
struct SectionHeader: View {
    let title: String
    var trailing: String?
    var body: some View {
        HStack {
            Text(title).font(.headline.bold()).foregroundStyle(Theme.text)
            Spacer()
            if let trailing { Text(trailing).font(.subheadline).foregroundStyle(Theme.muted) }
        }
    }
}
