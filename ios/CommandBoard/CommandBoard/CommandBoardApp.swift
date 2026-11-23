import SwiftUI
import UserNotifications

@main
struct CommandBoardApp: App {
    @StateObject private var store = SessionStore.shared

    init() { UNUserNotificationCenter.current().delegate = NotificationDelegate.shared }

    var body: some Scene {
        WindowGroup {
            Group {
                if store.session != nil { BoardScreen() } else { SignInView() }
            }
            .environmentObject(store)
            .tint(Theme.gold)
            .preferredColorScheme(.dark)
            .statusBarHidden(false)
        }
    }
}
