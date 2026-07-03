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
    // Stable hash (String.hashValue is randomized per launch — voices would
    // change every time the app opened).
    let h = agent.id.unicodeScalars.reduce(5381) { ($0 << 5) &+ $0 &+ Int($1.value) }
    let idx = abs(h) % AI_VOICES.count
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
    private var turns: [(speaker: String, text: String, isUser: Bool)] = []
    private var playContinuation: CheckedContinuation<Void, Never>?
    let camera = CameraFeed()

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
        camera.stop()
        player?.stop()
        synth.stopSpeaking(at: .immediate)
        playContinuation?.resume(); playContinuation = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        phase = .connecting
        // Save the conversation as a normal text chat.
        let t = turns; turns = []
        if let appRef = app, !t.isEmpty {
            Task { await appRef.saveVoiceCall(t) }
        }
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
            req.taskHint = .dictation
            if #available(iOS 16.0, *) { req.addsPunctuation = true }
            req.requiresOnDeviceRecognition = false   // server recognition = much better accuracy
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
        turns.append(("You", text, true))
        var content = text
        // Live camera: let the agent SEE — but never let a slow upload/vision
        // call hang the whole call (hard 10s budget, then skip).
        if camera.running, let jpeg = camera.snapshotJPEG() {
            let seen: String? = await withTimeout(10) {
                guard let att = await app.upload(data: jpeg, ext: "jpg", contentType: "image/jpeg", name: "camera.jpg") else { return nil }
                return await AgentRunner.viewImage(att.url, "In 1-2 sentences: what is visible in this live camera view?")
            }
            if let seen, !seen.isEmpty { content += "\n[Live camera right now: \(seen)]" }
        }
        history.append(["role": "user", "content": content])

        // One or SEVERAL agents can answer (say their names, or "everyone").
        let responders = pickAgents(for: text, app: app)
        for (i, agent) in responders.enumerated() {
            guard running else { return }
            if i > 0 { phase = .thinking }
            speaker = agent?.name ?? "AskAI"
            let answer = await app.voiceAnswer(history: history, agent: agent)
            guard running else { return }
            let final = answer.isEmpty ? "Sorry, say that again?" : answer
            history.append(["role": "assistant", "content": responders.count > 1 ? "\(speaker): \(final)" : final])
            lastReply = final
            turns.append((speaker, final, false))
            await speak(final, voice: voiceId(for: agent))
        }
        if history.count > 16 { history.removeFirst(history.count - 16) }
        if running && !muted { beginListening() }
    }

    /// Who should answer: agents named in the utterance (auto-invited, up to 3),
    /// "everyone/team" → all invited agents, otherwise the chief.
    private func pickAgents(for text: String, app: AppState) -> [Agent?] {
        let lc = text.lowercased()
        var named = app.agents.filter { !$0.name.isEmpty && lc.contains($0.name.lowercased()) }
        if named.isEmpty, !invited.isEmpty,
           lc.contains("everyone") || lc.contains("all of you") || lc.contains("you all") || lc.contains("the team") {
            named = invited
        }
        guard !named.isEmpty else {
            return [app.agents.first(where: { $0.is_supervisor == true })]
        }
        for a in named where !invited.contains(where: { $0.id == a.id }) { invited.append(a) }
        return Array(named.prefix(3)).map { Optional($0) }
    }

    /// Run an async job with a hard timeout; nil if it doesn't finish in time.
    private func withTimeout<T: Sendable>(_ seconds: Double, _ op: @escaping @Sendable () async -> T?) async -> T? {
        await withTaskGroup(of: T?.self) { group in
            group.addTask { await op() }
            group.addTask {
                try? await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
                return nil
            }
            let first = await group.next() ?? nil
            group.cancelAll()
            return first
        }
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
              let url = URL(string: "https://api.elevenlabs.io/v1/text-to-speech/\(voice)?output_format=mp3_44100_128&optimize_streaming_latency=4") else { return nil }
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

// MARK: - Live camera feed (the agent can see what you see)

/// Lock-protected latest camera frame (written on the capture queue, read on main).
final class FrameStore: @unchecked Sendable {
    private let lock = NSLock()
    private var img: UIImage?
    private var last = Date.distantPast
    func shouldConvert() -> Bool {
        lock.lock(); defer { lock.unlock() }
        guard Date().timeIntervalSince(last) > 1 else { return false }   // ~1 fps is plenty
        last = Date(); return true
    }
    func set(_ i: UIImage) { lock.lock(); img = i; lock.unlock() }
    func get() -> UIImage? { lock.lock(); defer { lock.unlock() }; return img }
}

final class CameraFeed: NSObject, ObservableObject {
    let session = AVCaptureSession()
    @Published var running = false
    private let output = AVCaptureVideoDataOutput()
    private var configured = false
    private let store = FrameStore()
    private let q = DispatchQueue(label: "askai.cam.session")

    func start() {
        AVCaptureDevice.requestAccess(for: .video) { ok in
            guard ok else { return }
            self.q.async {
                if !self.configured {
                    self.configured = true
                    self.session.sessionPreset = .medium
                    if let dev = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back),
                       let input = try? AVCaptureDeviceInput(device: dev), self.session.canAddInput(input) {
                        self.session.addInput(input)
                    }
                    self.output.setSampleBufferDelegate(self, queue: DispatchQueue(label: "askai.cam.frames"))
                    if self.session.canAddOutput(self.output) { self.session.addOutput(self.output) }
                }
                self.session.startRunning()
                DispatchQueue.main.async { self.running = true }
            }
        }
    }

    func stop() {
        q.async { self.session.stopRunning() }
        DispatchQueue.main.async { self.running = false }
    }

    func snapshotJPEG() -> Data? {
        guard let img = store.get() else { return nil }
        // Small + fast — the vision model doesn't need full resolution.
        let maxSide: CGFloat = 900
        let scale = min(1, maxSide / max(img.size.width, img.size.height))
        if scale >= 1 { return img.jpegData(compressionQuality: 0.5) }
        let size = CGSize(width: img.size.width * scale, height: img.size.height * scale)
        let fmt = UIGraphicsImageRendererFormat.default(); fmt.scale = 1
        let small = UIGraphicsImageRenderer(size: size, format: fmt).image { _ in
            img.draw(in: CGRect(origin: .zero, size: size))
        }
        return small.jpegData(compressionQuality: 0.5)
    }
}

extension CameraFeed: AVCaptureVideoDataOutputSampleBufferDelegate {
    func captureOutput(_ o: AVCaptureOutput, didOutput sb: CMSampleBuffer, from c: AVCaptureConnection) {
        guard store.shouldConvert(), let pb = CMSampleBufferGetImageBuffer(sb) else { return }
        let ci = CIImage(cvPixelBuffer: pb)
        let ctx = CIContext(options: [.useSoftwareRenderer: false])
        guard let cg = ctx.createCGImage(ci, from: ci.extent) else { return }
        store.set(UIImage(cgImage: cg))
    }
}

/// Camera preview layer host.
struct CameraPreview: UIViewRepresentable {
    let session: AVCaptureSession
    final class PreviewView: UIView {
        override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
    }
    func makeUIView(context: Context) -> PreviewView {
        let v = PreviewView()
        if let layer = v.layer as? AVCaptureVideoPreviewLayer {
            layer.session = session
            layer.videoGravity = .resizeAspectFill
        }
        return v
    }
    func updateUIView(_ v: PreviewView, context: Context) {}
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

                // The orb — a living liquid-glass sphere: swirling color core
                // under a REAL glass shell, breathing, swelling with your voice.
                VoiceOrb(color: orbColor, level: call.level, thinking: call.phase == .thinking)
                    .animation(.easeOut(duration: 0.12), value: call.level)
                    .animation(.spring(response: 0.5, dampingFraction: 0.7), value: call.phase)

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

                // Controls: invite · camera · mute · end
                HStack(spacing: 22) {
                    Button { Haptic.light(); showInvite = true } label: {
                        Image(systemName: "person.badge.plus")
                            .font(.system(size: 20, weight: .semibold)).foregroundStyle(Theme.text)
                            .frame(width: 58, height: 58).glassCircle()
                    }
                    CameraToggleButton(cam: call.camera)
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
        .overlay(alignment: .topTrailing) { CameraDock(cam: call.camera) }
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

/// Camera on/off button for the call controls.
struct CameraToggleButton: View {
    @ObservedObject var cam: CameraFeed
    var body: some View {
        Button {
            Haptic.medium()
            if cam.running { cam.stop() } else { cam.start() }
        } label: {
            Image(systemName: cam.running ? "video.fill" : "video")
                .font(.system(size: 19, weight: .semibold))
                .foregroundStyle(cam.running ? Theme.blue : Theme.text)
                .frame(width: 58, height: 58).glassCircle()
        }
    }
}

/// Floating live camera preview while the agent can see.
struct CameraDock: View {
    @ObservedObject var cam: CameraFeed
    var body: some View {
        if cam.running {
            VStack(spacing: 6) {
                CameraPreview(session: cam.session)
                    .frame(width: 118, height: 158)
                    .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(Theme.stroke, lineWidth: 1))
                    .shadow(color: .black.opacity(0.25), radius: 12, y: 6)
                HStack(spacing: 4) {
                    Circle().fill(Theme.blue).frame(width: 6, height: 6)
                    Text("AI can see").font(.caption2.weight(.semibold)).foregroundStyle(Theme.muted)
                }
            }
            .padding(.top, 18).padding(.trailing, 16)
            .transition(.scale.combined(with: .opacity))
        }
    }
}

/// Living liquid-glass orb: a swirling color core, soft aura, and a REAL
/// Liquid Glass shell (iOS 26 glassEffect) floating on top.
struct VoiceOrb: View {
    var color: Color
    var level: CGFloat
    var thinking: Bool
    @State private var spin = false
    @State private var breathe = false

    var body: some View {
        ZStack {
            // Aura
            Circle().fill(color.opacity(0.20))
                .frame(width: 280, height: 280)
                .blur(radius: 34)
                .scaleEffect(breathe ? 1.10 : 0.92)
            // Swirling liquid core
            Circle()
                .fill(AngularGradient(colors: [color, color.opacity(0.35), Color.white.opacity(0.75), color],
                                      center: .center))
                .frame(width: 175, height: 175)
                .blur(radius: 16)
                .rotationEffect(.degrees(spin ? 360 : 0))
                .scaleEffect(0.9 + level * 0.4)
            // Counter-rotating inner swirl for depth
            Circle()
                .fill(AngularGradient(colors: [Color.white.opacity(0.0), Color.white.opacity(0.5), Color.white.opacity(0.0)],
                                      center: .center))
                .frame(width: 120, height: 120)
                .blur(radius: 10)
                .rotationEffect(.degrees(spin ? -360 : 0))
                .scaleEffect(0.9 + level * 0.3)
            // REAL Liquid Glass shell over the liquid
            Color.clear
                .frame(width: 195, height: 195)
                .glassCircle()
                .scaleEffect((breathe ? 1.02 : 0.98) + level * 0.12)
            if thinking {
                ProgressView().tint(.white).scaleEffect(1.3)
            }
        }
        .onAppear {
            withAnimation(.linear(duration: 7).repeatForever(autoreverses: false)) { spin = true }
            withAnimation(.easeInOut(duration: 2.1).repeatForever(autoreverses: true)) { breathe = true }
        }
    }
}
