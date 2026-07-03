import SwiftUI
import AVFoundation
import Speech

// MARK: - Voices (ElevenLabs premade — realistic, free-tier friendly)

struct AIVoice: Identifiable {
    let id: String      // ElevenLabs voice id
    let name: String
    let vibe: String
}

let AI_VOICES: [AIVoice] = [
    .init(id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel", vibe: "Warm · calm"),
    .init(id: "pNInz6obpgDQGcFmaJgB", name: "Adam", vibe: "Deep · confident"),
    .init(id: "EXAVITQu4vr4xnSDxMaL", name: "Sarah", vibe: "Soft · friendly"),
    .init(id: "ErXwobaYiN019PkySvjV", name: "Antoni", vibe: "Well-rounded"),
    .init(id: "JBFqnCBsd6RMkjVDRZzb", name: "George", vibe: "British · warm"),
    .init(id: "XB0fDUnXU5powFXDhCwa", name: "Charlotte", vibe: "Calm · smooth"),
    .init(id: "TxGEqnHWrfWFTfGW9XjX", name: "Josh", vibe: "Young · energetic"),
    .init(id: "MF3mGyEYCl7XYWbV9V6O", name: "Elli", vibe: "Bright · clear"),
]

/// The voice chosen for an agent (Settings → Voice). Agents without an explicit
/// choice get a stable voice derived from their id, so everyone sounds distinct.
func voiceId(for agent: Agent?) -> String {
    guard let agent else {
        return UserDefaults.standard.string(forKey: "askai.voice.main") ?? AI_VOICES[0].id
    }
    if let v = UserDefaults.standard.string(forKey: "askai.voice.\(agent.id)"), !v.isEmpty { return v }
    if agent.is_supervisor == true {
        return UserDefaults.standard.string(forKey: "askai.voice.main") ?? AI_VOICES[0].id
    }
    let idx = abs(agent.id.hashValue) % AI_VOICES.count
    return AI_VOICES[idx].id
}

// MARK: - Call engine

/// Live speech↔speech loop: mic → on-device transcription → agent brain (full
/// tools) → ElevenLabs voice (premium iOS voice as fallback) → back to the mic.
@MainActor
final class VoiceCall: NSObject, ObservableObject {
    enum Phase { case connecting, listening, thinking, speaking }
    @Published var phase: Phase = .connecting
    @Published var transcript = ""
    @Published var lastReply = ""
    @Published var speaker = "AskAI"
    @Published var level: CGFloat = 0.1
    @Published var muted = false
    @Published var invited: [Agent] = []
    @Published var errorText: String?

    private weak var app: AppState?
    private let engine = AVAudioEngine()
    private let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US"))
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private var player: AVAudioPlayer?
    private var synth = AVSpeechSynthesizer()
    private var watchdog: Timer?
    private var lastHeard = Date()
    private var running = false
    private var history: [[String: Any]] = []
    private var playContinuation: CheckedContinuation<Void, Never>?

    private var elKey: String { UserDefaults.standard.string(forKey: "askai.elkey") ?? "" }

    func start(app: AppState) {
        self.app = app
        running = true
        synth.delegate = self
        SFSpeechRecognizer.requestAuthorization { auth in
            DispatchQueue.main.async {
                guard auth == .authorized else { self.errorText = "Enable Speech Recognition in Settings to use voice."; return }
                AVAudioSession.sharedInstance().requestRecordPermission { ok in
                    DispatchQueue.main.async {
                        guard ok else { self.errorText = "Enable the microphone in Settings to use voice."; return }
                        self.beginListening()
                    }
                }
            }
        }
    }

    func end() {
        running = false
        stopListening()
        player?.stop()
        synth.stopSpeaking(at: .immediate)
        playContinuation?.resume(); playContinuation = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        phase = .connecting
    }

    func toggleMute() {
        muted.toggle()
        if muted { stopListening(); phase = .connecting }
        else if phase != .speaking && phase != .thinking { beginListening() }
    }

    // MARK: Listening

    private func beginListening() {
        guard running, !muted else { return }
        transcript = ""
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playAndRecord, mode: .voiceChat,
                                    options: [.defaultToSpeaker, .allowBluetooth])
            try session.setActive(true, options: .notifyOthersOnDeactivation)

            let req = SFSpeechAudioBufferRecognitionRequest()
            req.shouldReportPartialResults = true
            request = req
            let input = engine.inputNode
            let format = input.outputFormat(forBus: 0)
            input.removeTap(onBus: 0)
            input.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
                self?.request?.append(buffer)
                // Mic level for the orb animation.
                if let data = buffer.floatChannelData?[0] {
                    let n = Int(buffer.frameLength)
                    var sum: Float = 0
                    for i in 0..<n { sum += data[i] * data[i] }
                    let rms = sqrt(sum / Float(max(n, 1)))
                    DispatchQueue.main.async { self?.level = CGFloat(min(1, rms * 14)) }
                }
            }
            engine.prepare()
            try engine.start()
            lastHeard = Date()
            phase = .listening

            task = recognizer?.recognitionTask(with: req) { [weak self] result, err in
                guard let self else { return }
                if let r = result {
                    DispatchQueue.main.async {
                        let text = r.bestTranscription.formattedString
                        if text != self.transcript { self.transcript = text; self.lastHeard = Date() }
                    }
                }
                if err != nil { DispatchQueue.main.async { self.restartIfIdle() } }
            }

            watchdog?.invalidate()
            watchdog = Timer.scheduledTimer(withTimeInterval: 0.35, repeats: true) { [weak self] _ in
                Task { @MainActor in self?.checkSilence() }
            }
        } catch {
            errorText = "Couldn't start the microphone."
        }
    }

    private func checkSilence() {
        guard phase == .listening else { return }
        let quiet = Date().timeIntervalSince(lastHeard)
        let text = transcript.trimmingCharacters(in: .whitespacesAndNewlines)
        if !text.isEmpty && quiet > 1.3 {
            finishUtterance(text)
        }
    }

    private func stopListening() {
        watchdog?.invalidate(); watchdog = nil
        task?.cancel(); task = nil
        request?.endAudio(); request = nil
        engine.inputNode.removeTap(onBus: 0)
        engine.stop()
    }

    private func restartIfIdle() {
        guard running, phase == .listening else { return }
        stopListening()
        beginListening()
    }

    // MARK: Turn-taking

    private func finishUtterance(_ text: String) {
        stopListening()
        phase = .thinking
        level = 0.1
        Task { await respond(to: text) }
    }

    private func respond(to text: String) async {
        guard let app else { return }
        history.append(["role": "user", "content": text])
        let agent = pickAgent(for: text, app: app)
        speaker = agent?.name ?? app.agents.first(where: { $0.is_supervisor == true })?.name ?? "AskAI"
        let answer = await app.voiceAnswer(history: history, agent: agent)
        guard running else { return }
        history.append(["role": "assistant", "content": answer])
        if history.count > 16 { history.removeFirst(history.count - 16) }
        lastReply = answer
        await speak(answer, voice: voiceId(for: agent))
        if running && !muted { beginListening() }
    }

    /// Route to an invited/named agent when the user addresses one by name.
    private func pickAgent(for text: String, app: AppState) -> Agent? {
        let lc = text.lowercased()
        let pool = invited.isEmpty ? app.agents : invited + app.agents
        if let named = pool.first(where: { !$0.name.isEmpty && lc.contains($0.name.lowercased()) }) {
            return named
        }
        return app.agents.first(where: { $0.is_supervisor == true })
    }

    // MARK: Speaking

    private func speak(_ text: String, voice: String) async {
        phase = .speaking
        let clean = String(text.replacingOccurrences(of: "*", with: "")
                               .replacingOccurrences(of: "#", with: "").prefix(900))
        if let data = await elevenTTS(clean, voice: voice) {
            await playAudio(data)
        } else {
            await speakFallback(clean)
        }
    }

    private func elevenTTS(_ text: String, voice: String) async -> Data? {
        guard !elKey.isEmpty,
              let url = URL(string: "https://api.elevenlabs.io/v1/text-to-speech/\(voice)?output_format=mp3_44100_128") else { return nil }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue(elKey, forHTTPHeaderField: "xi-api-key")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.timeoutInterval = 30
        // Flash v2.5 — half-price per character, fast, still very realistic.
        let body: [String: Any] = [
            "text": text,
            "model_id": "eleven_flash_v2_5",
            "voice_settings": ["stability": 0.5, "similarity_boost": 0.75]
        ]
        req.httpBody = try? JSONSerialization.data(withJSONObject: body)
        guard let (d, r) = try? await URLSession.shared.data(for: req),
              let h = r as? HTTPURLResponse, (200..<300).contains(h.statusCode), d.count > 800 else { return nil }
        return d
    }

    private func playAudio(_ data: Data) async {
        await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
            playContinuation = cont
            do {
                player = try AVAudioPlayer(data: data)
                player?.delegate = self
                player?.play()
            } catch {
                playContinuation = nil
                cont.resume()
            }
        }
    }

    /// Fallback: the most natural voice installed on the phone (premium Siri-era
    /// voices when available — never the robotic default).
    private func speakFallback(_ text: String) async {
        let voices = AVSpeechSynthesisVoice.speechVoices().filter { $0.language.hasPrefix("en") }
        let best = voices.first { $0.quality == .premium } ?? voices.first { $0.quality == .enhanced } ?? voices.first
        let u = AVSpeechUtterance(string: text)
        u.voice = best
        u.rate = AVSpeechUtteranceDefaultSpeechRate
        await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
            playContinuation = cont
            synth.speak(u)
        }
    }
}

extension VoiceCall: AVAudioPlayerDelegate, AVSpeechSynthesizerDelegate {
    nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        Task { @MainActor in self.playContinuation?.resume(); self.playContinuation = nil }
    }
    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        Task { @MainActor in self.playContinuation?.resume(); self.playContinuation = nil }
    }
    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        Task { @MainActor in self.playContinuation?.resume(); self.playContinuation = nil }
    }
}

// MARK: - Call screen (ChatGPT-style)

struct VoiceCallView: View {
    @EnvironmentObject var app: AppState
    @Environment(\.dismiss) private var dismiss
    @StateObject private var call = VoiceCall()
    @State private var showInvite = false
    @State private var pulse = false

    var body: some View {
        ZStack {
            Theme.ink.ignoresSafeArea()

            VStack(spacing: 24) {
                Spacer()

                // The orb — breathes while idle, swells with your voice.
                ZStack {
                    Circle().fill(orbColor.opacity(0.16))
                        .frame(width: 260, height: 260)
                        .scaleEffect(orbScale * (pulse ? 1.04 : 0.96))
                    Circle().fill(orbColor.opacity(0.28))
                        .frame(width: 190, height: 190)
                        .scaleEffect(orbScale)
                    Circle().fill(orbColor)
                        .frame(width: 130, height: 130)
                        .scaleEffect(0.9 + call.level * 0.35)
                        .shadow(color: orbColor.opacity(0.45), radius: 30)
                    if call.phase == .thinking {
                        ProgressView().tint(.white).scaleEffect(1.3)
                    }
                }
                .animation(.easeOut(duration: 0.12), value: call.level)
                .animation(.spring(response: 0.5, dampingFraction: 0.7), value: call.phase)
                .onAppear {
                    withAnimation(.easeInOut(duration: 1.8).repeatForever(autoreverses: true)) { pulse = true }
                }

                VStack(spacing: 8) {
                    Text(statusTitle)
                        .font(.title3.weight(.semibold)).foregroundStyle(Theme.text)
                        .contentTransition(.opacity)
                    Text(subtitle)
                        .font(.subheadline).foregroundStyle(Theme.muted)
                        .lineLimit(3).multilineTextAlignment(.center)
                        .padding(.horizontal, 32)
                        .animation(.easeInOut(duration: 0.2), value: subtitle)
                }

                if !call.invited.isEmpty {
                    HStack(spacing: -8) {
                        ForEach(call.invited.prefix(5)) { a in
                            AgentAvatar(name: a.name, color: a.avatar_color, size: 30,
                                        online: true, spark: false, imageURL: a.avatar_url)
                                .overlay(Circle().stroke(Theme.ink, lineWidth: 2))
                        }
                        Text("  in the call").font(.caption).foregroundStyle(Theme.muted)
                    }
                }

                if let e = call.errorText {
                    Text(e).font(.footnote).foregroundStyle(Theme.bad)
                        .multilineTextAlignment(.center).padding(.horizontal, 30)
                }

                Spacer()

                // Controls: invite · mute · end
                HStack(spacing: 26) {
                    Button { Haptic.light(); showInvite = true } label: {
                        Image(systemName: "person.badge.plus")
                            .font(.system(size: 20, weight: .semibold)).foregroundStyle(Theme.text)
                            .frame(width: 58, height: 58).glassCircle()
                    }
                    Button { Haptic.medium(); call.toggleMute() } label: {
                        Image(systemName: call.muted ? "mic.slash.fill" : "mic.fill")
                            .font(.system(size: 20, weight: .semibold))
                            .foregroundStyle(call.muted ? Theme.bad : Theme.text)
                            .frame(width: 58, height: 58).glassCircle()
                    }
                    Button { Haptic.rigid(); call.end(); dismiss() } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 21, weight: .bold)).foregroundStyle(.white)
                            .frame(width: 58, height: 58)
                            .background(Theme.bad, in: Circle())
                            .shadow(color: Theme.bad.opacity(0.4), radius: 12, y: 4)
                    }
                }
                .padding(.bottom, 34)
            }
        }
        .onAppear { call.start(app: app) }
        .onDisappear { call.end() }
        .sheet(isPresented: $showInvite) {
            NavigationStack {
                List {
                    ForEach(app.agents) { a in
                        Button {
                            if call.invited.contains(where: { $0.id == a.id }) {
                                call.invited.removeAll { $0.id == a.id }
                            } else {
                                call.invited.append(a)
                            }
                            Haptic.selection()
                        } label: {
                            HStack(spacing: 12) {
                                AgentAvatar(name: a.name, color: a.avatar_color, size: 38,
                                            online: a.status != "paused", spark: a.is_supervisor == true,
                                            imageURL: a.avatar_url)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(a.name).foregroundStyle(Theme.text).fontWeight(.semibold)
                                    Text(voiceName(for: a)).font(.caption).foregroundStyle(Theme.muted)
                                }
                                Spacer()
                                if call.invited.contains(where: { $0.id == a.id }) {
                                    Image(systemName: "checkmark.circle.fill").foregroundStyle(Theme.blue)
                                }
                            }
                        }
                    }
                }
                .navigationTitle("Invite to call")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { showInvite = false } } }
            }
            .presentationDetents([.medium, .large])
        }
    }

    private var orbColor: Color {
        switch call.phase {
        case .listening: return Theme.blue
        case .thinking: return Theme.muted
        case .speaking: return Theme.accent
        case .connecting: return Theme.muted.opacity(0.7)
        }
    }
    private var orbScale: CGFloat { call.phase == .speaking ? 1.06 : 1 }

    private var statusTitle: String {
        switch call.phase {
        case .connecting: return call.muted ? "Muted" : "Connecting…"
        case .listening: return "Listening"
        case .thinking: return "Thinking…"
        case .speaking: return call.speaker
        }
    }
    private var subtitle: String {
        switch call.phase {
        case .listening: return call.transcript.isEmpty ? "Go ahead, I'm with you." : call.transcript
        case .thinking: return call.transcript
        case .speaking: return call.lastReply
        case .connecting: return call.muted ? "Tap the mic to talk again." : "Setting up your voice…"
        }
    }

    private func voiceName(for a: Agent) -> String {
        let id = voiceId(for: a)
        return "Voice: " + (AI_VOICES.first { $0.id == id }?.name ?? "Custom")
    }
}
