import SwiftUI

struct ActivityView: View {
    @EnvironmentObject var app: AppState
    @Environment(\.dismiss) private var dismiss
    @State private var requesting = false

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.backdrop.ignoresSafeArea()
                ScrollView {
                    VStack(spacing: 14) {
                        briefingCard
                        if app.notifications.isEmpty {
                            VStack(spacing: 10) {
                                Image(systemName: "bell.slash").font(.largeTitle).foregroundStyle(Theme.muted)
                                Text("No activity yet").foregroundStyle(Theme.muted)
                            }.padding(.top, 40)
                        } else {
                            VStack(spacing: 10) {
                                ForEach(app.notifications) { n in NotifRow(notif: n) }
                            }
                        }
                        Spacer(minLength: 100)
                    }
                    .padding(16)
                }
                .refreshable { await app.loadNotifications() }
            }
            .navigationTitle("Activity")
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } } }
            .task {
                await app.loadNotifications()
                try? await Task.sleep(nanoseconds: 1_200_000_000)
                await app.markNotificationsRead()
            }
        }
    }

    private var briefingCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Image(systemName: "sun.max.fill").foregroundStyle(Theme.warn)
                Text("Daily briefing").font(.headline).foregroundStyle(Theme.text)
                Spacer()
            }
            Text("Ask your Chief of Staff to round up recent tasks, results, and what needs your attention.")
                .font(.subheadline).foregroundStyle(Theme.muted)
            Button {
                Haptic.medium(); requesting = true
                Task {
                    _ = await app.send("Give me my daily briefing: summarize recent chats, what our agents have completed, anything still running, and what needs my attention.")
                    requesting = false
                    NotifManager.shared.notify(title: "Briefing requested", body: "Your Chief of Staff is preparing your daily briefing.")
                }
            } label: {
                HStack { if requesting { ProgressView().tint(Theme.onAccent) }; Text("Get my briefing").fontWeight(.semibold) }
                    .frame(maxWidth: .infinity).padding(.vertical, 12)
                    .background(Theme.accent, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .foregroundStyle(Theme.onAccent)
            }.pressable().disabled(requesting)
        }
        .glass(radius: 20)
    }
}

struct NotifRow: View {
    let notif: Notif
    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Circle().fill((notif.read ?? false) ? Theme.muted.opacity(0.4) : Theme.accent)
                .frame(width: 9, height: 9).padding(.top, 5)
            VStack(alignment: .leading, spacing: 3) {
                Text(notif.title ?? "Update").font(.subheadline.bold()).foregroundStyle(Theme.text)
                if let b = notif.body, !b.isEmpty {
                    Text(b).font(.subheadline).foregroundStyle(Theme.muted).lineLimit(3)
                }
            }
            Spacer()
            Text(RelTime.ago(notif.created_at)).font(.caption2).foregroundStyle(Theme.muted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .glass(radius: 16, padding: 14)
    }
}
