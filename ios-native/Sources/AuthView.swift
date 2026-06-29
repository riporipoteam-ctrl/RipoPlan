import SwiftUI

struct AuthView: View {
    @EnvironmentObject var app: AppState
    @State private var isSignUp = false
    @State private var email = ""
    @State private var password = ""
    @State private var busy = false
    @State private var error: String?
    @FocusState private var focus: Field?
    enum Field { case email, password }

    var body: some View {
        ZStack {
            AuroraBackground()
            ScrollView {
                VStack(spacing: 22) {
                    Spacer(minLength: 60)
                    RoundedRectangle(cornerRadius: 28, style: .continuous)
                        .fill(.ultraThinMaterial)
                        .frame(width: 96, height: 96)
                        .overlay(SparkMark(size: 50))
                        .shadow(color: Theme.accent.opacity(0.4), radius: 24, y: 12)
                    VStack(spacing: 6) {
                        Text("AskAI").font(.system(size: 32, weight: .heavy, design: .rounded))
                            .foregroundStyle(Theme.accentGradient)
                        Text("Your team of autonomous AI agents")
                            .font(.subheadline).foregroundStyle(Theme.muted)
                    }

                    VStack(spacing: 12) {
                        field(icon: "envelope.fill", placeholder: "Email", text: $email, secure: false)
                            .focused($focus, equals: .email)
                            .keyboardType(.emailAddress)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                        field(icon: "lock.fill", placeholder: "Password", text: $password, secure: true)
                            .focused($focus, equals: .password)

                        if let error {
                            Text(error).font(.footnote).foregroundStyle(Theme.bad)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }

                        Button(action: submit) {
                            HStack {
                                if busy { ProgressView().tint(.white) }
                                Text(isSignUp ? "Create account" : "Sign in").fontWeight(.bold)
                            }
                            .frame(maxWidth: .infinity).padding(.vertical, 15)
                            .background(Theme.accentGradient, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                            .foregroundStyle(.white)
                        }
                        .pressable()
                        .disabled(busy || email.isEmpty || password.count < 6)
                        .opacity((email.isEmpty || password.count < 6) ? 0.6 : 1)
                    }
                    .glass(radius: 26, padding: 18)
                    .padding(.horizontal, 18)

                    Button {
                        Haptic.selection(); withAnimation { isSignUp.toggle(); error = nil }
                    } label: {
                        Text(isSignUp ? "Already have an account? Sign in" : "New here? Create an account")
                            .font(.footnote).foregroundStyle(Theme.muted)
                    }
                    Spacer(minLength: 30)
                }
            }
        }
    }

    @ViewBuilder
    private func field(icon: String, placeholder: String, text: Binding<String>, secure: Bool) -> some View {
        HStack(spacing: 10) {
            Image(systemName: icon).foregroundStyle(Theme.muted).frame(width: 20)
            if secure {
                SecureField(placeholder, text: text).foregroundStyle(Theme.text)
            } else {
                TextField(placeholder, text: text).foregroundStyle(Theme.text)
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 13)
        .background(Color.white.opacity(0.05), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(Theme.stroke, lineWidth: 1))
    }

    private func submit() {
        Haptic.medium(); busy = true; error = nil; focus = nil
        Task {
            do {
                if isSignUp { try await app.signUp(email: email, password: password) }
                else { try await app.signIn(email: email, password: password) }
                Haptic.success()
            } catch {
                self.error = error.localizedDescription
                Haptic.warning()
            }
            busy = false
        }
    }
}
