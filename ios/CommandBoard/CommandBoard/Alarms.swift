import Foundation
import UserNotifications

/// PAR and elapsed-time alarms that sound even when the iPad is locked or another app is open.
/// The board sends the full list whenever it changes; this replaces what is scheduled.
enum Alarms {
    static let prefix = "cb-alarm-"

    static func ask() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { _, _ in }
    }

    static func schedule(_ items: [[String: Any]]) {
        let c = UNUserNotificationCenter.current()
        c.getPendingNotificationRequests { pending in
            c.removePendingNotificationRequests(withIdentifiers: pending.map(\.identifier).filter { $0.hasPrefix(prefix) })
            for it in items.prefix(40) {
                guard let id = it["id"] as? String, let at = it["at"] as? Double else { continue }
                let secs = at / 1000 - Date().timeIntervalSince1970
                guard secs > 1 else { continue }
                let n = UNMutableNotificationContent()
                n.title = it["title"] as? String ?? "Command Board"
                n.body = it["body"] as? String ?? ""
                n.sound = .default
                n.interruptionLevel = (it["sound"] as? String) == "soft" ? .active : .timeSensitive
                c.add(UNNotificationRequest(identifier: prefix + id, content: n, trigger: UNTimeIntervalNotificationTrigger(timeInterval: secs, repeats: false)))
            }
        }
    }

    static func clear() {
        let c = UNUserNotificationCenter.current()
        c.getPendingNotificationRequests { p in c.removePendingNotificationRequests(withIdentifiers: p.map(\.identifier).filter { $0.hasPrefix(prefix) }) }
    }
}

/// Show alarms as banners even while the app is open (the board shows its own prompt too).
final class NotificationDelegate: NSObject, UNUserNotificationCenterDelegate {
    static let shared = NotificationDelegate()
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        [.banner, .sound, .list]
    }
}
