import SwiftUI
import UIKit
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
                    .fill(spark ? AnyShapeStyle(Theme.accent)
                                : AnyShapeStyle(LinearGradient(colors: [base.opacity(0.95), base.opacity(0.65)],
                                                               startPoint: .topLeading, endPoint: .bottomTrailing)))
                if let s = imageURL, !s.isEmpty, let u = URL(string: s) {
                    AsyncImage(url: u) { img in img.resizable().scaledToFill() } placeholder: { Color.clear }
                        .frame(width: size, height: size)
                        .clipShape(RoundedRectangle(cornerRadius: r, style: .continuous))
                } else if spark {
                    SparkMark(size: size * 0.5, color: Theme.onAccent)
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

/// Full-screen image viewer: pinch to zoom, drag to pan, share/save, tap X to close.
struct ImageViewer: View {
    let url: String
    @Environment(\.dismiss) private var dismiss
    @State private var scale: CGFloat = 1
    @State private var lastScale: CGFloat = 1
    @State private var offset: CGSize = .zero
    @State private var lastOffset: CGSize = .zero

    var body: some View {
        ZStack(alignment: .top) {
            Color.black.ignoresSafeArea()
            AsyncImage(url: URL(string: url)) { img in
                img.resizable().scaledToFit()
                    .scaleEffect(scale)
                    .offset(offset)
                    .gesture(
                        MagnificationGesture()
                            .onChanged { v in scale = max(1, min(5, lastScale * v)) }
                            .onEnded { _ in lastScale = scale }
                            .simultaneously(with: DragGesture()
                                .onChanged { v in
                                    offset = CGSize(width: lastOffset.width + v.translation.width,
                                                    height: lastOffset.height + v.translation.height)
                                }
                                .onEnded { _ in lastOffset = offset })
                    )
                    .onTapGesture(count: 2) {
                        withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                            if scale > 1 { scale = 1; lastScale = 1; offset = .zero; lastOffset = .zero }
                            else { scale = 2.5; lastScale = 2.5 }
                        }
                    }
            } placeholder: { ProgressView().tint(.white) }
            .frame(maxWidth: .infinity, maxHeight: .infinity)

            HStack {
                Button { dismiss() } label: {
                    Image(systemName: "xmark").font(.system(size: 15, weight: .bold)).foregroundStyle(.white)
                        .frame(width: 36, height: 36).background(.white.opacity(0.15), in: Circle())
                }
                Spacer()
                if let u = URL(string: url) {
                    ShareLink(item: u) {
                        Image(systemName: "square.and.arrow.up").font(.system(size: 15, weight: .semibold)).foregroundStyle(.white)
                            .frame(width: 36, height: 36).background(.white.opacity(0.15), in: Circle())
                    }
                }
            }
            .padding(.horizontal, 16).padding(.top, 8)
        }
        .statusBarHidden()
    }
}

/// ONE consolidated browsing card per message (instead of a stack of preview
/// cards). Collapsed by default — a compact pill saying what the agent is
/// browsing — and a chevron drops down the live page view with fullscreen +
/// open-in-Safari. Visited pages become chips you can flip between.
struct BrowserSessionCard: View {
    let pages: [Attachment]          // attachments with type == "link"
    var live: Bool = false
    @State private var expanded = false
    @State private var selected = 0
    @State private var showFull = false
    @State private var pulse = false
    @Environment(\.openURL) private var openURL

    private var page: Attachment? {
        pages.indices.contains(selected) ? pages[selected] : pages.last
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Collapsed header pill — always visible, toggles the drop-down.
            Button {
                Haptic.light()
                withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) { expanded.toggle() }
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "globe").font(.system(size: 13, weight: .semibold)).foregroundStyle(Theme.text)
                        .frame(width: 26, height: 26)
                        .background(Theme.ink3, in: Circle())
                    Text(live ? "Browsing · \(pages.last?.name ?? "the web")"
                              : "Browsed \(pages.count) page\(pages.count == 1 ? "" : "s")")
                        .font(.footnote.weight(.semibold)).foregroundStyle(Theme.text).lineLimit(1)
                    if live {
                        HStack(spacing: 4) {
                            Circle().fill(.red).frame(width: 5, height: 5).opacity(pulse ? 1 : 0.3)
                            Text("LIVE").font(.system(size: 9, weight: .heavy)).foregroundStyle(.red)
                        }
                        .onAppear { withAnimation(.easeInOut(duration: 0.7).repeatForever()) { pulse = true } }
                    }
                    Spacer(minLength: 8)
                    Image(systemName: "chevron.down").font(.caption2.weight(.bold)).foregroundStyle(Theme.muted)
                        .rotationEffect(.degrees(expanded ? 180 : 0))
                }
                .padding(.horizontal, 10).padding(.vertical, 8)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            if expanded, let p = page {
                VStack(alignment: .leading, spacing: 8) {
                    ZStack {
                        RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Theme.ink3)
                        if let s = p.preview, let u = URL(string: s) {
                            AsyncImage(url: u) { i in
                                i.resizable().scaledToFill()
                            } placeholder: {
                                VStack(spacing: 6) {
                                    ProgressView().tint(Theme.muted)
                                    Text("Loading page…").font(.caption).foregroundStyle(Theme.muted)
                                }
                            }
                        } else {
                            Image(systemName: "globe").font(.title2).foregroundStyle(Theme.muted)
                        }
                    }
                    .frame(height: 170)
                    .frame(maxWidth: .infinity)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .onTapGesture { if p.preview != nil { Haptic.light(); showFull = true } }

                    HStack(spacing: 8) {
                        Text(p.name).font(.caption.weight(.medium)).foregroundStyle(Theme.muted).lineLimit(1)
                        Spacer()
                        Button { Haptic.light(); showFull = true } label: {
                            Image(systemName: "arrow.up.left.and.arrow.down.right")
                                .font(.system(size: 12, weight: .semibold)).foregroundStyle(Theme.text)
                                .frame(width: 28, height: 28)
                                .background(Theme.ink3, in: Circle())
                        }
                        .buttonStyle(.plain)
                        Button { Haptic.light(); if let u = URL(string: p.url) { openURL(u) } } label: {
                            HStack(spacing: 4) {
                                Image(systemName: "safari").font(.system(size: 12, weight: .semibold))
                                Text("Open").font(.caption.weight(.semibold))
                            }
                            .foregroundStyle(Theme.onAccent)
                            .padding(.horizontal, 10).padding(.vertical, 6)
                            .background(Theme.accent, in: Capsule())
                        }
                        .buttonStyle(.plain)
                    }

                    if pages.count > 1 {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 6) {
                                ForEach(Array(pages.enumerated()), id: \.offset) { i, pg in
                                    Button { Haptic.selection(); selected = i } label: {
                                        Text(pg.name).font(.caption2.weight(.semibold)).lineLimit(1)
                                            .foregroundStyle(i == selected ? Theme.onAccent : Theme.text)
                                            .padding(.horizontal, 9).padding(.vertical, 5)
                                            .background(i == selected ? AnyShapeStyle(Theme.accent) : AnyShapeStyle(Theme.ink3), in: Capsule())
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        }
                    }
                }
                .padding(.horizontal, 10).padding(.bottom, 10)
                .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .frame(maxWidth: 320)
        .background(Theme.ink2, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Theme.stroke, lineWidth: 1))
        .onChange(of: pages.count) { n in if live { selected = max(0, n - 1) } }
        .onAppear { selected = max(0, pages.count - 1) }
        .fullScreenCover(isPresented: $showFull) {
            if let p = page, let s = p.preview { ImageViewer(url: s) }
        }
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

/// Smooth wave "thinking" dots (modern, no timer jank).
struct TypingDots: View {
    @State private var up = false
    var body: some View {
        HStack(spacing: 5) {
            ForEach(0..<3) { i in
                Circle().fill(Theme.muted)
                    .frame(width: 7, height: 7)
                    .offset(y: up ? -4 : 2)
                    .opacity(up ? 1 : 0.5)
                    .animation(.easeInOut(duration: 0.45).repeatForever(autoreverses: true).delay(Double(i) * 0.14), value: up)
            }
        }
        .padding(.vertical, 4)
        .onAppear { up = true }
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
                    VStack(alignment: .leading, spacing: 0) {
                        HStack {
                            Text("CODE").font(.caption2.weight(.bold)).foregroundStyle(Theme.muted)
                            Spacer()
                            Button {
                                UIPasteboard.general.string = c; Haptic.success()
                            } label: {
                                Label("Copy", systemImage: "doc.on.doc").font(.caption2.weight(.semibold)).foregroundStyle(Theme.muted)
                            }.buttonStyle(.plain)
                        }
                        .padding(.horizontal, 12).padding(.vertical, 7)
                        .background(Theme.ink3)
                        ScrollView(.horizontal, showsIndicators: false) {
                            Text(c).font(.system(.footnote, design: .monospaced)).foregroundStyle(Theme.text)
                                .padding(12)
                        }
                    }
                    .background(Theme.ink2)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
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
    var onVoice: (() -> Void)? = nil

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
            // ChatGPT composer — one clean capsule: plain "+", the field, and a
            // circular send button that lights up when there's something to send.
            HStack(alignment: .bottom, spacing: 10) {
                Button { Haptic.light(); showMenu = true } label: {
                    Image(systemName: "plus")
                        .font(.system(size: 20, weight: .medium))
                        .foregroundStyle(Theme.text)
                        .frame(width: 34, height: 34)
                        .contentShape(Circle())
                }
                .buttonStyle(.plain)
                .confirmationDialog("Add attachment", isPresented: $showMenu, titleVisibility: .visible) {
                    Button("Photo Library") { onPickPhoto() }
                    Button("Files") { onPickFile() }
                    Button("Cancel", role: .cancel) {}
                }

                TextField(placeholder, text: $text, axis: .vertical)
                    .focused($focused)
                    .lineLimit(1...6)
                    .font(.body)
                    .foregroundStyle(Theme.text)
                    .tint(Theme.text)
                    .padding(.vertical, 7)

                if let onVoice, !canSend, !sending,
                   text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, attachments.isEmpty {
                    // Empty field → voice call button (ChatGPT-style).
                    Button { Haptic.medium(); onVoice() } label: {
                        Image(systemName: "waveform")
                            .font(.system(size: 16, weight: .bold))
                            .foregroundStyle(.white)
                            .frame(width: 34, height: 34)
                            .background(Theme.blue, in: Circle())
                            .shadow(color: Theme.blue.opacity(0.35), radius: 6, y: 2)
                    }
                    .transition(.scale.combined(with: .opacity))
                } else {
                    Button { Haptic.medium(); onSend() } label: {
                        ZStack {
                            Circle().fill(canSend ? AnyShapeStyle(Theme.accent) : AnyShapeStyle(Theme.muted.opacity(0.3)))
                            if sending { ProgressView().tint(Theme.onAccent) }
                            else { Image(systemName: "arrow.up").font(.system(size: 16, weight: .bold)) }
                        }
                        .frame(width: 34, height: 34)
                        .foregroundStyle(Theme.onAccent)
                        .scaleEffect(canSend ? 1 : 0.88)
                        .animation(.spring(response: 0.3, dampingFraction: 0.7), value: canSend)
                    }
                    .disabled(!canSend)
                    .transition(.scale.combined(with: .opacity))
                }
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 6)
            .liquidGlass(28)
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
