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

/// Rich block-level Markdown: headings, bullet/numbered lists, code blocks, and
/// inline images — so agent replies look polished (Gemini-style).
struct RichText: View {
    let text: String

    private enum Block: Identifiable {
        case heading(Int, String), bullet(String), ordered(String, String)
        case code(String), image(String), paragraph(String)
        var id: String { UUID().uuidString }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            ForEach(parse()) { block in
                switch block {
                case .heading(let lvl, let t):
                    Text(t).font(.system(size: lvl == 1 ? 22 : lvl == 2 ? 19 : 17, weight: .bold))
                        .foregroundStyle(Theme.text).padding(.top, 2)
                case .bullet(let t):
                    HStack(alignment: .top, spacing: 8) {
                        Circle().fill(Theme.accent).frame(width: 5, height: 5).padding(.top, 8)
                        MD(text: t).font(.body).foregroundStyle(Theme.text)
                    }
                case .ordered(let n, let t):
                    HStack(alignment: .top, spacing: 8) {
                        Text("\(n).").font(.body.weight(.semibold)).foregroundStyle(Theme.accent)
                        MD(text: t).font(.body).foregroundStyle(Theme.text)
                    }
                case .code(let c):
                    ScrollView(.horizontal, showsIndicators: false) {
                        Text(c).font(.system(.footnote, design: .monospaced)).foregroundStyle(Theme.text)
                            .padding(12)
                    }
                    .background(Theme.ink2, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 12).stroke(Theme.stroke, lineWidth: 1))
                case .image(let url):
                    AsyncImage(url: URL(string: url)) { i in i.resizable().scaledToFit() } placeholder: {
                        RoundedRectangle(cornerRadius: 16).fill(Theme.ink3).frame(height: 180).overlay(ProgressView().tint(Theme.muted))
                    }
                    .frame(maxWidth: 300).clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 16).stroke(Theme.stroke, lineWidth: 1))
                case .paragraph(let p):
                    MD(text: p).font(.body).foregroundStyle(Theme.text).textSelection(.enabled)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func parse() -> [Block] {
        var out: [Block] = []
        let lines = text.components(separatedBy: "\n")
        var para: [String] = []
        var code: [String] = []
        var inCode = false
        func flushPara() { if !para.isEmpty { out.append(.paragraph(para.joined(separator: "\n"))); para = [] } }
        for raw in lines {
            let line = raw
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            if trimmed.hasPrefix("```") {
                if inCode { out.append(.code(code.joined(separator: "\n"))); code = []; inCode = false }
                else { flushPara(); inCode = true }
                continue
            }
            if inCode { code.append(line); continue }
            if let m = firstMatch("^(#{1,3})\\s+(.*)$", line) { flushPara(); out.append(.heading(m.0.count, m.1)); continue }
            if let m = firstMatch("^!\\[[^\\]]*\\]\\(([^)]+)\\)\\s*$", line) { flushPara(); out.append(.image(m.1)); continue }
            if let m = firstMatch("^\\s*[-*•]\\s+(.*)$", line) { flushPara(); out.append(.bullet(m.1)); continue }
            if let m = firstMatch("^\\s*(\\d+)[.)]\\s+(.*)$", line) { flushPara(); out.append(.ordered(m.0, m.1)); continue }
            if trimmed.isEmpty { flushPara() } else { para.append(line) }
        }
        if inCode, !code.isEmpty { out.append(.code(code.joined(separator: "\n"))) }
        flushPara()
        return out
    }

    private func firstMatch(_ pattern: String, _ s: String) -> (String, String)? {
        guard let re = try? NSRegularExpression(pattern: pattern) else { return nil }
        let ns = s as NSString
        guard let m = re.firstMatch(in: s, range: NSRange(location: 0, length: ns.length)) else { return nil }
        let g1 = m.numberOfRanges > 1 && m.range(at: 1).location != NSNotFound ? ns.substring(with: m.range(at: 1)) : ""
        let g2 = m.numberOfRanges > 2 && m.range(at: 2).location != NSNotFound ? ns.substring(with: m.range(at: 2)) : ""
        return (g1, g2.isEmpty && m.numberOfRanges <= 2 ? g1 : g2)
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
